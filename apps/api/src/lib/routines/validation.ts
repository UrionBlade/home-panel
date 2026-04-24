/**
 * Runtime validators for routine trigger + step payloads.
 *
 * The schema stores both as JSON so bad data can sneak in over time — every
 * read through the routes/scheduler passes through these so malformed rows
 * are rejected up front instead of blowing up deep inside the action
 * dispatcher.
 */

import type {
  RoutineActionType,
  RoutineStep,
  RoutineTrigger,
  RoutineTriggerCron,
  RoutineTriggerTime,
  RoutineTriggerVoice,
} from "@home-panel/shared";

type Check = { ok: true } | { ok: false; error: string };

const OK: Check = { ok: true };
const err = (m: string): Check => ({ ok: false, error: m });

const ACTION_TYPES: ReadonlySet<RoutineActionType> = new Set<RoutineActionType>([
  "light.set",
  "light.toggle",
  "lights.room",
  "lights.all",
  "ac.power",
  "ac.set_mode",
  "ac.set_temp",
  "ac.set_fan",
  "blink.arm",
  "blink.disarm",
  "blink.arm_all",
  "blink.disarm_all",
  "spotify.play",
  "spotify.pause",
  "spotify.next",
  "spotify.previous",
  "spotify.volume",
  "spotify.play_uri",
  "tv.power",
  "tv.volume",
  "tv.mute",
  "tv.launch_app",
  "shopping.add",
  "timer.start",
  "timer.stop_all",
  "delay",
  "voice.speak",
]);

// Accepted cron shape: `m h dom month dow`. Each field is `*`, a number, a
// comma list, a range, or a step expression like `<asterisk>/n`.
const CRON_FIELD = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;
export function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((p) => CRON_FIELD.test(p));
}

export function isValidTrigger(trigger: unknown): Check {
  if (!trigger || typeof trigger !== "object") return err("trigger deve essere un oggetto");
  const t = trigger as { type?: unknown };
  switch (t.type) {
    case "time": {
      const cfg = trigger as RoutineTriggerTime;
      if (!Number.isInteger(cfg.hour) || cfg.hour < 0 || cfg.hour > 23)
        return err("hour 0-23 richiesto");
      if (!Number.isInteger(cfg.minute) || cfg.minute < 0 || cfg.minute > 59)
        return err("minute 0-59 richiesto");
      if (!Array.isArray(cfg.daysOfWeek)) return err("daysOfWeek deve essere array");
      for (const d of cfg.daysOfWeek) {
        if (!Number.isInteger(d) || d < 0 || d > 6)
          return err("daysOfWeek valori 0-6 (0 = domenica)");
      }
      return OK;
    }
    case "cron": {
      const cfg = trigger as RoutineTriggerCron;
      if (typeof cfg.expr !== "string" || !isValidCron(cfg.expr))
        return err("cron expr malformata (5 campi)");
      return OK;
    }
    case "voice": {
      const cfg = trigger as RoutineTriggerVoice;
      if (!Array.isArray(cfg.phrases) || cfg.phrases.length === 0)
        return err("almeno una phrase richiesta");
      for (const p of cfg.phrases) {
        if (typeof p !== "string" || !p.trim()) return err("phrases deve contenere stringhe");
      }
      return OK;
    }
    case "manual":
      return OK;
    default:
      return err(`tipo trigger sconosciuto: ${String(t.type)}`);
  }
}

