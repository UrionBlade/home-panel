import type { KioskPhoto, KioskSettings, UpdateKioskSettingsInput } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const KIOSK_SETTINGS_KEY = ["kiosk-settings"] as const;
const KIOSK_PHOTOS_KEY = ["kiosk-photos"] as const;

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "";

/** Builds an absolute, browser-loadable URL for a kiosk photo. The backend
 * accepts `?token=` for paths consumed by raw `<img>` tags, since they can't
 * attach Authorization headers. Same pattern as IP camera snapshots. */
export function kioskPhotoUrl(filename: string): string {
  return `${API_BASE}/api/v1/kiosk/photos/${encodeURIComponent(filename)}?token=${encodeURIComponent(API_TOKEN)}`;
}

export function useKioskSettings() {
  return useQuery({
    queryKey: KIOSK_SETTINGS_KEY,
    queryFn: () => apiClient.get<KioskSettings>("/api/v1/kiosk/settings"),
  });
}

export function useUpdateKioskSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateKioskSettingsInput) =>
      apiClient.patch<KioskSettings>("/api/v1/kiosk/settings", input),
    onSuccess: (data) => {
      qc.setQueryData(KIOSK_SETTINGS_KEY, data);
    },
  });
}

export function useKioskPhotos() {
  return useQuery({
    queryKey: KIOSK_PHOTOS_KEY,
    queryFn: async () => {
      const list = await apiClient.get<KioskPhoto[]>("/api/v1/kiosk/photos");
      // Rewrite each url to include the token so <img> tags can load it
      // without an Authorization header.
      return list.map((p) => ({ ...p, url: kioskPhotoUrl(p.filename) }));
    },
  });
}

export function useRefreshKioskPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<{ refreshed: boolean; count: number }>("/api/v1/kiosk/photos/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KIOSK_PHOTOS_KEY });
    },
  });
}

export function useUploadKioskPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file, file.name);
      return apiClient.postFormData<KioskPhoto>("/api/v1/kiosk/photos", fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KIOSK_PHOTOS_KEY });
    },
  });
}

export function useDeleteKioskPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (filename: string) =>
      apiClient.delete<void>(`/api/v1/kiosk/photos/${encodeURIComponent(filename)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KIOSK_PHOTOS_KEY });
    },
  });
}
