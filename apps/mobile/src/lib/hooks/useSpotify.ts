import type {
  SpotifyAuthStatus,
  SpotifyDevice,
  SpotifyPlaybackState,
  SpotifyPlaylist,
  SpotifySearchResults,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const SPOTIFY_STATUS_KEY = ["spotify", "status"] as const;
const SPOTIFY_PLAYBACK_KEY = ["spotify", "playback"] as const;
const SPOTIFY_DEVICES_KEY = ["spotify", "devices"] as const;
const SPOTIFY_PLAYLISTS_KEY = ["spotify", "playlists"] as const;

export function useSpotifyStatus() {
  return useQuery({
    queryKey: SPOTIFY_STATUS_KEY,
    queryFn: () => apiClient.get<SpotifyAuthStatus>("/api/v1/spotify/status"),
  });
}

export function useSpotifyPlayback() {
  return useQuery({
    queryKey: SPOTIFY_PLAYBACK_KEY,
    queryFn: () => apiClient.get<SpotifyPlaybackState>("/api/v1/spotify/playback"),
    refetchInterval: 4000,
  });
}

export function useSpotifyDevices() {
  return useQuery({
    queryKey: SPOTIFY_DEVICES_KEY,
    queryFn: () => apiClient.get<SpotifyDevice[]>("/api/v1/spotify/devices"),
    refetchInterval: 10_000,
  });
}

export function useSpotifyPlaylists() {
  return useQuery({
    queryKey: SPOTIFY_PLAYLISTS_KEY,
    queryFn: () => apiClient.get<SpotifyPlaylist[]>("/api/v1/spotify/playlists"),
  });
}

export function useSpotifySearch(query: string) {
  return useQuery({
    queryKey: ["spotify", "search", query] as const,
    queryFn: () =>
      apiClient.get<SpotifySearchResults>(`/api/v1/spotify/search?q=${encodeURIComponent(query)}`),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

export function useSpotifyPlay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { uris?: string[]; contextUri?: string; deviceId?: string }) =>
      apiClient.put<void>("/api/v1/spotify/playback/play", body ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.put<void>("/api/v1/spotify/playback/pause"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyNext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<void>("/api/v1/spotify/playback/next"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyPrevious() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<void>("/api/v1/spotify/playback/previous"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (volumePercent: number) =>
      apiClient.put<void>("/api/v1/spotify/playback/volume", {
        volumePercent,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyShuffle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (state: boolean) =>
      apiClient.put<void>("/api/v1/spotify/playback/shuffle", { state }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyRepeat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (state: "off" | "context" | "track") =>
      apiClient.put<void>("/api/v1/spotify/playback/repeat", { state }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deviceId, play }: { deviceId: string; play?: boolean }) =>
      apiClient.put<void>("/api/v1/spotify/playback/transfer", {
        deviceId,
        play,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyAuthUrl() {
  return useMutation({
    mutationFn: () => apiClient.get<{ url: string }>("/api/v1/spotify/auth-url"),
  });
}

export function useSpotifyCallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      apiClient.post<{ ok: boolean }>("/api/v1/spotify/callback", { code }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
    },
  });
}

export function useSpotifyLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ ok: boolean }>("/api/v1/spotify/credentials"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SPOTIFY_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYBACK_KEY });
      void qc.invalidateQueries({ queryKey: SPOTIFY_DEVICES_KEY });
      void qc.invalidateQueries({ queryKey: SPOTIFY_PLAYLISTS_KEY });
    },
  });
}
