import { request, API_URL, ApiError, getAuthToken } from "./client";
import {
  Asset,
  AuditBlock,
  AuthStatus,
  Baseline,
  ChainVerification,
  Contributor,
  DashboardSummary,
  Finding,
  InferenceChainVerification,
  InferenceRecord,
  Job,
  JobEvent,
  JobSummary,
  MeResponse,
  MerkleProofResponse,
  ProvenanceGraphData,
  SampleDetails,
  Scenario,
  SystemStatus,
  TestPackCase,
  TrustedModel,
  User,
} from "../types/api";

// Auth
export const getAuthStatus = () => request<AuthStatus>("/api/auth/status");
export const signup = (body: any) => request<any>("/api/auth/signup", { method: "POST", body: JSON.stringify(body) });
export const login = (body: any) => request<any>("/api/auth/login", { method: "POST", body: JSON.stringify(body) });
export const logout = () => request<any>("/api/auth/logout", { method: "POST" });
export const getMe = () => request<MeResponse>("/api/auth/me");
export const editProfile = (body: { display_name?: string; email?: string; unit?: string }) =>
  request<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) });
export const requestRoleChange = (body: { role: string; note?: string }) =>
  request<User>("/api/auth/me/role-request", { method: "POST", body: JSON.stringify(body) });
export const cancelRoleChange = () =>
  request<User>("/api/auth/me/role-request", { method: "DELETE" });
export const changePassword = (body: any) => request<any>("/api/auth/password", { method: "POST", body: JSON.stringify(body) });

// Admin Users & Access Requests
export const getUsers = () => request<User[]>("/api/auth/users");
export const createUser = (body: any) => request<User>("/api/auth/users", { method: "POST", body: JSON.stringify(body) });
export const updateUser = (id: string, body: any) => request<User>(`/api/auth/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) });
export const resetUserPassword = (id: string, body: any) => request<any>(`/api/auth/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: JSON.stringify(body) });
export const getRequests = (status = "pending") => request<User[]>(`/api/auth/requests?status=${encodeURIComponent(status)}`);
export const approveRequest = (userId: string, body: { role: string; note?: string }) => request<User>(`/api/auth/requests/${encodeURIComponent(userId)}/approve`, { method: "POST", body: JSON.stringify(body) });
export const rejectRequest = (userId: string, body?: { note?: string }) => request<User>(`/api/auth/requests/${encodeURIComponent(userId)}/reject`, { method: "POST", body: JSON.stringify(body || {}) });
export const approveRoleRequest = (userId: string, body?: { role?: string; note?: string }) =>
  request<User>(`/api/auth/role-requests/${encodeURIComponent(userId)}/approve`, { method: "POST", body: JSON.stringify(body || {}) });
export const rejectRoleRequest = (userId: string, body?: { note?: string }) =>
  request<User>(`/api/auth/role-requests/${encodeURIComponent(userId)}/reject`, { method: "POST", body: JSON.stringify(body || {}) });

// System
export const getSystemStatus = () => request<SystemStatus>("/api/system/status");
export const getHealth = () => request<{ status: string }>("/api/health");

// Dashboard
export const getDashboardSummary = () =>
  request<DashboardSummary>("/api/dashboard/summary");

// Jobs
export interface StartJobParams {
  dataset_id?: string | null;
  model_id?: string | null;
  baseline_id?: string | null;
  trusted_model?: string | null;
  label?: string | null;
}

export const startJob = (params: StartJobParams) =>
  request<Job & { websocket: string }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(params),
  });

export const listJobs = (limit = 50) =>
  request<Job[]>(`/api/jobs?limit=${limit}`);

export const getJob = (id: string) =>
  request<Job>(`/api/jobs/${encodeURIComponent(id)}`);

export const getJobSummary = (id: string) =>
  request<JobSummary>(`/api/jobs/${encodeURIComponent(id)}/summary`);

export const getJobFindings = (id: string, engine?: string, min_severity?: string) => {
  const params = new URLSearchParams();
  if (engine) params.set("engine", engine);
  if (min_severity) params.set("min_severity", min_severity);
  const q = params.toString();
  return request<Finding[]>(`/api/jobs/${encodeURIComponent(id)}/findings${q ? `?${q}` : ""}`);
};

export const getJobReport = (id: string) =>
  request<{ report: Record<string, any>; signature_valid: boolean }>(
    `/api/jobs/${encodeURIComponent(id)}/report`
  );

