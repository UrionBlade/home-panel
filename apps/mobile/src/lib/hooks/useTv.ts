import type {
  TvAppLaunchInput,
  TvAppPreset,
  TvChannelInput,
  TvConfig,
  TvConfigUpdateInput,
  TvDeviceSummary,
  TvInputSelectInput,
  TvMuteInput,
  TvPlaybackInput,
  TvPowerInput,
  TvStatus,
  TvVolumeInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "../../store/ui-store";
import { ApiError, apiClient } from "../api-client";

const TV_STATUS_KEY = ["tv", "status"] as const;
const TV_CONFIG_KEY = ["tv", "config"] as const;
const TV_DEVICES_KEY = ["tv", "devices"] as const;
const TV_PRESETS_KEY = ["tv", "presets"] as const;

/** Status query — adapts refetch cadence to power state, disables when the TV
 *  is not configured (API returns 404 { error: "TV non configurata" }). */
export function useTvStatus() {
  return useQuery<TvStatus, ApiError>({
    queryKey: TV_STATUS_KEY,
    queryFn: () => apiClient.get<TvStatus>("/api/v1/tv/status"),
    refetchInterval: (query) => {
      const err = query.state.error;
      if (err instanceof ApiError && err.status === 404) return false;
      return query.state.data?.power === "on" ? 15_000 : 30_000;
    },
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 404) return false;
      return failureCount < 2;
    },
    staleTime: 10_000,
  });
}

export function useTvConfig() {
  return useQuery<TvConfig>({
    queryKey: TV_CONFIG_KEY,
    queryFn: () => apiClient.get<TvConfig>("/api/v1/tv/config"),
  });
}

export function useTvDevices(enabled: boolean) {
  return useQuery<TvDeviceSummary[]>({
    queryKey: TV_DEVICES_KEY,
    queryFn: () => apiClient.get<TvDeviceSummary[]>("/api/v1/tv/devices"),
    enabled,
  });
}

export function useTvPresets() {
  return useQuery<TvAppPreset[]>({
    queryKey: TV_PRESETS_KEY,
    queryFn: () => apiClient.get<TvAppPreset[]>("/api/v1/tv/apps/presets"),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function useInvalidateStatus() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: TV_STATUS_KEY });
  };
}

export function useTvAssign() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean; tvDeviceId: string | null }, ApiError, TvConfigUpdateInput>({
    mutationFn: (input) => apiClient.patch("/api/v1/tv/config", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: TV_CONFIG_KEY });
      void qc.invalidateQueries({ queryKey: TV_STATUS_KEY });
    },
  });
}

export function useTvPower() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation<{ ok: boolean }, ApiError, TvPowerInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/power", input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: TV_STATUS_KEY });
      const previous = qc.getQueryData<TvStatus>(TV_STATUS_KEY);
      qc.setQueryData<TvStatus>(TV_STATUS_KEY, (old) =>
        old ? { ...old, power: input.on ? "on" : "off" } : old,
      );
      return { previous };
    },
    onError: (_err, _input, context) => {
      const ctx = context as { previous: TvStatus | undefined } | undefined;
      if (ctx?.previous !== undefined) {
        qc.setQueryData<TvStatus>(TV_STATUS_KEY, ctx.previous);
      }
      pushToast({ tone: "danger", text: "Comando TV non riuscito" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: TV_STATUS_KEY });
    },
  });
}

export function useTvVolume() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation<{ ok: boolean }, ApiError, TvVolumeInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/volume", input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: TV_STATUS_KEY });
      const previous = qc.getQueryData<TvStatus>(TV_STATUS_KEY);
      qc.setQueryData<TvStatus>(TV_STATUS_KEY, (old) => {
        if (!old) return old;
        if (input.level !== undefined) {
          return { ...old, volume: input.level };
        }
        if (input.delta !== undefined) {
          const current = old.volume ?? 50;
          const next = input.delta === "up" ? Math.min(100, current + 5) : Math.max(0, current - 5);
          return { ...old, volume: next };
        }
        return old;
      });
      return { previous };
    },
    onError: (_err, _input, context) => {
      const ctx = context as { previous: TvStatus | undefined } | undefined;
      if (ctx?.previous !== undefined) {
        qc.setQueryData<TvStatus>(TV_STATUS_KEY, ctx.previous);
      }
      pushToast({ tone: "danger", text: "Volume non regolato" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: TV_STATUS_KEY });
    },
  });
}

export function useTvMute() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation<{ ok: boolean; muted: boolean }, ApiError, TvMuteInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/mute", input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: TV_STATUS_KEY });
      const previous = qc.getQueryData<TvStatus>(TV_STATUS_KEY);
      qc.setQueryData<TvStatus>(TV_STATUS_KEY, (old) => {
        if (!old) return old;
        const nextMuted = input.muted === "toggle" ? !old.muted : input.muted;
        return { ...old, muted: nextMuted };
      });
      return { previous };
    },
    onError: (_err, _input, context) => {
      const ctx = context as { previous: TvStatus | undefined } | undefined;
      if (ctx?.previous !== undefined) {
        qc.setQueryData<TvStatus>(TV_STATUS_KEY, ctx.previous);
      }
      pushToast({ tone: "danger", text: "Mute TV non riuscito" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: TV_STATUS_KEY });
    },
  });
}

export function useTvInput() {
  const invalidate = useInvalidateStatus();
  return useMutation<{ ok: boolean }, ApiError, TvInputSelectInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/input", input),
    onSuccess: invalidate,
  });
}

export function useTvApp() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation<{ ok: boolean }, ApiError, TvAppLaunchInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/app", input),
    onError: () => {
      pushToast({ tone: "danger", text: "App TV non avviata" });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: TV_STATUS_KEY });
    },
  });
}

export function useTvPlayback() {
  const invalidate = useInvalidateStatus();
  return useMutation<{ ok: boolean }, ApiError, TvPlaybackInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/playback", input),
    onSuccess: invalidate,
  });
}

export function useTvChannel() {
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation<{ ok: boolean }, ApiError, TvChannelInput>({
    mutationFn: (input) => apiClient.post("/api/v1/tv/channel", input),
    onError: () => {
      pushToast({ tone: "danger", text: "Canale non cambiato" });
    },
  });
}
