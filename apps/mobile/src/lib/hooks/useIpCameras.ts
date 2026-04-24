import type {
  IpCamera,
  IpCameraCreateInput,
  IpCameraRecording,
  IpCameraUpdateInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "";

export function ipCameraRecordingUrl(recId: string): string {
  return `${API_BASE}/api/v1/ip-cameras/recordings/${recId}/stream?token=${encodeURIComponent(API_TOKEN)}`;
}

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

/* ------------------------------------------------------------------ */
/*  Recording                                                          */
/* ------------------------------------------------------------------ */

const recordingsKey = (id: string) => ["ip-cameras", id, "recordings"] as const;
const recordStatusKey = (id: string) => ["ip-cameras", id, "record-status"] as const;

export function useIpCameraRecordings(cameraId: string | null) {
  return useQuery({
    queryKey: cameraId ? recordingsKey(cameraId) : ["ip-cameras", "no-camera"],
    queryFn: () => apiClient.get<IpCameraRecording[]>(`/api/v1/ip-cameras/${cameraId}/recordings`),
    enabled: !!cameraId,
    staleTime: 5_000,
  });
}

export function useIpCameraRecordStatus(cameraId: string | null) {
  return useQuery({
    queryKey: cameraId ? recordStatusKey(cameraId) : ["ip-cameras", "no-status"],
    queryFn: () =>
      apiClient.get<{ recordingId: string | null }>(`/api/v1/ip-cameras/${cameraId}/record/status`),
    enabled: !!cameraId,
    refetchInterval: 3_000,
  });
}

export function useStartIpCameraRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cameraId, label }: { cameraId: string; label?: string }) =>
      apiClient.post<{ id: string; filePath: string; startedAt: string }>(
        `/api/v1/ip-cameras/${cameraId}/record/start`,
        { label },
      ),
    onSuccess: (_, { cameraId }) => {
      void qc.invalidateQueries({ queryKey: recordStatusKey(cameraId) });
      void qc.invalidateQueries({ queryKey: recordingsKey(cameraId) });
    },
  });
}

export function useStopIpCameraRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cameraId: string) =>
      apiClient.post<{ ok: boolean }>(`/api/v1/ip-cameras/${cameraId}/record/stop`),
    onSuccess: (_, cameraId) => {
      void qc.invalidateQueries({ queryKey: recordStatusKey(cameraId) });
      void qc.invalidateQueries({ queryKey: recordingsKey(cameraId) });
    },
  });
}

export function useDeleteIpCameraRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recId }: { cameraId: string; recId: string }) =>
      apiClient.delete<void>(`/api/v1/ip-cameras/recordings/${recId}`),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: recordingsKey(vars.cameraId) });
    },
  });
}