export const getJobEvents = (id: string, after = 0) =>
  request<JobEvent[]>(`/api/jobs/${encodeURIComponent(id)}/events?after=${after}`);

export const createBaseline = (dataset_id: string, name: string) =>
  request<Baseline>("/api/baselines", {
    method: "POST",
    body: JSON.stringify({ dataset_id, name }),
  });

export const listBaselines = () => request<Baseline[]>("/api/baselines");

// Provenance Graph
export const getProvenanceGraph = (jobId: string) =>
  request<ProvenanceGraphData>(`/api/jobs/${encodeURIComponent(jobId)}/provenance-graph`);

// Attack Lab
export const bootstrapLab = (force = false) =>
  request<Record<string, any>>(`/api/demo/bootstrap${force ? "?force=true" : ""}`, {
    method: "POST",
  });

export const getScenarios = () =>
  request<Record<string, Scenario>>("/api/demo/scenarios");

export const runScenario = (name: string) =>
  request<{ job: Job; scenario: Scenario; websocket: string; [key: string]: any }>(
    `/api/demo/scenarios/${encodeURIComponent(name)}`,
    { method: "POST" }
  );

export const tamperInference = (recordId: string) =>
  request<{ record_id: string; tampered: boolean; original_class: string; forged_class: string }>(
    `/api/demo/tamper/inference/${encodeURIComponent(recordId)}`,
    { method: "POST" }
  );

export const tamperAuditBlock = (index: number) =>
  request<{ index: number; tampered: boolean; original_hash: string; new_hash: string; note: string }>(
    `/api/demo/tamper/audit/${index}`,
    { method: "POST" }
  );

export const tamperModelFile = (assetId: string) =>
  request<{ asset_id: string; tampered: boolean; bytes_flipped: number; note: string }>(
    `/api/demo/tamper/model-file/${encodeURIComponent(assetId)}`,
    { method: "POST" }
  );

export const getDemoTampers = () =>
  request<{ audit_blocks: number[]; inference_records: string[] }>("/api/demo/tampers");

export const restoreAuditBlock = (index: number) =>
  request<{ restored: boolean }>(`/api/demo/restore/audit/${index}`, { method: "POST" });

export const restoreInferenceRecord = (recordId: string) =>
  request<{ restored: boolean }>(`/api/demo/restore/inference/${encodeURIComponent(recordId)}`, { method: "POST" });

export const resetLab = () =>
  request<{ reset: boolean }>("/api/demo/reset", { method: "POST" });

// Assets
export const listAssets = (assetType?: "dataset" | "model") => {
  const url = assetType ? `/api/assets?asset_type=${assetType}` : "/api/assets";
  return request<Asset[]>(url);
};

export const getAsset = (id: string) =>
  request<Asset>(`/api/assets/${encodeURIComponent(id)}`);

export const listSamples = (assetId: string, offset = 0, limit = 100, label?: string) => {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (label) params.set("label", label);
  return request<{ total: number; items: any[] }>(
    `/api/assets/${encodeURIComponent(assetId)}/samples?${params.toString()}`
  );
};

export const getSampleProof = (assetId: string, sampleId: number) =>
  request<MerkleProofResponse>(
    `/api/assets/${encodeURIComponent(assetId)}/samples/${sampleId}/proof`
  );

export const getSampleDetails = (assetId: string, sampleId: number) =>
  request<SampleDetails>(
    `/api/assets/${encodeURIComponent(assetId)}/samples/${sampleId}/details`
  );

export const getSampleImageUrl = (assetId: string, sampleId: number) => {
  return `${API_URL}/api/assets/${encodeURIComponent(assetId)}/samples/${sampleId}/image`;
};

export const uploadDataset = (formData: FormData) =>
  request<Asset>("/api/assets/datasets", {
    method: "POST",
    body: formData,
  });

export const uploadModel = (formData: FormData) =>
  request<Asset>("/api/assets/models", {
    method: "POST",
    body: formData,
  });

// Contributors & Registry
export const listContributors = () => request<Contributor[]>("/api/contributors");

export const createContributor = (name: string, public_key?: string, organisation?: string) =>
  request<Contributor>("/api/contributors", {
    method: "POST",
    body: JSON.stringify({ name, public_key, organisation }),
  });

export const listTrustedModels = () => request<TrustedModel[]>("/api/registry/models");

