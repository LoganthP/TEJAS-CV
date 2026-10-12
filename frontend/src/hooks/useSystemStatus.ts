import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSystemStatus } from "../api/endpoints";
import { SystemStatus } from "../types/api";

export const SYSTEM_STATUS_QUERY_KEY = ["systemStatus"];

export function useSystemStatus() {
  const queryClient = useQueryClient();
  const query = useQuery<SystemStatus>({
    queryKey: SYSTEM_STATUS_QUERY_KEY,
    queryFn: getSystemStatus,
    // Live job events already invalidate this query; the timer is only a safety net.
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  const invalidateStatus = () => {
    queryClient.invalidateQueries({ queryKey: SYSTEM_STATUS_QUERY_KEY });
  };

  return {
    ...query,
    systemStatus: query.data,
    isCompromised: query.data?.health === "COMPROMISED",
    isSecure: query.data?.health === "SECURE",
    invalidateStatus,
  };
}
