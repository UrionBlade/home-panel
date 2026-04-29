/**
 * Water-leak sensors — TanStack Query hooks.
 *
 * The leak modal lives in `LeakAlertOverlay` and consumes
 * `sensors:leak-trigger` directly; this hook is the read-side view
 * that powers the leak status list / settings, and the ack mutation
 * the modal uses to dismiss an alert.
 */

import type { LeakAckResponse, LeakSensor } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiClient } from "../api-client";
import { sseClient } from "../sse-client";

const LEAK_KEY = ["sensors", "leak"] as const;

export function useLeakSensors() {
  const qc = useQueryClient();

  useEffect(() => {
    /* The trigger event already drives the modal; we still patch the
     * cached list so the leak status surface stays in sync without a
     * round-trip. The lighter `leak-update` event is emitted on every
     * upsert (including state-flip-back to dry); we just invalidate
     * to keep things simple. */
    const off1 = sseClient.subscribe("sensors:leak-update", () => {
      void qc.invalidateQueries({ queryKey: LEAK_KEY });
    });
    const off2 = sseClient.subscribe("sensors:leak-ack", () => {
      void qc.invalidateQueries({ queryKey: LEAK_KEY });
    });
    const off3 = sseClient.subscribe("sensors:leak-trigger", () => {
      void qc.invalidateQueries({ queryKey: LEAK_KEY });
    });
    return () => {
      off1();
      off2();
      off3();
    };
  }, [qc]);

  return useQuery({
    queryKey: LEAK_KEY,
    queryFn: () => apiClient.get<LeakSensor[]>("/api/v1/sensors/leak"),
    refetchInterval: 60_000,
  });
}

/** Acknowledge a leak alert. The backend keeps the sensor in its
 * current wet/dry state; this only stamps `lastAckAt` so the modal
 * stops re-firing on subsequent UI reloads. */
export function useAckLeak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sensorId: string) =>
      apiClient.post<LeakAckResponse>(`/api/v1/sensors/leak/${sensorId}/ack`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEAK_KEY });
    },
  });
}
