import type { KioskPhoto, KioskSettings, UpdateKioskSettingsInput } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const KIOSK_SETTINGS_KEY = ["kiosk-settings"] as const;
const KIOSK_PHOTOS_KEY = ["kiosk-photos"] as const;

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
    queryFn: () => apiClient.get<KioskPhoto[]>("/api/v1/kiosk/photos"),
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
