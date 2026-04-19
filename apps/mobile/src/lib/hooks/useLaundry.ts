import type {
  LaundryCommandInput,
  LaundryStatus,
  SmartThingsAssignInput,
  SmartThingsConfig,
  SmartThingsDevice,
  SmartThingsSetupInput,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../api-client";

const LAUNDRY_STATUS_KEY = ["laundry", "status"] as const;
const LAUNDRY_CONFIG_KEY = ["laundry", "config"] as const;
const LAUNDRY_DEVICES_KEY = ["laundry", "devices"] as const;

/** Stato lavatrice/asciugatrice — poll ogni 30s */
export function useLaundryStatus() {
  return useQuery({
    queryKey: LAUNDRY_STATUS_KEY,
    queryFn: () => apiClient.get<LaundryStatus>("/api/v1/laundry/status"),
    refetchInterval: (query) => (query.state.data?.configured ? 30_000 : false),
  });
}

/** Config SmartThings */
export function useLaundryConfig() {
  return useQuery({
    queryKey: LAUNDRY_CONFIG_KEY,
    queryFn: () => apiClient.get<SmartThingsConfig>("/api/v1/laundry/config"),
  });
}

/** Lista device SmartThings disponibili */
export function useSmartThingsDevices(enabled: boolean) {
  return useQuery({
    queryKey: LAUNDRY_DEVICES_KEY,
    queryFn: () => apiClient.get<SmartThingsDevice[]>("/api/v1/laundry/devices"),
    enabled,
  });
}

/** Setup PAT SmartThings */
export function useSmartThingsSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SmartThingsSetupInput) =>
      apiClient.post<{ ok: boolean }>("/api/v1/laundry/config", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAUNDRY_CONFIG_KEY });
      void qc.invalidateQueries({ queryKey: LAUNDRY_STATUS_KEY });
      void qc.invalidateQueries({ queryKey: LAUNDRY_DEVICES_KEY });
    },
  });
}

/** Disconnetti SmartThings */
export function useSmartThingsLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<{ ok: boolean }>("/api/v1/laundry/config"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAUNDRY_CONFIG_KEY });
      void qc.invalidateQueries({ queryKey: LAUNDRY_STATUS_KEY });
    },
  });
}

/** Assegna device lavatrice/asciugatrice */
export function useAssignDevices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SmartThingsAssignInput) =>
      apiClient.patch<{ ok: boolean }>("/api/v1/laundry/config/devices", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAUNDRY_CONFIG_KEY });
      void qc.invalidateQueries({ queryKey: LAUNDRY_STATUS_KEY });
    },
  });
}

/** Forza refresh stato */
export function useRefreshLaundry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<{ ok: boolean }>("/api/v1/laundry/refresh"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAUNDRY_STATUS_KEY });
    },
  });
}

/** Invia comando (start/stop/pause) */
export function useLaundryCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LaundryCommandInput) =>
      apiClient.post<{ ok: boolean }>("/api/v1/laundry/command", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAUNDRY_STATUS_KEY });
    },
  });
}
