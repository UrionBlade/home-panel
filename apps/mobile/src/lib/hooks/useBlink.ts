import type {
  BlinkCamera,
  BlinkCredentialsStatus,
  BlinkMotionClip,
  BlinkSetupInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const BLINK_STATUS_KEY = ["blink", "status"] as const;
const BLINK_CAMERAS_KEY = ["blink", "cameras"] as const;
const BLINK_CLIPS_KEY = ["blink", "clips"] as const;

export function useBlinkStatus() {
  return useQuery({
    queryKey: BLINK_STATUS_KEY,
    queryFn: () => apiClient.get<BlinkCredentialsStatus>("/api/v1/blink/status"),
  });
}

export function useCameras() {
  return useQuery({
    queryKey: BLINK_CAMERAS_KEY,
    queryFn: () => apiClient.get<BlinkCamera[]>("/api/v1/blink/cameras"),
  });
}

export function useClips(cameraId?: string) {
  return useQuery({
    queryKey: [...BLINK_CLIPS_KEY, cameraId ?? "all"] as const,
    queryFn: () => {
      const params = cameraId ? `?cameraId=${cameraId}` : "";
      return apiClient.get<BlinkMotionClip[]>(`/api/v1/blink/clips${params}`);
    },
  });
}

export function useBlinkSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BlinkSetupInput) =>
      apiClient.post<{ needs2FA?: boolean; configured?: boolean }>("/api/v1/blink/setup", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BLINK_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY });
    },
  });
}

export function useBlinkVerifyPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) =>
      apiClient.post<{ configured: boolean }>("/api/v1/blink/verify-pin", { pin }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BLINK_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY });
      void qc.invalidateQueries({ queryKey: BLINK_CLIPS_KEY });
    },
  });
}

export function useBlinkLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ ok: boolean }>("/api/v1/blink/credentials"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BLINK_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY });
      void qc.invalidateQueries({ queryKey: BLINK_CLIPS_KEY });
    },
  });
}

export function useSyncCameras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ message: string }>("/api/v1/blink/cameras/sync"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY });
      void qc.invalidateQueries({ queryKey: BLINK_CLIPS_KEY });
    },
  });
}

export function useArmCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, arm }: { id: string; arm: boolean }) =>
      apiClient.post<{ armed: boolean }>(`/api/v1/blink/cameras/${id}/${arm ? "arm" : "disarm"}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY }),
  });
}

export function useRequestSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cameraId: string) =>
      apiClient.post<{ ok: boolean }>(`/api/v1/blink/cameras/${cameraId}/snapshot`),
    // After 3s, refresh cameras to get the updated thumbnail
    onSuccess: () => {
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY });
      }, 3000);
    },
  });
}

export function useDeleteClip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/api/v1/blink/clips/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: BLINK_CLIPS_KEY });
      const prev = qc.getQueriesData<BlinkMotionClip[]>({ queryKey: BLINK_CLIPS_KEY });
      qc.setQueriesData<BlinkMotionClip[]>({ queryKey: BLINK_CLIPS_KEY }, (old) =>
        old?.filter((clip) => clip.id !== id),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: BLINK_CLIPS_KEY }),
  });
}
