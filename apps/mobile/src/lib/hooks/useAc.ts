import type { AcDevice, GeCredentialsStatus } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const AC_CONFIG_KEY = ["ac", "config"] as const;
const AC_DEVICES_KEY = ["ac", "devices"] as const;

/** Link status. Accepts a `polling` flag so the Settings screen can switch
 * to a 2-second cadence while the user is completing the external OAuth
 * flow, then drop back to a one-shot fetch once the backend confirms. */
export function useAcConfig(polling = false) {
  return useQuery({
    queryKey: AC_CONFIG_KEY,
    queryFn: () => apiClient.get<GeCredentialsStatus>("/api/v1/ac/config"),
    refetchInterval: polling ? 2_000 : false,
  });
}

/** Devices discovered from GE. Only enabled once the link is active. */
export function useAcDevices(enabled: boolean) {
  return useQuery({
    queryKey: AC_DEVICES_KEY,
    queryFn: () => apiClient.get<AcDevice[]>("/api/v1/ac/devices"),
    enabled,
  });
}

interface OauthStartResponse {
  authorizationUrl: string;
  state: string;
}

/** Kick off the OAuth dance. Returns the authorization URL for the caller
 * to open in an external browser (Tauri shell opener). */
export function useAcStartOauth() {
  return useMutation({
    mutationFn: (redirectUri: string) =>
      apiClient.post<OauthStartResponse>("/api/v1/ac/oauth/start", { redirectUri }),
  });
}

/** Disconnect — wipes backend tokens + refetches status. */
export function useAcDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ ok: boolean }>("/api/v1/ac/config"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: AC_CONFIG_KEY });
      void qc.invalidateQueries({ queryKey: AC_DEVICES_KEY });
    },
  });
}
