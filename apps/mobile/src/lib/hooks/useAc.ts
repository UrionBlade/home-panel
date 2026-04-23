import type {
  AcCommandInput,
  AcDevice,
  AcDeviceUpdateInput,
  AcState,
  GeCredentialsStatus,
  GeSetupInput,
} from "@home-panel/shared";
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

/** Devices discovered from GE. Only enabled once the link is active.
 * Polls every 30s so the tile reflects cloud state without the user
 * having to refresh. */
export function useAcDevices(enabled: boolean) {
  return useQuery({
    queryKey: AC_DEVICES_KEY,
    queryFn: () => apiClient.get<AcDevice[]>("/api/v1/ac/devices"),
    enabled,
    refetchInterval: enabled ? 30_000 : false,
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

interface AcCommandResponse {
  ok: true;
  state: AcState;
}

/** Send a command to a specific AC. Optimistically patches the devices
 * cache so the UI feels instant; rolls back on error. */
export function useAcCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: AcCommandInput & { id: string }) =>
      apiClient.post<AcCommandResponse>(`/api/v1/ac/devices/${id}/command`, input),
    onMutate: async ({ id, ...input }) => {
      await qc.cancelQueries({ queryKey: AC_DEVICES_KEY });
      const previous = qc.getQueryData<AcDevice[]>(AC_DEVICES_KEY);
      qc.setQueryData<AcDevice[]>(AC_DEVICES_KEY, (old) =>
        old?.map((d) => {
          if (d.id !== id) return d;
          const base: AcState = d.state ?? {
            power: false,
            mode: "cool",
            currentTemp: null,
            targetTemp: 24,
            fanSpeed: "auto",
            swing: "off",
            updatedAt: new Date().toISOString(),
          };
          return {
            ...d,
            state: {
              ...base,
              ...(input.power !== undefined && { power: input.power }),
              ...(input.mode !== undefined && { mode: input.mode }),
              ...(input.fanSpeed !== undefined && { fanSpeed: input.fanSpeed }),
              ...(input.swing !== undefined && { swing: input.swing }),
              ...(input.targetTemp !== undefined && { targetTemp: input.targetTemp }),
              updatedAt: new Date().toISOString(),
            },
          };
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(AC_DEVICES_KEY, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: AC_DEVICES_KEY });
    },
  });
}

/** Update local metadata of an AC (room assignment, nickname). */
export function useUpdateAcDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: AcDeviceUpdateInput & { id: string }) =>
      apiClient.patch<AcDevice>(`/api/v1/ac/devices/${id}`, input),
    onSuccess: (updated) => {
      qc.setQueryData<AcDevice[]>(AC_DEVICES_KEY, (old) =>
        old?.map((d) => (d.id === updated.id ? updated : d)),
      );
    },
  });
}
