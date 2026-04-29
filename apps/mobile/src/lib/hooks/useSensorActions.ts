/**
 * Mutations that mutate Home-Panel-side metadata on environmental and
 * leak sensors: friendly name and room assignment. The hub-reported
 * runtime values (CO2, temp, leak state) are read-only — only the
 * panel-side fields go through these endpoints.
 */

import type { EnvSensor, LeakSensor } from "@home-panel/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const ENV_KEY = ["sensors", "env"] as const;
const LEAK_KEY = ["sensors", "leak"] as const;

export function useUpdateEnvSensorRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roomId }: { id: string; roomId: string | null }) =>
      apiClient.patch<EnvSensor>(`/api/v1/sensors/env/${id}`, { roomId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ENV_KEY });
    },
  });
}

export function useRenameEnvSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.patch<EnvSensor>(`/api/v1/sensors/env/${id}`, { friendlyName: name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ENV_KEY });
    },
  });
}

export function useUpdateLeakSensorRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roomId }: { id: string; roomId: string | null }) =>
      apiClient.patch<LeakSensor>(`/api/v1/sensors/leak/${id}`, { roomId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEAK_KEY });
    },
  });
}

export function useRenameLeakSensor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient.patch<LeakSensor>(`/api/v1/sensors/leak/${id}`, { friendlyName: name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEAK_KEY });
    },
  });
}
