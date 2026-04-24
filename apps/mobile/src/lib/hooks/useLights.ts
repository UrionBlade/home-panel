/**
 * Lights — TanStack Query hooks.
 *
 * Backend contract: apps/api/src/routes/lights.ts
 * Provider: eWeLink (today). Adding a second provider will not change this
 * surface; the state shape stays provider-agnostic.
 */

import type {
  EwelinkCredentialsInput,
  EwelinkCredentialsStatus,
  LightCommandInput,
  LightState,
  LightSummary,
  LightSyncResult,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUiStore } from "../../store/ui-store";
import { apiClient } from "../api-client";
import { i18next } from "../i18n";

const LIGHTS_KEY = ["lights"] as const;
const EWELINK_CREDS_KEY = ["lights", "ewelink", "credentials"] as const;

/** Poll lights every 60s so drift from the vendor app is reconciled. */
export function useLights() {
  return useQuery({
    queryKey: LIGHTS_KEY,
    queryFn: () => apiClient.get<LightSummary[]>("/api/v1/lights"),
    refetchInterval: 60_000,
  });
}

/** Panel-side metadata edit: rename and/or reassign room for a light. */
export function useUpdateLight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name?: string; roomId?: string | null } }) =>
      apiClient.patch<LightSummary>(`/api/v1/lights/${id}`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: LIGHTS_KEY }),
  });
}

export function useEwelinkCredentials() {
  return useQuery({
    queryKey: EWELINK_CREDS_KEY,
    queryFn: () =>
      apiClient.get<EwelinkCredentialsStatus>("/api/v1/lights/providers/ewelink/credentials"),
  });
}

/**
 * Send on/off to a light with optimistic feedback.
 *
 * We don't wait for the server roundtrip before flipping the UI — the user
 * just tapped a switch, they expect it to move instantly. On failure we roll
 * back and surface a toast.
 */
export function useLightCommand() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);

  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & LightCommandInput) =>
      apiClient.post<{ ok: boolean; state: LightState }>(`/api/v1/lights/${id}`, input),
    onMutate: async ({ id, state, toggle }) => {
      await qc.cancelQueries({ queryKey: LIGHTS_KEY });
      const previous = qc.getQueryData<LightSummary[]>(LIGHTS_KEY);
      qc.setQueryData<LightSummary[]>(LIGHTS_KEY, (old) => {
        if (!old) return old;
        return old.map((l) => {
          if (l.id !== id) return l;
          let next: LightState;
          if (state === "on" || state === "off") {
            next = state;
          } else if (toggle) {
            next = l.state === "on" ? "off" : "on";
          } else {
            next = l.state;
          }
          return { ...l, state: next };
        });
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      const ctx = context as { previous: LightSummary[] | undefined } | undefined;
      if (ctx?.previous) qc.setQueryData(LIGHTS_KEY, ctx.previous);
      pushToast({ tone: "danger", text: i18next.t("lights:command.error") });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: LIGHTS_KEY });
    },
  });
}

export function useSyncLights() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: () => apiClient.post<LightSyncResult>("/api/v1/lights/sync"),
    onSuccess: (result) => {
      pushToast({
        tone: "success",
        text: i18next.t("lights:sync.success", { count: result.total }),
      });
      void qc.invalidateQueries({ queryKey: LIGHTS_KEY });
    },
    onError: () => {
      pushToast({ tone: "danger", text: i18next.t("lights:sync.error") });
    },
  });
}

export function useSaveEwelinkCredentials() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (input: EwelinkCredentialsInput) =>
      apiClient.put<EwelinkCredentialsStatus>(
        "/api/v1/lights/providers/ewelink/credentials",
        input,
      ),
    onSuccess: () => {
      pushToast({ tone: "success", text: i18next.t("lights:settings.success.connected") });
      void qc.invalidateQueries({ queryKey: EWELINK_CREDS_KEY });
      void qc.invalidateQueries({ queryKey: LIGHTS_KEY });
    },
  });
}

/** Poll credentials while the user completes the OAuth consent flow in
 * a popup. A short interval (1.5s) keeps the "waiting" state snappy; the
 * consumer enables/disables polling via the `enabled` flag. */
export function useEwelinkCredentialsPolled(enabled: boolean) {
  return useQuery({
    queryKey: EWELINK_CREDS_KEY,
    queryFn: () =>
      apiClient.get<EwelinkCredentialsStatus>("/api/v1/lights/providers/ewelink/credentials"),
    refetchInterval: enabled ? 1500 : false,
  });
}

export function useStartEwelinkOAuth() {
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (region?: "eu" | "us" | "as" | "cn") =>
      apiClient.post<{ authorizationUrl: string; state: string }>(
        "/api/v1/lights/providers/ewelink/oauth/start",
        region ? { region } : {},
      ),
    onError: (err) => {
      const msg =
        err instanceof Error ? err.message : i18next.t("lights:settings.errors.saveFailed");
      pushToast({ tone: "danger", text: msg });
    },
  });
}

export function useDisconnectEwelink() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: () =>
      apiClient.delete<{ ok: boolean }>("/api/v1/lights/providers/ewelink/credentials"),
    onSuccess: () => {
      pushToast({ tone: "success", text: i18next.t("lights:settings.success.disconnected") });
      void qc.invalidateQueries({ queryKey: EWELINK_CREDS_KEY });
      void qc.invalidateQueries({ queryKey: LIGHTS_KEY });
    },
  });
}