export const trustModel = (asset_id: string, name: string) =>
  request<TrustedModel>("/api/registry/models", {
    method: "POST",
    body: JSON.stringify({ asset_id, name }),
  });

// Inference
export const runInference = (modelId: string, file: File) => {
  const formData = new FormData();
  formData.append("model_id", modelId);
  formData.append("file", file);
  return request<InferenceRecord>("/api/inference", {
    method: "POST",
    body: formData,
  });
};

export const listInference = (modelId?: string, limit = 100) => {
  const url = modelId ? `/api/inference?model_id=${encodeURIComponent(modelId)}&limit=${limit}` : `/api/inference?limit=${limit}`;
  return request<InferenceRecord[]>(url);
};

export const getInference = (id: string) =>
  request<InferenceRecord>(`/api/inference/${encodeURIComponent(id)}`);

export const verifyInferenceChain = () =>
  request<InferenceChainVerification>("/api/inference/verify-chain", {
    method: "POST",
  });

export const attestInference = (record: Record<string, any>, maxAgeSeconds?: number) =>
  request<{
    valid: boolean;
    reason: string;
    checks: Record<string, boolean>;
    attestations?: number;
  }>("/api/inference/attest", {
    method: "POST",
    body: JSON.stringify({ record, max_age_seconds: maxAgeSeconds }),
  });

// Audit
export const getAuditBlocks = (offset = 0, limit = 200) =>
  request<{ total: number; items: AuditBlock[] }>(
    `/api/audit?offset=${offset}&limit=${limit}`
  );

export const verifyAuditChain = () =>
  request<ChainVerification>("/api/audit/verify", { method: "POST" });

export const verifyIndependent = () =>
  request<{ exit_code: number; ok: boolean; lines: string[] }>("/api/system/verify-independent", {
    method: "POST",
    timeoutMs: 120_000,
  });

// ML Training
export interface PoisonSpec {
  target_class: string;
  rate: number;
  position: string;
  pattern: string;
  size_frac?: number;
}

export interface TrainParams {
  name: string;
  dataset_id?: string | null;
  demo_data?: boolean;
  epochs?: number;
  input_size?: number;
  trust_as?: string | null;
  poison?: PoisonSpec | null;
}

export const trainMlModel = (params: TrainParams) =>
  request<{ run_id: string; websocket: string }>("/api/ml/train", {
    method: "POST",
    body: JSON.stringify(params),
  });

export const getMlRunStatus = (runId: string) =>
  request<any>(`/api/ml/runs/${encodeURIComponent(runId)}`);

export const getMlModelTrainingRecord = (assetId: string) =>
  request<{ record: any; signature_valid: boolean }>(
    `/api/ml/models/${encodeURIComponent(assetId)}/training-record`
  );

// Benchmarks
export const getBenchmarks = () =>
  request<any>("/api/benchmarks/results");

export const runBenchmark = (suite: string, source_dataset?: string) =>
  request<{ run_id: string; websocket: string }>("/api/benchmarks/runs", {
    method: "POST",
    body: JSON.stringify({ suite, source_dataset }),
  });

// Workspace & Test Packs
export const getTestPacks = () => request<TestPackCase[]>("/api/workspace/test-packs");

export const ingestTestPack = (scale: string, caseId: string) =>
  request<Asset>(`/api/workspace/test-packs/${encodeURIComponent(scale)}/${encodeURIComponent(caseId)}/ingest`, {
    method: "POST",
  });

export const uploadDatasetXHR = (
  formData: FormData,
  onProgress?: (pct: number) => void
): Promise<Asset> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/api/assets/datasets`);
    xhr.withCredentials = true;
    const token = getAuthToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 1_800_000;

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const json = JSON.parse(xhr.responseText);
          resolve(json);
        } catch {
          reject(new ApiError(502, "The upload returned an invalid response. Check the backend routing."));
        }
      } else {
        try {
          const errJson = JSON.parse(xhr.responseText);
          reject(new ApiError(xhr.status, typeof errJson.detail === "string" ? errJson.detail : `Upload failed with status ${xhr.status}`, errJson));
        } catch {
          reject(new ApiError(xhr.status, `Upload failed with status ${xhr.status}: ${xhr.statusText}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during dataset upload"));
    };
    xhr.ontimeout = () => reject(new ApiError(504, "Dataset upload timed out."));
    xhr.onabort = () => reject(new ApiError(0, "Dataset upload cancelled."));

    xhr.send(formData);
  });
};
