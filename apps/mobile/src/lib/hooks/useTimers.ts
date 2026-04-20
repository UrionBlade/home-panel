import type {
  Alarm,
  CreateAlarmInput,
  CreateTimerInput,
  Timer,
  UpdateAlarmInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const TIMERS_KEY = ["timers"] as const;
const ALARMS_KEY = ["alarms"] as const;
const NEXT_ALARM_KEY = ["alarms", "next"] as const;

/* ── Timer hooks ── */

export function useTimers() {
  return useQuery({
    queryKey: TIMERS_KEY,
    queryFn: () => apiClient.get<Timer[]>("/api/v1/timers/timers"),
    // 1s polling only while timers are active: reduces API load
    // from 1 req/s to 0 req/s when the list is empty or all are paused/finished.
    // `timer:finished` events via SSE still notify changes.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.some((t) => t.status === "running") ? 1000 : false;
    },
  });
}

export function useCreateTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTimerInput) => apiClient.post<Timer>("/api/v1/timers/timers", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}

export function usePauseTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Timer>(`/api/v1/timers/timers/${id}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}

export function useResumeTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Timer>(`/api/v1/timers/timers/${id}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}

export function useAddTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Timer>(`/api/v1/timers/timers/${id}/add-time`),
    onSuccess: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}

export function useDismissTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/timers/timers/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: TIMERS_KEY });
      const prev = qc.getQueryData<Timer[]>(TIMERS_KEY);
      qc.setQueryData<Timer[]>(TIMERS_KEY, (old) => old?.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(TIMERS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: TIMERS_KEY }),
  });
}

/* ── Alarm hooks ── */

export function useAlarms() {
  return useQuery({
    queryKey: ALARMS_KEY,
    queryFn: () => apiClient.get<Alarm[]>("/api/v1/timers/alarms"),
  });
}

export function useCreateAlarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlarmInput) => apiClient.post<Alarm>("/api/v1/timers/alarms", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALARMS_KEY });
      qc.invalidateQueries({ queryKey: NEXT_ALARM_KEY });
    },
  });
}

export function useUpdateAlarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAlarmInput }) =>
      apiClient.patch<Alarm>(`/api/v1/timers/alarms/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ALARMS_KEY });
      qc.invalidateQueries({ queryKey: NEXT_ALARM_KEY });
    },
  });
}

export function useDeleteAlarm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/timers/alarms/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ALARMS_KEY });
      const prev = qc.getQueryData<Alarm[]>(ALARMS_KEY);
      qc.setQueryData<Alarm[]>(ALARMS_KEY, (old) => old?.filter((a) => a.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ALARMS_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ALARMS_KEY });
      qc.invalidateQueries({ queryKey: NEXT_ALARM_KEY });
    },
  });
}

export function useNextAlarm() {
  return useQuery({
    queryKey: NEXT_ALARM_KEY,
    queryFn: () => apiClient.get<Alarm | null>("/api/v1/timers/alarms/next"),
    staleTime: 60_000,
  });
}