export function isValidStep(step: unknown): Check {
  if (!step || typeof step !== "object") return err("step deve essere un oggetto");
  const s = step as { action?: unknown; params?: unknown };
  if (typeof s.action !== "string" || !ACTION_TYPES.has(s.action as RoutineActionType)) {
    return err(`action sconosciuta: ${String(s.action)}`);
  }
  const action = s.action as RoutineActionType;
  const p = (s.params ?? {}) as Record<string, unknown>;

  switch (action) {
    case "light.set":
      if (typeof p.lightId !== "string" || !p.lightId) return err("lightId richiesto");
      if (p.state !== "on" && p.state !== "off") return err("state on|off richiesto");
      return OK;
    case "light.toggle":
      if (typeof p.lightId !== "string" || !p.lightId) return err("lightId richiesto");
      return OK;
    case "lights.room":
      if (typeof p.roomId !== "string" || !p.roomId) return err("roomId richiesto");
      if (p.state !== "on" && p.state !== "off") return err("state on|off richiesto");
      return OK;
    case "lights.all":
      if (p.state !== "on" && p.state !== "off") return err("state on|off richiesto");
      return OK;
    case "ac.power":
      if (typeof p.deviceId !== "string" || !p.deviceId) return err("deviceId richiesto");
      if (typeof p.power !== "boolean") return err("power boolean richiesto");
      return OK;
    case "ac.set_mode":
      if (typeof p.deviceId !== "string" || !p.deviceId) return err("deviceId richiesto");
      if (!["cool", "heat", "dry", "fan", "auto"].includes(String(p.mode)))
        return err("mode non valida");
      return OK;
    case "ac.set_temp":
      if (typeof p.deviceId !== "string" || !p.deviceId) return err("deviceId richiesto");
      if (typeof p.targetTemp !== "number" || p.targetTemp < 16 || p.targetTemp > 32)
        return err("targetTemp 16-32 richiesto");
      return OK;
    case "ac.set_fan":
      if (typeof p.deviceId !== "string" || !p.deviceId) return err("deviceId richiesto");
      if (!["auto", "low", "mid", "high"].includes(String(p.fanSpeed)))
        return err("fanSpeed non valida");
      return OK;
    case "blink.arm":
    case "blink.disarm":
      if (typeof p.cameraId !== "string" || !p.cameraId) return err("cameraId richiesto");
      return OK;
    case "blink.arm_all":
    case "blink.disarm_all":
    case "spotify.play":
    case "spotify.pause":
    case "spotify.next":
    case "spotify.previous":
    case "timer.stop_all":
      return OK;
    case "spotify.volume":
      if (typeof p.volumePercent !== "number" || p.volumePercent < 0 || p.volumePercent > 100)
        return err("volumePercent 0-100 richiesto");
      return OK;
    case "spotify.play_uri":
      if (typeof p.contextUri !== "string" || !p.contextUri) return err("contextUri richiesto");
      return OK;
    case "tv.power":
      if (typeof p.on !== "boolean") return err("on boolean richiesto");
      return OK;
    case "tv.volume":
      if (typeof p.level !== "number" || p.level < 0 || p.level > 100)
        return err("level 0-100 richiesto");
      return OK;
    case "tv.mute":
      if (typeof p.muted !== "boolean") return err("muted boolean richiesto");
      return OK;
    case "tv.launch_app":
      if (typeof p.appId !== "string" || !p.appId) return err("appId richiesto");
      return OK;
    case "shopping.add":
      if (typeof p.name !== "string" || !p.name.trim()) return err("name richiesto");
      return OK;
    case "timer.start":
      if (
        typeof p.durationSeconds !== "number" ||
        !Number.isFinite(p.durationSeconds) ||
        p.durationSeconds <= 0 ||
        p.durationSeconds > 24 * 3600
      )
        return err("durationSeconds 1-86400 richiesto");
      return OK;
    case "delay":
      if (typeof p.ms !== "number" || p.ms < 0 || p.ms > 60_000) return err("ms 0-60000 richiesto");
      return OK;
    case "voice.speak":
      if (typeof p.text !== "string" || !p.text.trim()) return err("text richiesto");
      if (p.text.length > 500) return err("text max 500 caratteri");
      return OK;
  }
}

/** Parse a persisted trigger_config JSON blob plus its row discriminator
 * into the discriminated union. Throws on malformed JSON — callers are
 * expected to catch at the boundary. */
export function parseTrigger(type: string, configJson: string): RoutineTrigger {
  const cfg = JSON.parse(configJson) as Record<string, unknown>;
  switch (type) {
    case "time":
      return {
        type: "time",
        hour: Number(cfg.hour ?? 0),
        minute: Number(cfg.minute ?? 0),
        daysOfWeek: Array.isArray(cfg.daysOfWeek) ? (cfg.daysOfWeek as number[]) : [],
      };
    case "cron":
      return { type: "cron", expr: String(cfg.expr ?? "") };
    case "voice":
      return {
        type: "voice",
        phrases: Array.isArray(cfg.phrases) ? (cfg.phrases as string[]) : [],
      };
    case "manual":
      return { type: "manual" };
    default:
      throw new Error(`Trigger type sconosciuto: ${type}`);
  }
}

export function parseSteps(stepsJson: string): RoutineStep[] {
  const parsed = JSON.parse(stepsJson);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((s): s is RoutineStep => isValidStep(s).ok);
}
