/**
 * Voice commands for the home alarm — arm / disarm globally, by sensor
 * kind (porte / finestre) or by room (cucina / bagno / …).
 *
 * Examples (Italian, the user's language):
 *   "Casa, arma allarme"           → global arm
 *   "Casa, arma tutti i sensori"   → global arm
 *   "Casa, arma le finestre"       → mark sensor_window devices as
 *                                    armed + arm system
 *   "Casa, arma sensori cucina"    → mark devices in room "cucina"
 *                                    as armed + arm system
 *   "Casa, disarma"                → global disarm
 *   "Casa, disarma le finestre"    → mark sensor_window devices as not
 *                                    armed (system stays as-is)
 *
 * Self-contained matcher + handler, mirroring the lightIntents.ts
 * pattern. Resolution against the live device list happens inside the
 * handler so we don't need to ship a copy of every paired device's
 * name to the parser.
 */

import type {
  ParsedCommand,
  Room,
  VoiceIntent,
  ZigbeeDevice,
  ZigbeeStateResponse,
} from "@home-panel/shared";
import type { QueryClient } from "@tanstack/react-query";
import { ApiError, apiClient } from "../api-client";
import { i18next } from "../i18n";

/* ------------------------------------------------------------------ */
/*  Matcher                                                            */
/* ------------------------------------------------------------------ */

const ALARM_KEYWORD_RE =
  /\b(allarme|alarm|sensore|sensori|sensors?|porta|porte|door|doors|finestra|finestre|window|windows|sirena|siren)\b/;
const ARM_VERB_RE =
  /\b(arma|armare|attiva\s+l[ae]?\s*allarme|attiva\s+sensori|abilita)\b|\barm\b|\benable\b/;
const DISARM_VERB_RE =
  /\b(disarma|disarmare|disattiva\s+l[ae]?\s*allarme|disattiva\s+sensori|disabilita)\b|\bdisarm\b|\bdisable\b/;

const KIND_DOOR_RE = /\b(port[ae]|doors?)\b/;
const KIND_WINDOW_RE = /\b(finestr[ae]|windows?)\b/;
const KIND_SIREN_RE = /\b(siren[ae])\b/;
const ALL_RE = /\b(tutti|tutte|tutto|tutta|all|every|everything)\b/;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRoomName(normalized: string): string {
  const REMOVE_RE = [
    /\b(arma|armare|disarma|disarmare|attiva|disattiva|abilita|disabilita|arm|disarm|enable|disable)\b/g,
    /\b(allarme|alarm|sensore|sensori|sensors?|porta|porte|door|doors|finestra|finestre|window|windows|sirena|siren)\b/g,
    /\b(per\s+favore|favore|grazie|please|ok|okay|ehi|hey|casa|home)\b/g,
    /\b(la|lo|le|i|gli|il|una|uno|un|del|della|dello|dei|degli|delle|the|a|an)\b/g,
    /\b(in|nel|nella|nei|nelle|di|da|alla|al|on|at|of|to)\b/g,
    /\b(tutti|tutte|tutto|tutta|all|every|everything|stanza|room)\b/g,
  ];
  let t = normalized;
  for (const re of REMOVE_RE) t = t.replace(re, " ");
  return t.replace(/\s+/g, " ").trim();
}

