/**
 * Lights voice commands — "accendi la luce in cucina", "spegni tutte le luci",
 * "luce soggiorno off"... Self-contained matcher + handler, same pattern as
 * `tvIntents.ts` and `laundryIntents.ts`.
 *
 * Name resolution happens inside the handler against the cached `/lights`
 * query data: the matcher only extracts the raw subject text.
 */

import type { LightSummary, ParsedCommand, Room, VoiceIntent } from "@home-panel/shared";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../api-client";
import { i18next } from "../i18n";

const LIGHT_KEYWORD_RE =
  /\b(luce|luci|light|lights|lampada|lampade|lamp|lamps|lampadina|lampadine)\b/;
const ON_VERB_RE = /\b(accendi|accendere|attiva|attivare|turn\s+on|switch\s+on|light\s+up)\b/;
const OFF_VERB_RE =
  /\b(spegni|spegnere|disattiva|disattivare|turn\s+off|switch\s+off|shut\s+off)\b/;
const ALL_RE = /\b(tutte|tutti|tutta|tutto|all|every|everything)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip verbs, the "luce/luci" token, filler words and leading articles so
 * what remains is something close to "cucina" or "ingresso" or "angolo lettura".
 */
function extractSubject(normalized: string): string {
  const REMOVE_RE = [
    /\b(accendi|accendere|attiva|attivare|spegni|spegnere|disattiva|disattivare)\b/g,
    /\b(turn\s+on|turn\s+off|switch\s+on|switch\s+off|light\s+up|shut\s+off)\b/g,
    /\b(luce|luci|light|lights|lampada|lampade|lamp|lamps|lampadina|lampadine)\b/g,
    /\b(per\s+favore|favore|grazie|please|ok|okay|ehi|hey|casa|home)\b/g,
    /\b(la|lo|le|i|gli|il|una|uno|un|del|della|dello|dei|degli|delle|the|a|an)\b/g,
    /\b(in|nel|nella|nei|nelle|di|da|alla|al|on|at|of|to)\b/g,
    /\b(tutte|tutti|tutta|tutto|all|every|everything)\b/g,
  ];
  let t = normalized;
  for (const re of REMOVE_RE) t = t.replace(re, " ");
  return t.replace(/\s+/g, " ").trim();
}

export function matchLightIntent(raw: string): ParsedCommand | null {
  const text = normalize(raw);
  if (!text) return null;
  if (!LIGHT_KEYWORD_RE.test(text)) return null;

  const hasOn = ON_VERB_RE.test(text);
  const hasOff = OFF_VERB_RE.test(text);
  if (!hasOn && !hasOff) return null;

  const all = ALL_RE.test(text);
  if (all) {
    return {
      intent: hasOn ? "lights_all_on" : "lights_all_off",
      entities: {},
      confidence: 1,
      raw: raw.trim(),
    };
  }

  const subject = extractSubject(text);
  return {
    intent: hasOn ? "light_on" : "light_off",
    entities: { subject },
    confidence: subject.length > 0 ? 1 : 0.6,
    raw: raw.trim(),
  };
}

/* ------------------------------------------------------------------------ */
/*  Handler                                                                  */
/* ------------------------------------------------------------------------ */

const LIGHT_INTENTS = new Set<VoiceIntent>([
  "light_on",
  "light_off",
  "lights_all_on",
  "lights_all_off",
]);

export function isLightIntent(intent: VoiceIntent): boolean {
  return LIGHT_INTENTS.has(intent);
}

type VoiceVars = Record<string, string | number>;

function vt(key: string, vars?: VoiceVars): string {
  const out = i18next.t(
    `voice:responses.lights.${key}` as never,
    (vars ?? {}) as never,
  ) as unknown as string | string[];
  if (Array.isArray(out)) return pickVariant(out);
  return out;
}

function vtArray(key: string): string[] {
  const out = i18next.t(
    `voice:responses.lights.${key}` as never,
    {
      returnObjects: true,
    } as never,
  );
  return Array.isArray(out) ? (out as string[]) : [];
}

function pickVariant(variants: string[]): string {
  if (variants.length === 0) return "";
  return variants[Math.floor(Math.random() * variants.length)] ?? "";
}

function interpolate(template: string, vars: VoiceVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(vars[k] ?? `{{${k}}}`));
}

/* ------------------------------------------------------------------------ */
/*  Fuzzy resolution                                                         */
/* ------------------------------------------------------------------------ */

/** Score a candidate light against the spoken subject. Higher = better.
 * `roomName` is the human-readable room label (either the legacy
 * `light.room` text or the name resolved via `light.roomId` against the
 * rooms cache). */
