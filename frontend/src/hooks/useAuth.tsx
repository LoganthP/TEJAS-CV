import React, { createContext, useContext, useEffect } from "react";
import { logout as apiLogout } from "../api/endpoints";
import { loadSession } from "../api/session";
import { MeResponse, Permissions, User } from "../types/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAuthToken, getAuthToken } from "../api/client";

function clearAttackLabSession() {
  Object.keys(sessionStorage).forEach((key) => {
    if (key.startsWith("tejas_attack_lab_")) {
      sessionStorage.removeItem(key);
    }
  });
  localStorage.removeItem("tejas-attack-lab-storage");
}

interface AuthContextType {
  user: User | null;
  role: "admin" | "operator" | "client" | "user" | null;
  permissions: Permissions | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  logout: () => void;
  refetchAuth: () => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery<MeResponse>({
    queryKey: ["authMe"],
    queryFn: async () => {
      const session = await loadSession();
      if (!session) clearAttackLabSession();
      return session as MeResponse;
    },
    // Only a real 401 means "signed out". Cold starts, timeouts and 5xx are retried with
    // back-off instead of bouncing the user to the login page.
    retry: (failureCount, err: any) => err?.status !== 401 && failureCount < 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    refetchOnWindowFocus: true,
    refetchInterval: 120000,
    staleTime: 60000,
  });

  useEffect(() => {
    const checkSession = (event: Event) => {
      const token = (event as CustomEvent<{ token: string }>).detail?.token;
      if (token && token === getAuthToken()) {
        void refetch({ cancelRefetch: false });
      }
    };
    window.addEventListener("tejas:auth-check", checkSession);
    return () => window.removeEventListener("tejas:auth-check", checkSession);
  }, [refetch]);

  const logout = async () => {
    try {
      await apiLogout();
    } catch (err) {
      console.error("Logout error", err);
    }
    clearAuthToken();
    clearAttackLabSession();
    queryClient.clear();
    window.location.href = "/login";
  };

  // Resolve user: backend /api/auth/me returns User directly with permissions
  const currentUser: User | null = data ? ((data as any).id ? (data as User) : ((data as any).user || null)) : null;
  const currentPermissions: Permissions | null = currentUser?.permissions || (data as any)?.permissions || null;
  const role = currentUser?.role || null;

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        role,
        permissions: currentPermissions,
        isLoading,
        isError,
        error,
        logout,
        refetchAuth: refetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
