/**
 * Air conditioner voice commands — "accendi il condizionatore",
 * "metti il clima a 22 gradi", "condizionatore camera modalità caldo",
 * "ventola alta al condizionatore in salotto"... Self-contained matcher
 * + handler following the same shape as `lightIntents.ts`.
 *
 * Device resolution happens inside the handler by scoring each AC
 * against the spoken subject, using nickname + room name. When the
 * subject is empty, the intent applies to all linked units (e.g.
 * "spegni i condizionatori").
 */

import type {
  AcCommandInput,
  AcDevice,
  AcFanSpeed,
  AcMode,
  ParsedCommand,
  Room,
  VoiceIntent,
} from "@home-panel/shared";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../api-client";
import { i18next } from "../i18n";

/* ------------------------------------------------------------------------ */
/*  Matching                                                                 */
/* ------------------------------------------------------------------------ */

const AC_KEYWORD_RE =
  /\b(condizionator[ei]|condizionator|clima|climatizzator[ei]|aria\s+condizionata|air\s+conditioner|a\/?c)\b/;

const ON_VERB_RE = /\b(accendi|accendere|attiva|attivare|avvia|turn\s+on|switch\s+on)\b/;
const OFF_VERB_RE =
  /\b(spegni|spegnere|disattiva|disattivare|ferma|turn\s+off|switch\s+off|shut\s+off|stop)\b/;

/** Mode trigger words. Order matters: "auto" needs to be checked after
 * more specific keywords so "freddo automatico" still maps to cool. */
const MODE_WORDS: Array<{ re: RegExp; mode: AcMode }> = [
  { re: /\b(freddo|fresco|raffredda|raffreddamento|cool|cooling)\b/, mode: "cool" },
  {
    re: /\b(caldo|riscalda|riscaldamento|heat|heating)\b/,
    mode: "heat",
  },
  { re: /\b(deumidifica|deumidificatore|secco|dry|dehumidif)\b/, mode: "dry" },
  { re: /\b(ventilazione|sola\s+ventola|solo\s+ventola|ventilation|fan\s+only)\b/, mode: "fan" },
  { re: /\b(automatic[oa]|auto|automatico)\b/, mode: "auto" },
];

const FAN_WORDS: Array<{ re: RegExp; fan: AcFanSpeed }> = [
  { re: /\b(auto|automatic[ao])\b/, fan: "auto" },
  { re: /\b(bass[ao]|piano|minim[ao]|low|slow)\b/, fan: "low" },
  { re: /\b(medi[ao]|media|mid|medium)\b/, fan: "mid" },
  { re: /\b(alt[ao]|massim[ao]|forte|veloce|high|fast|max)\b/, fan: "high" },
];

const STATUS_RE =
  /\b(com\S*\s*[eè]|quant[oa]\s+(c[aà]ldo|fredd[oa]|temperatura)|stato|status|how.*\b(ac|air)|che\s+temperatura|che\s+fa\s+(?:il|lo|la))\b/;

const TEMP_RE = /\b(\d{1,2})\s*(?:°|grad[oi]|degrees)?\s*(?:c|celsius)?\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSubject(normalized: string): string {
  const REMOVE_RE = [
    /\b(accendi|accendere|attiva|attivare|avvia|spegni|spegnere|disattiva|disattivare|ferma)\b/g,
    /\b(turn\s+on|turn\s+off|switch\s+on|switch\s+off|shut\s+off|stop)\b/g,
    /\b(condizionator[ei]|condizionator|clima|climatizzator[ei]|aria\s+condizionata|air\s+conditioner|a\/?c)\b/g,
    /\b(modalit[aà]|modality|mode|ventola|velocit[aà]\s+ventola|fan(?:\s+speed)?)\b/g,
    /\b(freddo|fresco|raffredda|raffreddamento|caldo|riscalda|riscaldamento)\b/g,
    /\b(deumidifica|deumidificatore|secco|ventilazione|sola\s+ventola|solo\s+ventola)\b/g,
    /\b(automatic[oa]|auto|bass[ao]|medi[ao]|alt[ao]|massim[ao]|piano|minim[ao]|forte|veloce)\b/g,
    /\b(cool|cooling|heat|heating|dry|dehumidif|fan\s+only|ventilation|mid|medium|high|low|max|fast|slow)\b/g,
    /\b(a|metti|imposta|porta|set|to|at|alle|alla|al|su|a)\b/g,
    /\b\d{1,2}\s*(?:°|grad[oi]|degrees|c|celsius)?\b/g,
    /\b(per\s+favore|favore|grazie|please|ok|okay|ehi|hey|casa|home)\b/g,
    /\b(la|lo|le|i|gli|il|una|uno|un|del|della|dello|dei|degli|delle|the|an)\b/g,
    /\b(in|nel|nella|nei|nelle|di|da|dalla|dalle|sulla|sulle|on|at|of)\b/g,
  ];
  let t = normalized;
  for (const re of REMOVE_RE) t = t.replace(re, " ");
  return t.replace(/\s+/g, " ").trim();
}

