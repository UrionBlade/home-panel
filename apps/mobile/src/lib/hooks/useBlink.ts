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

/** Assign (or clear) the room of a Blink camera. */
export function useUpdateCameraRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roomId }: { id: string; roomId: string | null }) =>
      apiClient.patch<BlinkCamera>(`/api/v1/blink/cameras/${id}`, { roomId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY }),
  });
}

/** Generic metadata update for a Blink camera (nickname + room). */
export function useUpdateCamera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { nickname?: string | null; name?: string | null; roomId?: string | null };
    }) => apiClient.patch<BlinkCamera>(`/api/v1/blink/cameras/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY }),
  });
}

/* ---- Live HLS session (real RTSPS → HLS) ---- */

export function useStartLiveSession() {
  return useMutation({
    mutationFn: (cameraId: string) =>
      apiClient.post<{ sessionId: string }>(`/api/v1/blink/cameras/${cameraId}/live/start`),
  });
}

export function useStopLiveSession() {
  return useMutation({
    mutationFn: (input: { cameraId: string; sessionId: string }) =>
      apiClient.post<{ ok: boolean }>(`/api/v1/blink/cameras/${input.cameraId}/live/stop`, {
        sessionId: input.sessionId,
      }),
  });
}

/**
 * Refresh the camera thumbnail. The backend endpoint now polls Blink
 * internally and only returns when the new JPEG URL is available (or after
 * 12s timeout), so the frontend just awaits this single call — no client-
 * side sleep, no separate sync step. Typical latency 3-5s.
 */
export function useRequestSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cameraId: string) =>
      apiClient.post<{ ok: boolean; waitedMs: number; settled: boolean }>(
        `/api/v1/blink/cameras/${cameraId}/snapshot`,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BLINK_CAMERAS_KEY });
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
