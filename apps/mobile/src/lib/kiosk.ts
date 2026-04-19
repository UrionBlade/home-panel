import { useEffect } from "react";

/**
 * Hook React per il plugin kiosk-basics di Tauri.
 *
 * Su iOS chiama i comandi nativi (idleTimerDisabled, ecc.).
 * On browser dev/desktop this is a no-op (Tauri invoke fails silently).
 */
export function useKioskMode(options?: { keepScreenOn?: boolean; fullscreen?: boolean }) {
  const keepScreenOn = options?.keepScreenOn ?? true;
  const fullscreen = options?.fullscreen ?? true;

  useEffect(() => {
    let mounted = true;

    async function applyKiosk() {
      if (typeof window === "undefined") return;
      const tauri = (
        window as unknown as {
          __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      if (!tauri?.invoke) return;

      try {
        await tauri.invoke("set_idle_timer_disabled", { disabled: keepScreenOn });
        await tauri.invoke("set_orientation_lock", { landscape_only: true });
        await tauri.invoke("set_fullscreen", { fullscreen });
        if (!mounted) return;
      } catch (err) {
        console.warn("[useKioskMode] failed to apply kiosk settings", err);
      }
    }

    void applyKiosk();

    return () => {
      mounted = false;
      const tauri = (
        window as unknown as {
          __TAURI_INTERNALS__?: { invoke?: (cmd: string, args?: unknown) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      if (!tauri?.invoke) return;
      void tauri.invoke("set_idle_timer_disabled", { disabled: false });
    };
  }, [keepScreenOn, fullscreen]);
}