function findMode(text: string): AcMode | null {
  for (const { re, mode } of MODE_WORDS) if (re.test(text)) return mode;
  return null;
}

function findFan(text: string, hasVentolaCue: boolean): AcFanSpeed | null {
  if (!hasVentolaCue) return null;
  for (const { re, fan } of FAN_WORDS) if (re.test(text)) return fan;
  return null;
}

function findTemperature(text: string): number | null {
  const m = text.match(TEMP_RE);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n) || n < 16 || n > 30) return null;
  return n;
}

export function matchAcIntent(raw: string): ParsedCommand | null {
  const text = normalize(raw);
  if (!text) return null;
  if (!AC_KEYWORD_RE.test(text)) return null;

  const hasOn = ON_VERB_RE.test(text);
  const hasOff = OFF_VERB_RE.test(text);
  const hasVentola = /\b(ventola|ventilatore|fan\s+speed|fan)\b/.test(text);
  const hasMode =
    /\b(modalit[aà]|mode|modality)\b/.test(text) ||
    (!hasVentola && MODE_WORDS.some((m) => m.re.test(text)));
  const temp = findTemperature(text);

  const subject = extractSubject(text);
  const baseEntities: Record<string, string> = {};
  if (subject) baseEntities.subject = subject;

  if (STATUS_RE.test(text) && !hasOn && !hasOff && temp === null && !hasMode && !hasVentola) {
    return {
      intent: "ac_status",
      entities: baseEntities,
      confidence: 0.85,
      raw: raw.trim(),
    };
  }

  if (temp !== null && !hasOff) {
    return {
      intent: "ac_set_temp",
      entities: { ...baseEntities, temperature: String(temp) },
      confidence: 0.95,
      raw: raw.trim(),
    };
  }

  if (hasVentola) {
    const fan = findFan(text, true);
    if (fan) {
      return {
        intent: "ac_set_fan",
        entities: { ...baseEntities, fan },
        confidence: 0.9,
        raw: raw.trim(),
      };
    }
  }

  if (hasMode) {
    const mode = findMode(text);
    if (mode) {
      return {
        intent: "ac_set_mode",
        entities: { ...baseEntities, mode },
        confidence: 0.9,
        raw: raw.trim(),
      };
    }
  }

  if (hasOn || hasOff) {
    return {
      intent: hasOn ? "ac_power_on" : "ac_power_off",
      entities: baseEntities,
      confidence: 0.95,
      raw: raw.trim(),
    };
  }

  return null;
}

/* ------------------------------------------------------------------------ */
/*  Handler                                                                   */
/* ------------------------------------------------------------------------ */

const AC_INTENTS = new Set<VoiceIntent>([
  "ac_power_on",
  "ac_power_off",
  "ac_set_temp",
  "ac_set_mode",
  "ac_set_fan",
  "ac_status",
]);

export function isAcIntent(intent: VoiceIntent): boolean {
  return AC_INTENTS.has(intent);
}

type VoiceVars = Record<string, string | number>;

function vt(key: string, vars?: VoiceVars): string {
  const out = i18next.t(`voice:responses.ac.${key}` as never, (vars ?? {}) as never) as unknown as
    | string
    | string[];
  if (Array.isArray(out)) return pickVariant(out);
  return out;
}

