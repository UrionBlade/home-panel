import type {
  CalendarEvent,
  CreateEventInput,
  EventCategory,
  EventInstance,
  UpdateEventInput,
  VoiceEventsResponse,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const KEY = ["calendar"] as const;

export function useEventCategories() {
  return useQuery({
    queryKey: [...KEY, "categories"],
    queryFn: () => apiClient.get<EventCategory[]>("/api/v1/calendar/categories"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllEvents() {
  return useQuery({
    queryKey: [...KEY, "events"],
    queryFn: () => apiClient.get<CalendarEvent[]>("/api/v1/calendar/events"),
  });
}

export function useExpandedEvents(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "expanded", from, to],
    queryFn: () =>
      apiClient.get<EventInstance[]>(`/api/v1/calendar/expanded?from=${from}&to=${to}`),
  });
}

export function useTodayEvents() {
  return useQuery({
    queryKey: [...KEY, "today"],
    queryFn: () => apiClient.get<VoiceEventsResponse>("/api/v1/calendar/today"),
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) =>
      apiClient.post<CalendarEvent>("/api/v1/calendar/events", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) =>
      apiClient.patch<CalendarEvent>(`/api/v1/calendar/events/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/calendar/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
