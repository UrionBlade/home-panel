/**
 * Laundry voice commands — "quanto manca alla lavatrice", "a che punto è
 * l'asciugatrice", "la lavatrice è finita"... Follows the same self-contained
 * pattern as `tvIntents.ts` to keep the parser/dispatcher small.
 */

import type {
  LaundryAppliance,
  LaundryStatus,
  ParsedCommand,
  VoiceIntent,
} from "@home-panel/shared";
import { ApiError, apiClient } from "../api-client";
import { i18next } from "../i18n";

export type LaundryTarget = "washer" | "dryer" | "all";

const WASHER_RE = /\b(lavatrice|lavatr|washer|wash)\b/;
const DRYER_RE = /\b(asciugatrice|asciug|dryer|dry)\b/;
const BOTH_RE = /\b(bucato|lavanderia|laundry)\b/;

const STATUS_QUERY_RE =
  /\b(quanto\s+(manca|resta|rimane|rimangono|mancano)|a\s+che\s+punto|è\s+finita|ha\s+finito|ha\s+terminato|è\s+pronto|è\s+pronta|stato|status|how\s+much|how\s+long|left|remaining|done|finished|ready)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchLaundryIntent(raw: string): ParsedCommand | null {
  const text = normalize(raw);
  if (!text) return null;
  if (!STATUS_QUERY_RE.test(text)) return null;

  const hasWasher = WASHER_RE.test(text);
  const hasDryer = DRYER_RE.test(text);
  const hasBoth = BOTH_RE.test(text);

  let target: LaundryTarget;
  if (hasWasher && !hasDryer) target = "washer";
  else if (hasDryer && !hasWasher) target = "dryer";
  else if (hasWasher && hasDryer) target = "all";
  else if (hasBoth) target = "all";
  else return null;

  return {
    intent: "read_laundry_status",
    entities: { target },
    confidence: 1,
    raw: raw.trim(),
  };
}

/* ------------------------------------------------------------------------ */
/*  Handler                                                                  */
/* ------------------------------------------------------------------------ */

export function isLaundryIntent(intent: VoiceIntent): boolean {
  return intent === "read_laundry_status";
}

type VoiceVars = Record<string, string | number>;

function vt(key: string, vars?: VoiceVars): string {
  const out = i18next.t(
    `voice:responses.laundry.${key}` as never,
    (vars ?? {}) as never,
  ) as unknown as string | string[];
  if (Array.isArray(out)) return out[Math.floor(Math.random() * out.length)] ?? "";
  return out;
}

function vtArray(key: string): string[] {
  const out = i18next.t(
    `voice:responses.laundry.${key}` as never,
    {
      returnObjects: true,
    } as never,
  );
  return Array.isArray(out) ? (out as string[]) : [];
}

function interpolate(template: string, vars: VoiceVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(vars[k] ?? `{{${k}}}`));
}

function pick(variants: string[]): string {
  if (variants.length === 0) return "";
  return variants[Math.floor(Math.random() * variants.length)];
}

function pickFormat(key: string, vars: VoiceVars): string {
  const variants = vtArray(key);
  if (variants.length === 0) return vt(key, vars);
  return interpolate(pick(variants), vars);
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return vt("remaining.done");
  if (seconds < 60) return vt("remaining.underMinute");
  const totalMinutes = Math.round(seconds / 60);
  /* i18next handles _one/_other pluralization via the `count` option. */
  if (totalMinutes < 60) {
    return vt("remaining.minutes", { count: totalMinutes });
  }
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return vt("remaining.hoursOnly", { count: h });
  return vt("remaining.hoursAndMinutes", { hours: h, minutes: m });
}

function describeAppliance(app: LaundryAppliance, kindLabel: string): string {
  /* machineState: "stop" | "run" | "pause"; jobState includes "finish" when done */
  if (app.jobState === "finish") return pickFormat("status.finished", { kind: kindLabel });
  if (app.machineState === "pause") return pickFormat("status.paused", { kind: kindLabel });
  if (app.machineState === "stop" || !app.power) {
    return pickFormat("status.idle", { kind: kindLabel });
  }
  if (app.completionTime) {
    const remainingMs = new Date(app.completionTime).getTime() - Date.now();
    const remainingSec = Math.max(0, Math.round(remainingMs / 1000));
    const humanRemaining = formatRemaining(remainingSec);
    return pickFormat("status.running", { kind: kindLabel, remaining: humanRemaining });
  }
  return pickFormat("status.runningNoEta", { kind: kindLabel });
}

function kindLabel(type: "washer" | "dryer"): string {
  return vt(`kind.${type}`);
}

export async function handleLaundryIntent(command: ParsedCommand): Promise<string | null> {
  if (!isLaundryIntent(command.intent)) return null;

  let data: LaundryStatus;
  try {
    data = await apiClient.get<LaundryStatus>("/api/v1/laundry/status");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 502 || err.status >= 500)) {
      return vt("error.upstream");
    }
    return vt("error.generic");
  }

  if (!data.configured) return vt("notConfigured");

  const target = (command.entities.target as LaundryTarget | undefined) ?? "all";
  const washer = data.appliances.find((a) => a.type === "washer");
  const dryer = data.appliances.find((a) => a.type === "dryer");

  if (target === "washer") {
    if (!washer) return vt("missing.washer");
    return describeAppliance(washer, kindLabel("washer"));
  }
  if (target === "dryer") {
    if (!dryer) return vt("missing.dryer");
    return describeAppliance(dryer, kindLabel("dryer"));
  }

  /* target === "all" */
  const parts: string[] = [];
  if (washer) parts.push(describeAppliance(washer, kindLabel("washer")));
  if (dryer) parts.push(describeAppliance(dryer, kindLabel("dryer")));
  if (parts.length === 0) return vt("missing.both");
  return parts.join(" ");
}
