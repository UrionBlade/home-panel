/**
 * Environmental sensors — TanStack Query hooks.
 *
 * Backend contract: apps/api/src/routes/sensors.ts. Live updates land
 * via the global SSE channel (`sensors:env-update` events) and
 * automatically invalidate the cached list so no polling is needed.
 */

import type { EnvHistoryPoint, EnvSensor } from "@home-panel/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "../api-client";
import { sseClient } from "../sse-client";

const ENV_KEY = ["sensors", "env"] as const;
const ENV_HISTORY_KEY = (id: string, hours: number) =>
  ["sensors", "env", id, "history", hours] as const;

/** List all environmental sensors. The query stays warm — SSE updates
 * keep it fresh. A 60s refetchInterval is the safety net for the rare
 * case where SSE disconnects without the client noticing. */
export function useEnvSensors() {
  const qc = useQueryClient();

  useEffect(() => {
    /* `sensors:env-update` payload is one EnvSensor row. We patch that
     * row in place so the UI doesn't flash an empty state on every
     * reading; falls back to invalidate when the list shape is unclear
     * (e.g. brand-new sensor that wasn't in the cached list yet). */
    const off = sseClient.subscribe("sensors:env-update", (raw) => {
      const updated = raw as EnvSensor | null;
      if (!updated || typeof updated.id !== "string") {
        void qc.invalidateQueries({ queryKey: ENV_KEY });
        return;
      }
      qc.setQueryData<EnvSensor[]>(ENV_KEY, (prev) => {
        if (!prev) return [updated];
        const idx = prev.findIndex((s) => s.id === updated.id);
        if (idx === -1) return [...prev, updated];
        const next = prev.slice();
        next[idx] = updated;
        return next;
      });
    });
    return off;
  }, [qc]);

  return useQuery({
    queryKey: ENV_KEY,
    queryFn: () => apiClient.get<EnvSensor[]>("/api/v1/sensors/env"),
    refetchInterval: 60_000,
  });
}

/** Hourly trend for one sensor. Default 24h, capped server-side at 168h. */
export function useEnvSensorHistory(id: string, hours = 24) {
  return useQuery({
    queryKey: ENV_HISTORY_KEY(id, hours),
    queryFn: () =>
      apiClient.get<EnvHistoryPoint[]>(`/api/v1/sensors/env/${id}/history?hours=${hours}`),
    enabled: Boolean(id),
    refetchInterval: 5 * 60_000,
  });
}
