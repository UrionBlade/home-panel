import type {
  CreateFamilyMemberInput,
  FamilyMember,
  UpdateFamilyMemberInput,
  VoiceEnrollResponse,
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

export function useEnrollVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, embedding }: { id: string; embedding: number[] }) =>
      apiClient.post<VoiceEnrollResponse>(`/api/v1/family/${id}/voice/enroll`, { embedding }),
    onSuccess: () => qc.invalidateQueries({ queryKey: FAMILY_KEY }),
  });
}

export function useDeleteVoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<VoiceEnrollResponse>(`/api/v1/family/${id}/voice/enroll`),
    onSuccess: () => qc.invalidateQueries({ queryKey: FAMILY_KEY }),
  });
}

/** Server-side cosine match for a freshly captured speaker embedding.
 * Returns the best-matching member id (or `null` when the score is below
 * the configured threshold). The embedding is sent in the body — never
 * persisted server-side beyond the per-request log. */
export async function identifyVoice(embedding: number[]): Promise<{
  familyMemberId: string | null;
  score: number;
}> {
  return apiClient.post("/api/v1/family/voice/identify", { embedding });
}
