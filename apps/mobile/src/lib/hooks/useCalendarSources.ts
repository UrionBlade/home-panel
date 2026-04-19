import type {
  CalendarSource,
  CreateCalendarSourceInput,
  UpdateCalendarSourceInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const KEY = ["calendar-sources"] as const;
const CALENDAR_KEY = ["calendar"] as const;

export function useCalendarSources() {
  return useQuery({
    queryKey: [...KEY],
    queryFn: () => apiClient.get<CalendarSource[]>("/api/v1/calendar/sources"),
    staleTime: 60 * 1000,
  });
}

export function useCreateCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCalendarSourceInput) =>
      apiClient.post<CalendarSource>("/api/v1/calendar/sources", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
  });
}

export function useUpdateCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCalendarSourceInput }) =>
      apiClient.patch<CalendarSource>(`/api/v1/calendar/sources/${id}`, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
  });
}

export function useDeleteCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/calendar/sources/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
  });
}

export function useSyncCalendarSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<CalendarSource>(`/api/v1/calendar/sources/${id}/sync`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: CALENDAR_KEY });
    },
  });
}