function scoreCandidate(subject: string, light: LightSummary, roomName: string | null): number {
  const s = subject.toLowerCase();
  const name = light.name.toLowerCase();
  const room = (roomName ?? "").toLowerCase();

  if (!s) return 0;
  let score = 0;

  /* Exact matches win outright. */
  if (name === s || room === s) return 100;

  /* Full substring — "luce cucina" vs "Cucina" or vs "Lampada cucina". */
  if (name.includes(s) || s.includes(name)) score += 40;
  if (room && (room.includes(s) || s.includes(room))) score += 35;

  /* Per-word overlap so "cucina piano cottura" picks "Piano Cottura" over
   * unrelated rooms. */
  const subjectWords = s.split(/\s+/).filter((w) => w.length > 2);
  for (const w of subjectWords) {
    if (name.includes(w)) score += 10;
    if (room?.includes(w)) score += 8;
  }

  return score;
}

function resolveLights(
  subject: string,
  lights: LightSummary[],
  roomNameFor: (light: LightSummary) => string | null,
): LightSummary[] {
  if (!subject) return [];
  const scored = lights.map((l) => ({
    light: l,
    score: scoreCandidate(subject, l, roomNameFor(l)),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return [];

  /* If the top candidate shares its score with others (ambiguous room →
   * multiple lights), batch them all so "accendi le luci del soggiorno"
   * lights up every fixture in that room. */
  const threshold = Math.max(best.score - 5, best.score * 0.9);
  return scored.filter((s) => s.score >= threshold).map((s) => s.light);
}

/* ------------------------------------------------------------------------ */
/*  Dispatch                                                                 */
/* ------------------------------------------------------------------------ */

async function applyState(light: LightSummary, state: "on" | "off"): Promise<boolean> {
  try {
    await apiClient.post(`/api/v1/lights/${light.id}`, { state });
    return true;
  } catch (err) {
    console.warn("[voice:lights] command failed:", err);
    return false;
  }
}

function getLightsFromCache(qc: QueryClient | null): LightSummary[] {
  if (!qc) return [];
  return qc.getQueryData<LightSummary[]>(["lights"]) ?? [];
}

export async function handleLightIntent(
  command: ParsedCommand,
  qc: QueryClient | null,
): Promise<string | null> {
  if (!isLightIntent(command.intent)) return null;

  const invalidate = () => {
    void qc?.invalidateQueries({ queryKey: ["lights"] });
  };

  /* Fetch fresh list once up front; if cache is empty we must hit the API
   * so voice works on first use after boot. */
  let lights = getLightsFromCache(qc);
  if (lights.length === 0) {
    try {
      lights = await apiClient.get<LightSummary[]>("/api/v1/lights");
      qc?.setQueryData(["lights"], lights);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return vt("notConfigured");
      }
      return vt("upstreamError");
    }
  }

  if (lights.length === 0) return vt("noLights");

  /* Resolve each light's display room through the rooms cache so voice
   * matching understands "accendi le luci del salotto" even when the light
   * row only stores a `roomId` FK (no legacy `room` free-text). */
  const rooms = qc?.getQueryData<Room[]>(["rooms"]) ?? [];
  const roomById = new Map(rooms.map((r) => [r.id, r.name]));
  const roomNameFor = (l: LightSummary): string | null => {
    if (l.roomId) return roomById.get(l.roomId) ?? l.room ?? null;
    return l.room ?? null;
  };

  switch (command.intent) {
    case "lights_all_on":
    case "lights_all_off": {
      const target: "on" | "off" = command.intent === "lights_all_on" ? "on" : "off";
      const results = await Promise.all(lights.map((l) => applyState(l, target)));
      invalidate();
      const okCount = results.filter(Boolean).length;
      if (okCount === 0) return vt("upstreamError");
      return target === "on"
        ? interpolate(pickVariant(vtArray("allOn")), { count: okCount })
        : interpolate(pickVariant(vtArray("allOff")), { count: okCount });
    }

    case "light_on":
    case "light_off": {
      const subject = command.entities.subject ?? "";
      const target: "on" | "off" = command.intent === "light_on" ? "on" : "off";
      const matches = resolveLights(subject, lights, roomNameFor);
      if (matches.length === 0) {
        return interpolate(pickVariant(vtArray("notFound")), {
          subject: subject || "—",
        });
      }
      const results = await Promise.all(matches.map((l) => applyState(l, target)));
      invalidate();
      const okCount = results.filter(Boolean).length;
      if (okCount === 0) return vt("upstreamError");
      if (matches.length === 1) {
        const key = target === "on" ? "oneOn" : "oneOff";
        return interpolate(pickVariant(vtArray(key)), { name: matches[0].name });
      }
      const key = target === "on" ? "manyOn" : "manyOff";
      return interpolate(pickVariant(vtArray(key)), {
        count: okCount,
        room: roomNameFor(matches[0]) ?? subject,
      });
    }

    default:
      return null;
  }
}
