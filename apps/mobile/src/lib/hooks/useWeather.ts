import type { CurrentWeather, WeatherForecastResponse, WeatherLocation } from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const KEY = ["weather"] as const;
const LOCATIONS_KEY = [...KEY, "locations"] as const;

export function useCurrentWeather(locationId?: string) {
  return useQuery({
    queryKey: [...KEY, "current", locationId],
    queryFn: () =>
      apiClient.get<CurrentWeather>(
        `/api/v1/weather/current${locationId ? `?locationId=${locationId}` : ""}`,
      ),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}

export function useWeatherForecast(locationId?: string, days = 7) {
  return useQuery({
    queryKey: [...KEY, "forecast", locationId, days],
    queryFn: () =>
      apiClient.get<WeatherForecastResponse>(
        `/api/v1/weather/forecast?days=${days}${locationId ? `&locationId=${locationId}` : ""}`,
      ),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });
}

export function useWeatherLocations() {
  return useQuery({
    queryKey: LOCATIONS_KEY,
    queryFn: () => apiClient.get<WeatherLocation[]>("/api/v1/weather/locations"),
    staleTime: 60 * 60 * 1000,
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      label: string;
      latitude: number;
      longitude: number;
      isDefault?: boolean;
    }) => apiClient.post<WeatherLocation>("/api/v1/weather/locations", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      label?: string;
      latitude?: number;
      longitude?: number;
    }) => apiClient.patch<WeatherLocation>(`/api/v1/weather/locations/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/weather/locations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useSetDefaultLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<WeatherLocation>(`/api/v1/weather/locations/${id}/set-default`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOCATIONS_KEY });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