export function matchAlarmIntent(raw: string): ParsedCommand | null {
  const text = normalize(raw);
  if (!text) return null;

  const isArm = ARM_VERB_RE.test(text);
  const isDisarm = DISARM_VERB_RE.test(text);
  if (!isArm && !isDisarm) return null;

  if (!ALARM_KEYWORD_RE.test(text)) return null;

  const intent: VoiceIntent = isArm ? "alarm_arm" : "alarm_disarm";
  const entities: Record<string, string> = {};

  /* Sensor-kind filter has priority over room name. The user can say
   * "arma le finestre" without naming a room. */
  if (KIND_WINDOW_RE.test(text)) {
    entities.kind = "sensor_window";
  } else if (KIND_DOOR_RE.test(text)) {
    entities.kind = "sensor_door";
  } else if (KIND_SIREN_RE.test(text)) {
    entities.kind = "siren";
  } else if (!ALL_RE.test(text)) {
    /* "tutti i sensori" → no filter. Otherwise look for a room name. */
    const room = extractRoomName(text);
    if (room) entities.roomName = room;
  }

  return {
    intent,
    entities,
    confidence: 1,
    raw: raw.trim(),
  };
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

const ALARM_INTENTS = new Set<VoiceIntent>(["alarm_arm", "alarm_disarm"]);

export function isAlarmIntent(intent: VoiceIntent): boolean {
  return ALARM_INTENTS.has(intent);
}

type VoiceVars = Record<string, string | number>;

function vt(key: string, vars?: VoiceVars): string {
  const out = i18next.t(`voice:responses.alarm.${key}` as never, (vars ?? {}) as never);
  if (Array.isArray(out)) {
    const arr = out as string[];
    return arr[Math.floor(Math.random() * arr.length)] ?? "";
  }
  return out as unknown as string;
}

/** Resolve the spoken room name against the cached rooms list, with a
 *  loose substring match (case-insensitive). Returns the room id or
 *  null. */
function findRoom(rooms: Room[], spoken: string): Room | null {
  const s = spoken.toLowerCase();
  if (!s) return null;
  let best: { score: number; room: Room } | null = null;
  for (const r of rooms) {
    const name = r.name.toLowerCase();
    let score = 0;
    if (name === s) score = 100;
    else if (name.startsWith(s) || s.startsWith(name)) score = 80;
    else if (name.includes(s) || s.includes(name)) score = 60;
    if (score > 0 && (!best || score > best.score)) best = { score, room: r };
  }
  return best?.room ?? null;
}

interface AlarmFilter {
  kind?: string;
  roomId?: string | null;
}

function deviceMatches(d: ZigbeeDevice, filter: AlarmFilter): boolean {
  if (filter.kind) {
    /* Match against the user-picked override first; the projector
     * already handles fallback heuristics, but the per-device armed
     * flag lives on the raw row regardless of how the tile renders. */
    if (d.kindOverride && d.kindOverride !== filter.kind) return false;
    if (!d.kindOverride) {
      /* Without an override we can only filter by sensor_door (the
       * fallback default). Skip mismatching devices. */
      if (filter.kind !== "sensor_door") return false;
    }
  }
  if (filter.roomId !== undefined) {
    if (d.roomId !== filter.roomId) return false;
  }
  return true;
}

export async function handleAlarmIntent(command: ParsedCommand, qc: QueryClient): Promise<string> {
  const arming = command.intent === "alarm_arm";
  const filter: AlarmFilter = {};

  /* Pick up the spoken filter, if any, from the parsed entities. */
  const kind = command.entities.kind;
  if (kind) filter.kind = kind;

  const roomName = command.entities.roomName;
  let resolvedRoomLabel: string | null = null;

  if (roomName) {
    const rooms = (qc.getQueryData<Room[]>(["rooms"]) ?? []) as Room[];
    const room = findRoom(rooms, roomName);
    if (!room) {
      return vt("roomNotFound", { name: roomName });
    }
    filter.roomId = room.id;
    resolvedRoomLabel = room.name;
  }

  /* No filter → just toggle the system flag. */
  const hasFilter = Boolean(filter.kind || filter.roomId);

  try {
    if (!hasFilter) {
      await apiClient.post(arming ? "/api/v1/alarm/arm" : "/api/v1/alarm/disarm");
      return vt(arming ? "armed" : "disarmed");
    }

    /* Filter mode — flip the per-device armed flag for the matches. */
    const state = (qc.getQueryData<ZigbeeStateResponse>(["zigbee", "state"]) ??
      (await apiClient.get<ZigbeeStateResponse>("/api/v1/zigbee/state"))) as ZigbeeStateResponse;
    const matched = state.devices.filter((d) => deviceMatches(d, filter));
    if (matched.length === 0) {
      return vt("noMatches");
    }

    await Promise.all(
      matched.map((d) =>
        apiClient.patch(`/api/v1/zigbee/devices/${encodeURIComponent(d.ieeeAddress)}/armed`, {
          armed: arming,
        }),
      ),
    );

    /* When arming with filter, also flip the global system flag on so
     * the matches actually trigger. Disarming with filter just opts
     * the matches out — we don't toggle the system off. */
    if (arming) {
      await apiClient.post("/api/v1/alarm/arm");
    }

    void qc.invalidateQueries({ queryKey: ["zigbee", "state"] });
    void qc.invalidateQueries({ queryKey: ["alarm", "state"] });

    if (filter.kind) {
      const kindLabel = vt(`kind.${filter.kind}` as string);
      return vt(arming ? "armedKind" : "disarmedKind", {
        kind: kindLabel,
        count: matched.length,
      });
    }
    return vt(arming ? "armedRoom" : "disarmedRoom", {
      room: resolvedRoomLabel ?? "",
      count: matched.length,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return vt("error", { message: err.message });
    }
    return vt("error", { message: err instanceof Error ? err.message : "errore" });
  }
}
