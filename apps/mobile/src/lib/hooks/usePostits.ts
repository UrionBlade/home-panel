import type { CreatePostitInput, Postit, UpdatePostitInput } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const POSTITS_KEY = ["postits"] as const;

export function usePostits() {
  return useQuery({
    queryKey: POSTITS_KEY,
    queryFn: () => apiClient.get<Postit[]>("/api/v1/postits"),
  });
}

export function useCreatePostit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostitInput) => apiClient.post<Postit>("/api/v1/postits", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: POSTITS_KEY }),
  });
}

export function useUpdatePostit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePostitInput }) =>
      apiClient.patch<Postit>(`/api/v1/postits/${id}`, input),
    onMutate: async ({ id, input }) => {
      await qc.cancelQueries({ queryKey: POSTITS_KEY });
      const prev = qc.getQueryData<Postit[]>(POSTITS_KEY);
      qc.setQueryData<Postit[]>(POSTITS_KEY, (old) =>
        old?.map((p) => (p.id === id ? { ...p, ...input } : p)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(POSTITS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: POSTITS_KEY }),
  });
}

export function useDeletePostit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/postits/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: POSTITS_KEY });
      const prev = qc.getQueryData<Postit[]>(POSTITS_KEY);
      qc.setQueryData<Postit[]>(POSTITS_KEY, (old) => old?.filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(POSTITS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: POSTITS_KEY }),
  });
}

export function useBringToFront() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<Postit>(`/api/v1/postits/${id}/bring-to-front`),
    onSuccess: () => qc.invalidateQueries({ queryKey: POSTITS_KEY }),
  });
}
