import type { AcDevice, GeCredentialsStatus, GeSetupInput } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const AC_CONFIG_KEY = ["ac", "config"] as const;
const AC_DEVICES_KEY = ["ac", "devices"] as const;

/** Link status — one-shot fetch, cached until a setup/disconnect
 * mutation invalidates the key. */
export function useAcConfig() {
  return useQuery({
    queryKey: AC_CONFIG_KEY,
    queryFn: () => apiClient.get<GeCredentialsStatus>("/api/v1/ac/config"),
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

/** Submit email + password to link GE Appliances. The backend performs
 * the OAuth dance against Brillion and stores the resulting tokens. */
export function useAcSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GeSetupInput) =>
      apiClient.post<{ ok: boolean }>("/api/v1/ac/config", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: AC_CONFIG_KEY });
      void qc.invalidateQueries({ queryKey: AC_DEVICES_KEY });
    },
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
