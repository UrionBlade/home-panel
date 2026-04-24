/**
 * Routines — TanStack Query hooks.
 *
 * Backend contract: apps/api/src/routes/routines.ts
 */

import type {
  Routine,
  RoutineCreateInput,
  RoutineRunResult,
  RoutineUpdateInput,
  RoutineVoiceTrigger,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "../../store/ui-store";
import { apiClient } from "../api-client";
import { i18next } from "../i18n";

const ROUTINES_KEY = ["routines"] as const;
const VOICE_TRIGGERS_KEY = ["routines", "voice-triggers"] as const;

export function useRoutines() {
  return useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => apiClient.get<Routine[]>("/api/v1/routines"),
    refetchInterval: 120_000,
  });
}

export function useRoutineVoiceTriggers() {
  return useQuery({
    queryKey: VOICE_TRIGGERS_KEY,
    queryFn: () => apiClient.get<RoutineVoiceTrigger[]>("/api/v1/routines/voice-triggers"),
    refetchInterval: 120_000,
  });
}

export function useCreateRoutine() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (input: RoutineCreateInput) => apiClient.post<Routine>("/api/v1/routines", input),
    onSuccess: () => {
      pushToast({ tone: "success", text: i18next.t("routines:create.success") });
      void qc.invalidateQueries({ queryKey: ROUTINES_KEY });
      void qc.invalidateQueries({ queryKey: VOICE_TRIGGERS_KEY });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : i18next.t("routines:create.error");
      pushToast({ tone: "danger", text: msg });
    },
  });
}

export function useUpdateRoutine() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RoutineUpdateInput }) =>
      apiClient.patch<Routine>(`/api/v1/routines/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ROUTINES_KEY });
      void qc.invalidateQueries({ queryKey: VOICE_TRIGGERS_KEY });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : i18next.t("routines:update.error");
      pushToast({ tone: "danger", text: msg });
    },
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/routines/${id}`),
    onSuccess: () => {
      pushToast({ tone: "success", text: i18next.t("routines:delete.success") });
      void qc.invalidateQueries({ queryKey: ROUTINES_KEY });
      void qc.invalidateQueries({ queryKey: VOICE_TRIGGERS_KEY });
    },
  });
}

export function useRunRoutine() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (id: string) => apiClient.post<RoutineRunResult>(`/api/v1/routines/${id}/run`),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ROUTINES_KEY });
      if (result.overallOk) {
        pushToast({ tone: "success", text: i18next.t("routines:run.success") });
      } else {
        const firstError = result.steps.find((s) => !s.ok)?.error;
        pushToast({
          tone: "danger",
          text: firstError
            ? i18next.t("routines:run.partialError", { error: firstError })
            : i18next.t("routines:run.error"),
        });
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : i18next.t("routines:run.error");
      pushToast({ tone: "danger", text: msg });
    },
  });
}
