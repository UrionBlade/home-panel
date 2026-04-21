/**
 * TV voice commands — self-contained matcher + handlers.
 *
 * Extends the base `voiceCommandParser` / `intentHandlers` with TV-specific
 * behaviour. Kept in its own module so that other device integrations can
 * follow the same pattern without touching the core parser.
 */

import type { ParsedCommand, VoiceIntent } from "@home-panel/shared";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../api-client";
import { i18next } from "../i18n";
import { extractItalianNumber } from "./numberWords";

const TV_KEYWORDS = /\b(tv|televisione|television|televisore)\b/;

const APP_ALIASES: Array<{ key: string; re: RegExp }> = [
  { key: "netflix", re: /\bnetflix\b/ },
  { key: "youtube", re: /\byou\s*tube\b|\byoutube\b/ },
  { key: "prime", re: /\bprime(\s+video)?\b|\bamazon\s+prime\b/ },
  { key: "disney", re: /\bdisney(\s*plus|\+)?\b/ },
  { key: "raiplay", re: /\brai\s*play\b|\brai\b/ },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function matchHdmi(text: string): string | null {
  const m = text.match(/\bhdmi\s*([1-4]?)\b/);
  if (m) return `HDMI${m[1] || "1"}`;
  if (/\b(digital\s*tv|tv\s*digital[ei]?|digitale)\b/.test(text)) return "digitalTv";
  return null;
}

/** Check text against TV intents. Returns a ParsedCommand or null. */
export function matchTvIntent(raw: string): ParsedCommand | null {
  const text = normalize(raw);
  if (!text) return null;

  /* App launch — independent of the "tv" keyword so "metti netflix" works. */
  if (
    /\b(metti|apri|apri\s+su|fai\s+partire|lancia|guardiamo|mettiamo|put\s+on|open|launch)\b/.test(
      text,
    )
  ) {
    for (const { key, re } of APP_ALIASES) {
      if (re.test(text)) {
        return {
          intent: "tv_launch_app",
          entities: { appKey: key },
          confidence: 1,
          raw: raw.trim(),
        };
      }
    }
  }

  const hasTv = TV_KEYWORDS.test(text);

  /* Power — requires "tv" in the sentence to avoid clashing with generic stop/cancel. */
  if (hasTv) {
    if (/\b(accendi|accendere|turn\s+on|power\s+on)\b/.test(text)) {
      return tvCommand("tv_power_on", raw);
    }
    if (/\b(spegni|spegnere|turn\s+off|power\s+off)\b/.test(text)) {
      return tvCommand("tv_power_off", raw);
    }
    if (/\b(muta|silenzia|mute)\b/.test(text) && !/\b(togli|disattiva|unmute)\b/.test(text)) {
      return tvCommand("tv_mute", raw);
    }
    if (/\b(togli\s+(il\s+)?muto|riattiva\s+(l['ʼ']?)?audio|unmute)\b/.test(text)) {
      return tvCommand("tv_unmute", raw);
    }
  }

  /* Volume — triggered by the "volume" token itself. */
  if (/\bvolume\b/.test(text) || /\b(alza|aumenta|abbassa|diminuisci)\b/.test(text)) {
    const level = extractItalianNumber(text);
    if (level !== null && /\bvolume\b/.test(text)) {
      const clamped = Math.max(0, Math.min(100, Math.round(level)));
      return {
        intent: "tv_volume_set",
        entities: { level: String(clamped) },
        confidence: 1,
        raw: raw.trim(),
      };
    }
    if (/\b(alza|aumenta|più\s+(forte|alto)|su|volume\s+up|louder)\b/.test(text)) {
      return tvCommand("tv_volume_up", raw);
    }
    if (/\b(abbassa|diminuisci|più\s+(piano|basso)|giù|volume\s+down|softer)\b/.test(text)) {
      return tvCommand("tv_volume_down", raw);
    }
  }

  /* Input switch. */
  if (/\b(passa|cambia|input|source|sorgente|switch)\b/.test(text)) {
    const source = matchHdmi(text);
    if (source) {
      return {
        intent: "tv_input_set",
        entities: { source },
        confidence: 1,
        raw: raw.trim(),
      };
    }
  }

  return null;
}

function tvCommand(intent: VoiceIntent, raw: string): ParsedCommand {
  return { intent, entities: {}, confidence: 1, raw: raw.trim() };
}

/* ------------------------------------------------------------------------ */
/*  Handlers                                                                 */
/* ------------------------------------------------------------------------ */

const TV_INTENTS = new Set<VoiceIntent>([
  "tv_power_on",
  "tv_power_off",
  "tv_volume_up",
  "tv_volume_down",
  "tv_volume_set",
  "tv_mute",
  "tv_unmute",
  "tv_launch_app",
  "tv_input_set",
]);

export function isTvIntent(intent: VoiceIntent): boolean {
  return TV_INTENTS.has(intent);
}

type VoiceVars = Record<string, string | number>;

function vt(key: string, vars?: VoiceVars): string {
  const out = i18next.t(`voice:responses.tv.${key}` as never, (vars ?? {}) as never) as unknown as
    | string
    | string[];
  if (Array.isArray(out)) return pickVariant(out);
  return out;
}

function vtArray(key: string): string[] {
  const out = i18next.t(
    `voice:responses.tv.${key}` as never,
    {
      returnObjects: true,
    } as never,
  );
  return Array.isArray(out) ? (out as string[]) : [];
}

function pickVariant(variants: string[]): string {
  if (variants.length === 0) return "";
  return variants[Math.floor(Math.random() * variants.length)];
}

function pickSuccess(key: string, vars?: VoiceVars): string {
  const variants = vtArray(`${key}.success`);
  if (variants.length === 0) return vt(`${key}.success`, vars);
  const picked = pickVariant(variants);
  if (!vars) return picked;
  return interpolate(picked, vars);
}

function interpolate(template: string, vars: VoiceVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(vars[k] ?? `{{${k}}}`));
}

