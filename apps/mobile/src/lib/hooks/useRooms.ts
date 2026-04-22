import type { CreateRoomInput, Room, UpdateRoomInput } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const ROOMS_KEY = ["rooms"] as const;

export function useRooms() {
  return useQuery({
    queryKey: ROOMS_KEY,
    queryFn: () => apiClient.get<Room[]>("/api/v1/rooms"),
    staleTime: 60_000,
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoomInput) => apiClient.post<Room>("/api/v1/rooms", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoomInput }) =>
      apiClient.patch<Room>(`/api/v1/rooms/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/rooms/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ROOMS_KEY });
      const prev = qc.getQueryData<Room[]>(ROOMS_KEY);
      qc.setQueryData<Room[]>(ROOMS_KEY, (old) => old?.filter((r) => r.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ROOMS_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ROOMS_KEY }),
  });
}
