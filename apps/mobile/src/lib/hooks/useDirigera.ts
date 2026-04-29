/**
 * DIRIGERA hub status — read-only view used by the Settings panel.
 *
 * Polls every 30s. When the WS subscriber reconnects on the backend
 * the next poll will reflect the new `connected: true` state; we
 * don't subscribe to SSE for hub status because it's a low-frequency
 * surface (not a per-device thing).
 */

import type { DirigeraStatus } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const STATUS_KEY = ["dirigera", "status"] as const;

export function useDirigeraStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => apiClient.get<DirigeraStatus>("/api/v1/dirigera/status"),
    refetchInterval: 30_000,
  });
}

export function useDirigeraSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{
        ok: boolean;
        total: number;
        lights: number;
        envSensors: number;
        leakSensors: number;
        ignored: number;
      }>("/api/v1/dirigera/sync", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: STATUS_KEY });
      void qc.invalidateQueries({ queryKey: ["lights"] });
      void qc.invalidateQueries({ queryKey: ["sensors", "env"] });
      void qc.invalidateQueries({ queryKey: ["sensors", "leak"] });
    },
  });
}