function mapUpstreamVoiceResponse(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404) return pickVariant(vtArray("notConfigured"));
    return pickVariant(vtArray("upstreamError"));
  }
  return pickVariant(vtArray("upstreamError"));
}

const APP_LABEL_BY_KEY: Record<string, string> = {
  netflix: "Netflix",
  youtube: "YouTube",
  prime: "Prime Video",
  disney: "Disney+",
  raiplay: "RaiPlay",
};

const APP_ID_BY_KEY: Record<string, string> = {
  netflix: "org.tizen.netflix-app",
  youtube: "111299001912",
  prime: "3201512006785",
  disney: "3201901017640",
  raiplay: "3201611010011",
};

/** Execute a TV intent, returning the voice response. `null` if the intent is
 *  not a TV one. */
export async function handleTvIntent(
  command: ParsedCommand,
  qc: QueryClient | null,
): Promise<string | null> {
  if (!isTvIntent(command.intent)) return null;

  const invalidate = () => {
    void qc?.invalidateQueries({ queryKey: ["tv", "status"] });
  };

  try {
    switch (command.intent) {
      case "tv_power_on":
        await apiClient.post("/api/v1/tv/power", { on: true });
        invalidate();
        return pickSuccess("powerOn");

      case "tv_power_off":
        await apiClient.post("/api/v1/tv/power", { on: false });
        invalidate();
        return pickSuccess("powerOff");

      case "tv_volume_up":
        await apiClient.post("/api/v1/tv/volume", { delta: "up" });
        invalidate();
        return pickSuccess("volumeUp");

      case "tv_volume_down":
        await apiClient.post("/api/v1/tv/volume", { delta: "down" });
        invalidate();
        return pickSuccess("volumeDown");

      case "tv_volume_set": {
        const levelStr = command.entities.level;
        const level = levelStr ? Number.parseInt(levelStr, 10) : Number.NaN;
        if (!Number.isFinite(level) || level < 0 || level > 100) {
          return vt("volumeSet.outOfRange");
        }
        await apiClient.post("/api/v1/tv/volume", { level });
        invalidate();
        return pickSuccess("volumeSet", { level });
      }

      case "tv_mute":
        await apiClient.post("/api/v1/tv/mute", { muted: true });
        invalidate();
        return pickSuccess("mute");

      case "tv_unmute":
        await apiClient.post("/api/v1/tv/mute", { muted: false });
        invalidate();
        return pickSuccess("unmute");

      case "tv_launch_app": {
        const appKey = command.entities.appKey ?? "";
        const appId = APP_ID_BY_KEY[appKey];
        const label = APP_LABEL_BY_KEY[appKey] ?? appKey;
        if (!appId) return pickVariant(vtArray("upstreamError"));
        await apiClient.post("/api/v1/tv/app", { appId });
        invalidate();
        return interpolate(pickVariant(vtArray("appLaunched")), { name: label });
      }

      case "tv_input_set": {
        const source = command.entities.source ?? "";
        if (!source) return vt("inputSet.unsupported");
        try {
          await apiClient.post("/api/v1/tv/input", { source });
          invalidate();
          return pickSuccess("inputSet", { source });
        } catch (err) {
          if (err instanceof ApiError && err.status === 400) {
            return vt("inputSet.unsupported");
          }
          return mapUpstreamVoiceResponse(err);
        }
      }

      default:
        return null;
    }
  } catch (err) {
    return mapUpstreamVoiceResponse(err);
  }
}
