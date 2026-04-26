/**
 * Push notification registration on iOS (Tauri).
 *
 * On first run we ask the OS for permission, poll for the APNs device
 * token (Swift drops it into a global once iOS hands it over), and POST
 * it to the backend so the alarm fanout has a target. The token is
 * persisted in localStorage so subsequent launches skip the permission
 * dialog and the network roundtrip when nothing changed.
 */

import type {
  PushDevice,
  PushDevicesResponse,
  PushRegisterInput,
  PushRegisterResponse,
} from "@home-panel/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiClient } from "../api-client";

const PUSH_DEVICES_KEY = ["push", "devices"] as const;

/* localStorage keys — keep in sync with the registration hook below. */
const LS_TOKEN = "home-panel:push:token";
const LS_REGISTERED_AT = "home-panel:push:registered-at";

/** Best-effort detection of the Tauri runtime. Tauri 2 exposes
 *  `__TAURI_INTERNALS__.invoke` directly on `window`; the older
 *  `__TAURI__` namespace was retired in v2. We import `core` lazily so
 *  bundlers don't crash on browsers that lack the global. */
export function isTauriPlatform(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  return internals != null;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauriPlatform()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export function usePushDevices() {
  return useQuery({
    queryKey: PUSH_DEVICES_KEY,
    queryFn: () => apiClient.get<PushDevicesResponse>("/api/v1/push/devices"),
    staleTime: 30_000,
  });
}

export function useRegisterPushDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PushRegisterInput) =>
      apiClient.post<PushRegisterResponse>("/api/v1/push/register", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PUSH_DEVICES_KEY });
    },
  });
}

export function useRemovePushDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.delete<{ ok: true }>(`/api/v1/push/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: PUSH_DEVICES_KEY });
    },
  });
}

export function useTestPush() {
  return useMutation({
    mutationFn: (token?: string) =>
      apiClient.post<{ results: Array<{ token: string; ok: boolean; reason?: string }> }>(
        "/api/v1/push/test",
        token ? { token } : {},
      ),
  });
}

interface AutoRegisterOptions {
  /** Optional friendly label sent with the token (e.g. device model). */
  label?: string;
  /** Don't actually try to register. Useful when the user has explicitly
   *  declined or we want to gate registration behind a settings toggle. */
  paused?: boolean;
}

/**
 * Mounts a one-shot push registration: asks for permission, waits for
 * the APNs token, then POSTs it once. Idempotent — the backend dedupes
 * by token, and we cache the last-registered token in localStorage so
 * subsequent boots skip the network call when nothing changed.
 *
 * Lives at the AppShell level (mounted once, regardless of route).
 */
export function usePushAutoRegister(options: AutoRegisterOptions = {}) {
  const register = useRegisterPushDevice();
  const startedRef = useRef(false);

  useEffect(() => {
    if (options.paused) return;
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    async function bootstrap() {
      if (!isTauriPlatform()) return;

      try {
        /* Ask the user. Returns false on deny (or on platforms we don't
         * understand) — in that case we just bail out silently. */
        const granted = await tauriInvoke<boolean>("push_request_permission");
        if (!granted) return;

        /* iOS hands us the token via a Swift callback; poll until it
         * shows up. APNs typically responds in <1s, but on flaky
         * networks it can take longer. */
        let token: string | null = null;
        const start = Date.now();
        while (!cancelled && Date.now() - start < 30_000) {
          token = (await tauriInvoke<string | null>("push_get_token")) ?? null;
          if (token) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        if (cancelled || !token) return;

        const cached = localStorage.getItem(LS_TOKEN);
        if (cached === token) {
          /* Refresh the registration once a week so the backend can
           * tell which devices are still alive. */
          const lastIso = localStorage.getItem(LS_REGISTERED_AT);
          const lastMs = lastIso ? Date.parse(lastIso) : 0;
          if (Date.now() - lastMs < 7 * 24 * 60 * 60 * 1000) {
            return;
          }
        }

        await register.mutateAsync({
          token,
          platform: "ios",
          label: options.label ?? null,
        });

        localStorage.setItem(LS_TOKEN, token);
        localStorage.setItem(LS_REGISTERED_AT, new Date().toISOString());
      } catch (err) {
        console.warn("[push] auto-register failed:", err);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [options.paused, options.label, register.mutateAsync]);
}

/** Returns whether the locally stored token matches a registered device
 *  on the backend — handy for the Settings UI to show a green check. */
export function useThisDeviceRegistered(devices: PushDevice[]): boolean {
  const local = typeof localStorage !== "undefined" ? localStorage.getItem(LS_TOKEN) : null;
  if (!local) return false;
  return devices.some((d) => d.token === local);
}
