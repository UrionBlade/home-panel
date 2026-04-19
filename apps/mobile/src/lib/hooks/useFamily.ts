import type {
  CreateFamilyMemberInput,
  FamilyMember,
  UpdateFamilyMemberInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const FAMILY_KEY = ["family"] as const;

export function useFamilyMembers() {
  return useQuery({
    queryKey: FAMILY_KEY,
    queryFn: () => apiClient.get<FamilyMember[]>("/api/v1/family"),
  });
}

export function useCreateFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFamilyMemberInput) =>
      apiClient.post<FamilyMember>("/api/v1/family", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: FAMILY_KEY }),
  });
}

export function useUpdateFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateFamilyMemberInput }) =>
      apiClient.patch<FamilyMember>(`/api/v1/family/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: FAMILY_KEY }),
  });
}

export function useDeleteFamilyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/family/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: FAMILY_KEY }),
  });
}
