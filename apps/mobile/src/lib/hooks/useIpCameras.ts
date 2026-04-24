import type { IpCamera, IpCameraCreateInput, IpCameraUpdateInput } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const IP_CAMERAS_KEY = ["ip-cameras"] as const;

export function useIpCameras() {
  return useQuery({
    queryKey: IP_CAMERAS_KEY,
    queryFn: () => apiClient.get<IpCamera[]>("/api/v1/ip-cameras"),
    staleTime: 30_000,
  });
}

export function useCreateIpCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IpCameraCreateInput) =>
      apiClient.post<IpCamera>("/api/v1/ip-cameras", input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: IP_CAMERAS_KEY }),
  });
}

export function useUpdateIpCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: IpCameraUpdateInput }) =>
      apiClient.patch<IpCamera>(`/api/v1/ip-cameras/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: IP_CAMERAS_KEY }),
  });
}

export function useDeleteIpCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/ip-cameras/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: IP_CAMERAS_KEY }),
  });
}
