import type {
  VoiceWasteResponse,
  WasteCollectionDay,
  WasteContainerType,
  WasteException,
  WasteRule,
  WasteRulePattern,
  WasteType,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const KEY = ["waste"] as const;

export function useWasteTypes() {
  return useQuery({
    queryKey: [...KEY, "types"],
    queryFn: () => apiClient.get<WasteType[]>("/api/v1/waste/types"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWasteRules() {
  return useQuery({
    queryKey: [...KEY, "rules"],
    queryFn: () => apiClient.get<WasteRule[]>("/api/v1/waste/rules"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWasteCalendar(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "calendar", from, to],
    queryFn: () =>
      apiClient.get<WasteCollectionDay[]>(`/api/v1/waste/calendar?from=${from}&to=${to}`),
  });
}

export function useWasteToday() {
  return useQuery({
    queryKey: [...KEY, "today"],
    queryFn: () => apiClient.get<VoiceWasteResponse>("/api/v1/waste/today"),
    refetchInterval: 30 * 60 * 1000,
  });
}

export function useWasteExceptions() {
  return useQuery({
    queryKey: [...KEY, "exceptions"],
    queryFn: () => apiClient.get<WasteException[]>("/api/v1/waste/exceptions"),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWasteTomorrow() {
  return useQuery({
    queryKey: [...KEY, "tomorrow"],
    queryFn: () => apiClient.get<VoiceWasteResponse>("/api/v1/waste/tomorrow"),
    refetchInterval: 30 * 60 * 1000,
  });
}

/* ---- Waste Type mutations ---- */

interface CreateWasteTypeInput {
  displayName: string;
  color: string;
  icon?: string;
  containerType: WasteContainerType;
  expositionInstructions?: string;
}

interface UpdateWasteTypeInput {
  displayName?: string;
  color?: string;
  icon?: string;
  containerType?: WasteContainerType;
  expositionInstructions?: string | null;
  active?: boolean;
}

export function useCreateWasteType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWasteTypeInput) =>
      apiClient.post<WasteType>("/api/v1/waste/types", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWasteType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWasteTypeInput }) =>
      apiClient.patch<WasteType>(`/api/v1/waste/types/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWasteType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/waste/types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/* ---- Waste Rule mutations ---- */

interface CreateWasteRuleInput {
  wasteTypeId: string;
  pattern: WasteRulePattern;
  expositionTime: string;
}

interface UpdateWasteRuleInput {
  pattern?: WasteRulePattern;
  expositionTime?: string;
  active?: boolean;
}

export function useCreateWasteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWasteRuleInput) =>
      apiClient.post<WasteRule>("/api/v1/waste/rules", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateWasteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWasteRuleInput }) =>
      apiClient.patch<WasteRule>(`/api/v1/waste/rules/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteWasteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/waste/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
