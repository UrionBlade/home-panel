/**
 * Routine action dispatcher.
 *
 * Every `RoutineStep` is routed to a small executor that either:
 *  - calls the matching public route through `internalFetch` (reuses
 *    validation, auth, upstream provider clients and optimistic DB writes),
 *  - or handles a meta-action inline (`delay`, `voice.speak`).
 *
 * Client-only side-effects (currently only `voice.speak`) are pushed into the
 * `clientActions` array carried by `RoutineRunContext` so the caller can
 * forward them to the panel or the voice client. The server never tries to
 * synthesise speech itself.
 */

import type { RoutineClientAction, RoutineStep, RoutineStepResult } from "@home-panel/shared";
import { InternalFetchError, internalFetch } from "../internal-fetch.js";

export interface RoutineRunContext {
  clientActions: RoutineClientAction[];
}

export async function runStep(
  index: number,
  step: RoutineStep,
  ctx: RoutineRunContext,
): Promise<RoutineStepResult> {
  try {
    const spokenText = await dispatch(step, ctx);
    return { index, action: step.action, ok: true, ...(spokenText ? { spokenText } : {}) };
  } catch (err) {
    const message = extractMessage(err);
    return { index, action: step.action, ok: false, error: message };
  }
}

/** Returns the spoken text for `voice.speak` steps, undefined otherwise. */
async function dispatch(step: RoutineStep, ctx: RoutineRunContext): Promise<string | undefined> {
  switch (step.action) {
    // ---- Lights ----
    case "light.set":
      await internalFetch("POST", `/lights/${encodeURIComponent(step.params.lightId)}`, {
        state: step.params.state,
      });
      return;
    case "light.toggle":
      await internalFetch("POST", `/lights/${encodeURIComponent(step.params.lightId)}/toggle`);
      return;
    case "lights.room": {
      const all = await internalFetch<Array<{ id: string; roomId: string | null }>>(
        "GET",
        "/lights",
      );
      const inRoom = all.filter((l) => l.roomId === step.params.roomId);
      if (inRoom.length === 0) throw new Error("no lights in room");
      await Promise.all(
        inRoom.map((l) =>
          internalFetch("POST", `/lights/${encodeURIComponent(l.id)}`, {
            state: step.params.state,
          }),
        ),
      );
      return;
    }
    case "lights.all": {
      const all = await internalFetch<Array<{ id: string }>>("GET", "/lights");
      if (all.length === 0) return;
      await Promise.all(
        all.map((l) =>
          internalFetch("POST", `/lights/${encodeURIComponent(l.id)}`, {
            state: step.params.state,
          }),
        ),
      );
      return;
    }

    // ---- AC ----
    case "ac.power":
      await internalFetch(
        "POST",
        `/ac/devices/${encodeURIComponent(step.params.deviceId)}/command`,
        { power: step.params.power },
      );
      return;
    case "ac.set_mode":
      await internalFetch(
        "POST",
        `/ac/devices/${encodeURIComponent(step.params.deviceId)}/command`,
        { mode: step.params.mode },
      );
      return;
    case "ac.set_temp":
      await internalFetch(
        "POST",
        `/ac/devices/${encodeURIComponent(step.params.deviceId)}/command`,
        { targetTemp: step.params.targetTemp },
      );
      return;
    case "ac.set_fan":
      await internalFetch(
        "POST",
        `/ac/devices/${encodeURIComponent(step.params.deviceId)}/command`,
        { fanSpeed: step.params.fanSpeed },
      );
      return;

    // ---- Blink cameras ----
    case "blink.arm":
      await internalFetch("POST", `/blink/cameras/${encodeURIComponent(step.params.cameraId)}/arm`);
      return;
    case "blink.disarm":
      await internalFetch(
        "POST",
        `/blink/cameras/${encodeURIComponent(step.params.cameraId)}/disarm`,
      );
      return;
    case "blink.arm_all":
    case "blink.disarm_all": {
      const cameras = await internalFetch<Array<{ id: string; deviceType?: string }>>(
        "GET",
        "/blink/cameras",
      );
      if (cameras.length === 0) return;
      const verb = step.action === "blink.arm_all" ? "arm" : "disarm";
      /* Run sequentially: the Blink API rate-limits aggressively and parallel
       * arm/disarm calls occasionally return 429. Cost is a handful of cams so
       * serial is fine.
       *
       * Per-camera failures are tolerated and logged — a Blink doorbell or
       * an offline cam returning 404/500 from upstream must not abort the
       * whole "Disattiva allarme" routine, which the user expects to be
       * best-effort across the fleet. The first failure is captured so we
       * can surface it as a warning without throwing. */
      const failures: Array<{ id: string; reason: string }> = [];
      for (const cam of cameras) {
        try {
          await internalFetch("POST", `/blink/cameras/${encodeURIComponent(cam.id)}/${verb}`);
        } catch (err) {
          const reason =
            err instanceof InternalFetchError
              ? `HTTP ${err.status}: ${err.message}`
              : err instanceof Error
                ? err.message
                : "unknown";
          failures.push({ id: cam.id, reason });
          console.warn(`[routines] blink.${verb} skipped ${cam.id}: ${reason}`);
        }
      }
      if (failures.length === cameras.length) {
        throw new Error(
          `Tutte le ${cameras.length} camere Blink hanno fallito ${verb}: ${failures
            .map((f) => f.reason)
            .join("; ")}`,
        );
      }
      return;
    }

    // ---- Spotify ----
    case "spotify.play":
      await internalFetch("PUT", "/spotify/playback/play", {});
      return;
    case "spotify.pause":
      await internalFetch("PUT", "/spotify/playback/pause");
      return;
    case "spotify.next":
      await internalFetch("POST", "/spotify/playback/next");
      return;
    case "spotify.previous":
      await internalFetch("POST", "/spotify/playback/previous");
      return;
    case "spotify.volume":
      await internalFetch("PUT", "/spotify/playback/volume", {
        volumePercent: clamp(step.params.volumePercent, 0, 100),
      });
      return;
    case "spotify.play_uri":
      await internalFetch("PUT", "/spotify/playback/play", {
        contextUri: step.params.contextUri,
      });
      return;

    // ---- TV ----
    case "tv.power":
      await internalFetch("POST", "/tv/power", { on: step.params.on });
      return;
    case "tv.volume":
      await internalFetch("POST", "/tv/volume", {
        level: clamp(Math.round(step.params.level), 0, 100),
      });
      return;
    case "tv.mute":
      await internalFetch("POST", "/tv/mute", { muted: step.params.muted });
      return;
    case "tv.launch_app":
      await internalFetch("POST", "/tv/app", { appId: step.params.appId });
      return;

    // ---- Shopping ----
    case "shopping.add":
      await internalFetch("POST", "/shopping/items/by-name", { name: step.params.name });
      return;

    // ---- Home alarm ----
    case "alarm.arm": {
      const mode = step.params?.mode?.trim();
      await internalFetch("POST", "/alarm/arm", mode ? { mode } : {});
      return;
    }
    case "alarm.disarm":
      await internalFetch("POST", "/alarm/disarm", {});
      return;

    // ---- Timers ----
    case "timer.start":
      await internalFetch("POST", "/timers/timers", {
        durationSeconds: step.params.durationSeconds,
        label: step.params.label ?? null,
      });
      return;
    case "timer.stop_all": {
      const timers = await internalFetch<Array<{ id: string }>>("GET", "/timers/timers");
      for (const t of timers) {
        await internalFetch("DELETE", `/timers/timers/${encodeURIComponent(t.id)}`);
      }
      return;
    }

    // ---- Meta ----
    case "delay": {
      const ms = Math.max(0, Math.min(60_000, step.params.ms));
      await new Promise((r) => setTimeout(r, ms));
      return;
    }
    case "voice.speak": {
      const text = step.params.text.trim();
      if (text) {
        ctx.clientActions.push({ action: "voice.speak", text });
      }
      return text || undefined;
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function extractMessage(err: unknown): string {
  if (err instanceof InternalFetchError) return `[${err.status}] ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
