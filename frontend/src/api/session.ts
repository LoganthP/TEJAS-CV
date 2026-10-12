import { clearAuthToken, getAuthToken } from "./client";
import { getMe } from "./endpoints";

// Keep session expiry separate from resource/network errors. A request started
// before a new login must never clear the new token or replace its user.
export async function loadSession() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = getAuthToken();
    if (!token) return null;
    try {
      const user = await getMe();
      if (token === getAuthToken()) return user;
    } catch (error: any) {
      if (token !== getAuthToken()) continue;
      if (error.status !== 401) throw error;
      clearAuthToken();
      return null;
    }
  }
  throw new Error("The sign-in changed while checking your session. Please retry.");
}
