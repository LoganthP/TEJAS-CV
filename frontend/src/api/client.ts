// Browser requests use the deployment's public /api routes (or Vite's local proxy).
// Service bindings are server-side runtime values and cannot be used here.
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export interface RequestCustomOptions extends RequestInit {
  timeoutMs?: number;
}

// Diagnostics metrics tracking
let inFlightCount = 0;
let lastLatencyMs: number | null = null;
const metricsListeners = new Set<() => void>();

function notifyMetricsListeners() {
  metricsListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

export function getClientDiagnostics() {
  return {
    apiUrl: API_URL || window.location.origin,
    inFlightRequests: inFlightCount,
    lastLatencyMs,
  };
}

export function subscribeClientDiagnostics(cb: () => void) {
  metricsListeners.add(cb);
  return () => {
    metricsListeners.delete(cb);
  };
}

export const AUTH_TOKEN_KEY = "tejas_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function request<T>(
  endpoint: string,
  options: RequestCustomOptions = {}
): Promise<T> {
  const normEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const primaryUrl = API_URL ? `${API_URL}${normEndpoint}` : normEndpoint;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  
  // Attach token if present
  const token = getAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // Only set Content-Type to JSON if body is not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Timeout controller (30 mins for file uploads, 30s default)
  const timeoutMs = options.timeoutMs ?? (options.body instanceof FormData ? 1_800_000 : 30_000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs / 1000}s`));
  }, timeoutMs);

  // If user provided a signal, link it
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  const startTime = performance.now();
  inFlightCount++;
  notifyMetricsListeners();

  let response: Response;
  try {
    try {
      response = await fetch(primaryUrl, {
        ...options,
        signal: controller.signal,
        credentials: "include",
        headers,
      });
    } catch (initialErr: any) {
      if (initialErr?.name === "AbortError" || controller.signal.aborted) {
        throw new ApiError(504, `Request timed out after ${timeoutMs / 1000}s`);
      }

      throw new ApiError(0, initialErr?.message || "Assurance Core Offline / Network Error");
    }

    lastLatencyMs = Math.round(performance.now() - startTime);
  } finally {
    clearTimeout(timeoutId);
    inFlightCount = Math.max(0, inFlightCount - 1);
    notifyMetricsListeners();
  }

  if (!response.ok) {
    if (response.status === 401 && token && token === getAuthToken() &&
        !normEndpoint.startsWith("/api/auth/") && typeof window !== "undefined") {
      // One failed resource request is not proof that the current session expired.
      // Let AuthProvider verify it; old requests must not clear a newer login.
      window.dispatchEvent(new CustomEvent("tejas:auth-check", { detail: { token } }));
    }

    const errorText = await response.text();
    let errorData: any = errorText;
    try {
      errorData = JSON.parse(errorText);
    } catch {}
    
    let message = `Request failed with status ${response.status}`;
    if (errorData) {
      if (typeof errorData === "string") {
        message = /<(!doctype|html|body)/i.test(errorData)
          ? `The API is unavailable (HTTP ${response.status}). Please retry.`
          : errorData;
      } else if (Array.isArray(errorData.detail)) {
        message = errorData.detail
          .map((d: any) =>
            typeof d === "object"
              ? `${d.loc ? d.loc.filter((x: any) => x !== "body").join(".") + ": " : ""}${d.msg}`
              : String(d)
          )
          .join(", ");
      } else if (typeof errorData.detail === "string") {
        message = errorData.detail;
      } else if (typeof errorData.detail === "object" && errorData.detail !== null) {
        message = JSON.stringify(errorData.detail);
      } else if (errorData.message) {
        message = errorData.message;
      }
    }

    if (response.status === 403 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("tejas:forbidden", { detail: { message } }));
    }

    throw new ApiError(response.status, message, errorData);
  }

  // Check if empty response (e.g. 204)
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("text/html")) {
    throw new ApiError(502, "The API returned a web page instead of data. Check the backend routing and deployment.");
  }
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}