function vtArray(key: string): string[] {
  const out = i18next.t(`voice:responses.ac.${key}` as never, { returnObjects: true } as never);
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
/*  Resolution                                                                */
/* ------------------------------------------------------------------------ */

function scoreCandidate(subject: string, ac: AcDevice, roomName: string | null): number {
  const s = subject.toLowerCase();
  if (!s) return 0;
  const name = (ac.nickname ?? "").toLowerCase();
  const model = (ac.model ?? "").toLowerCase();
  const room = (roomName ?? "").toLowerCase();

  if (name === s || room === s) return 100;

  let score = 0;
  if (name && (name.includes(s) || s.includes(name))) score += 40;
  if (room && (room.includes(s) || s.includes(room))) score += 45;
  if (model && (model.includes(s) || s.includes(model))) score += 10;

  const subjectWords = s.split(/\s+/).filter((w) => w.length > 2);
  for (const w of subjectWords) {
    if (name.includes(w)) score += 10;
    if (room.includes(w)) score += 12;
    if (model.includes(w)) score += 4;
  }
  return score;
}

function resolveDevices(
  subject: string,
  devices: AcDevice[],
  roomNameFor: (ac: AcDevice) => string | null,
): AcDevice[] {
  if (!subject) return devices; // No subject → address all units.
  const scored = devices.map((d) => ({
    device: d,
    score: scoreCandidate(subject, d, roomNameFor(d)),
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score === 0) return [];
  const threshold = Math.max(best.score - 5, best.score * 0.9);
  return scored.filter((s) => s.score >= threshold).map((s) => s.device);
}

function deviceLabel(ac: AcDevice, roomName: string | null): string {
  if (roomName) return roomName;
  if (ac.nickname?.trim()) return ac.nickname.trim();
  if (ac.model?.trim()) return ac.model.trim();
  return vt("unnamed");
}

/* ------------------------------------------------------------------------ */
/*  Dispatch                                                                  */
/* ------------------------------------------------------------------------ */

async function sendCommand(id: string, input: AcCommandInput): Promise<boolean> {
  try {
    await apiClient.post(`/api/v1/ac/devices/${id}/command`, input);
    return true;
  } catch (err) {
    console.warn("[voice:ac] command failed:", err);
    return false;
  }
}

function getDevicesFromCache(qc: QueryClient | null): AcDevice[] {
  if (!qc) return [];
  return qc.getQueryData<AcDevice[]>(["ac", "devices"]) ?? [];
}

export async function handleAcIntent(
  command: ParsedCommand,
  qc: QueryClient | null,
): Promise<string | null> {
  if (!isAcIntent(command.intent)) return null;

  const invalidate = () => {
    void qc?.invalidateQueries({ queryKey: ["ac", "devices"] });
  };

  let devices = getDevicesFromCache(qc);
  if (devices.length === 0) {
    try {
      devices = await apiClient.get<AcDevice[]>("/api/v1/ac/devices");
      qc?.setQueryData(["ac", "devices"], devices);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) return vt("notConfigured");
      return vt("upstreamError");
    }
  }
  if (devices.length === 0) return vt("noDevices");

  const rooms = qc?.getQueryData<Room[]>(["rooms"]) ?? [];
  const roomById = new Map(rooms.map((r) => [r.id, r.name]));
  const roomNameFor = (ac: AcDevice) => (ac.roomId ? (roomById.get(ac.roomId) ?? null) : null);

  const subject = command.entities.subject ?? "";
  const matches = resolveDevices(subject, devices, roomNameFor);
  if (matches.length === 0) {
    return interpolate(pickVariant(vtArray("notFound")), { subject: subject || "—" });
  }

  switch (command.intent) {
    case "ac_power_on":
    case "ac_power_off": {
      const power = command.intent === "ac_power_on";
      const results = await Promise.all(matches.map((m) => sendCommand(m.id, { power })));
      invalidate();
      const okCount = results.filter(Boolean).length;
      if (okCount === 0) return vt("upstreamError");
      if (matches.length === 1) {
        const key = power ? "oneOn" : "oneOff";
        return interpolate(pickVariant(vtArray(key)), {
          name: deviceLabel(matches[0], roomNameFor(matches[0])),
        });
      }
      const key = power ? "manyOn" : "manyOff";
      return interpolate(pickVariant(vtArray(key)), { count: okCount });
    }

    case "ac_set_temp": {
      const raw = command.entities.temperature;
      const temp = raw ? Number.parseInt(raw, 10) : Number.NaN;
      if (!Number.isFinite(temp)) return vt("tempMissing");
      const results = await Promise.all(
        matches.map((m) => sendCommand(m.id, { targetTemp: temp, power: true })),
      );
      invalidate();
      if (!results.some(Boolean)) return vt("upstreamError");
      return interpolate(pickVariant(vtArray("tempSet")), {
        temp,
        name: deviceLabel(matches[0], roomNameFor(matches[0])),
      });
    }

    case "ac_set_mode": {
      const mode = command.entities.mode as AcMode | undefined;
      if (!mode) return vt("modeMissing");
      const results = await Promise.all(
        matches.map((m) => sendCommand(m.id, { mode, power: true })),
      );
      invalidate();
      if (!results.some(Boolean)) return vt("upstreamError");
      return interpolate(pickVariant(vtArray("modeSet")), {
        mode: vt(`mode.${mode}`),
        name: deviceLabel(matches[0], roomNameFor(matches[0])),
      });
    }

    case "ac_set_fan": {
      const fan = command.entities.fan as AcFanSpeed | undefined;
      if (!fan) return vt("fanMissing");
      const results = await Promise.all(
        matches.map((m) => sendCommand(m.id, { fanSpeed: fan, power: true })),
      );
      invalidate();
      if (!results.some(Boolean)) return vt("upstreamError");
      return interpolate(pickVariant(vtArray("fanSet")), {
        fan: vt(`fan.${fan}`),
        name: deviceLabel(matches[0], roomNameFor(matches[0])),
      });
    }

    case "ac_status": {
      const ac = matches[0];
      const label = deviceLabel(ac, roomNameFor(ac));
      if (!ac.state) return interpolate(vt("statusUnknown"), { name: label });
      if (!ac.state.power) return interpolate(vt("statusOff"), { name: label });
      const modeLabel = vt(`mode.${ac.state.mode}`);
      const current =
        ac.state.currentTemp !== null
          ? interpolate(vt("statusCurrent"), { temp: ac.state.currentTemp })
          : "";
      return interpolate(vt("statusOn"), {
        name: label,
        mode: modeLabel,
        target: Math.round(ac.state.targetTemp),
        current,
      })
        .replace(/\s+/g, " ")
        .trim();
    }

    default:
      return null;
  }
}
