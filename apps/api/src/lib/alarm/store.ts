/**
 * SQLite store for the home alarm system.
 *
 * Singleton state row (id = 1, lazily seeded on first read) plus an
 * append-only events log. The store doesn't know anything about
 * Zigbee — `triggerEvent()` is called by the zigbee client when a
 * device satisfies the trigger predicate.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AlarmEvent, AlarmEventKind, AlarmState } from "@home-panel/shared";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  type AlarmEventRow,
  type AlarmStateRow,
  alarmEvents,
  alarmState,
} from "../../db/schema.js";

/* scrypt parameters: tuned for fast verification on the NAS without
 * being trivially brute-forceable for a 4–8 digit numeric code. */
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;
export const DISARM_CODE_PATTERN = /^\d{4,8}$/;

/* Stored format: `saltHex:hashHex:length`. The trailing length is
 * appended so the keypad can render the right number of dots and
 * auto-submit at the configured digit count without leaking the code
 * itself. Older rows without `:length` still verify correctly — we
 * just lose the auto-submit hint until the user re-saves. */
function hashCode(plain: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}:${plain.length}`;
}

function verifyHash(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  const [saltHex, hashHex] = parts;
  if (!saltHex || !hashHex) return false;
  let saltBuf: Buffer;
  let storedBuf: Buffer;
  try {
    saltBuf = Buffer.from(saltHex, "hex");
    storedBuf = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (storedBuf.length !== SCRYPT_KEYLEN) return false;
  const derived = scryptSync(plain, saltBuf, SCRYPT_KEYLEN);
  return timingSafeEqual(derived, storedBuf);
}

function lengthFromStored(stored: string | null): number | null {
  if (!stored) return null;
  const parts = stored.split(":");
  if (parts.length < 3) return null;
  const n = Number(parts[2]);
  if (!Number.isFinite(n) || n < 4 || n > 8) return null;
  return n;
}

/** True when ALARM_DISARM_RESET is the literal string "true". Any other
 * value (including unset) keeps the override disabled, by design. */
export function isDisarmResetEnabled(): boolean {
  return process.env.ALARM_DISARM_RESET === "true";
}

function ensureSingleton(): AlarmStateRow {
  let row = db.select().from(alarmState).where(eq(alarmState.id, 1)).get();
  if (!row) {
    db.insert(alarmState).values({ id: 1, armed: false, mode: "away" }).run();
    row = db.select().from(alarmState).where(eq(alarmState.id, 1)).get();
    if (!row) throw new Error("alarm_state singleton missing after insert");
  }
  return row;
}

function rowToState(row: AlarmStateRow): AlarmState {
  return {
    armed: row.armed,
    armedAt: row.armedAt,
    mode: row.mode,
  };
}

function rowToEvent(row: AlarmEventRow): AlarmEvent {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.payload || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    /* keep payload empty if the stored JSON is corrupted. */
  }
  return {
    id: row.id,
    ieeeAddress: row.ieeeAddress,
    friendlyName: row.friendlyName,
    kind: row.kind as AlarmEventKind,
    triggeredAt: row.triggeredAt,
    acknowledgedAt: row.acknowledgedAt,
    payload,
  };
}

export function getAlarmState(): AlarmState {
  return rowToState(ensureSingleton());
}

export function setArmed(armed: boolean, mode?: string): AlarmState {
  ensureSingleton();
  const now = new Date().toISOString();
  db.update(alarmState)
    .set({
      armed,
      armedAt: armed ? now : null,
      mode: mode ?? undefined,
      updatedAt: now,
    })
    .where(eq(alarmState.id, 1))
    .run();
  return getAlarmState();
}

export function listEvents(limit = 50): AlarmEvent[] {
  const rows = db
    .select()
    .from(alarmEvents)
    .orderBy(desc(alarmEvents.triggeredAt))
    .limit(limit)
    .all();
  return rows.map(rowToEvent);
}

export function countUnread(): number {
  const rows = db.select().from(alarmEvents).where(isNull(alarmEvents.acknowledgedAt)).all();
  return rows.length;
}

export interface NewEventInput {
  ieeeAddress: string;
  friendlyName: string;
  kind: AlarmEventKind;
  payload: Record<string, unknown>;
}

export function recordEvent(input: NewEventInput): AlarmEvent {
  const id = crypto.randomUUID();
  const triggeredAt = new Date().toISOString();
  db.insert(alarmEvents)
    .values({
      id,
      ieeeAddress: input.ieeeAddress,
      friendlyName: input.friendlyName,
      kind: input.kind,
      triggeredAt,
      payload: JSON.stringify(input.payload),
    })
    .run();
  return {
    id,
    ieeeAddress: input.ieeeAddress,
    friendlyName: input.friendlyName,
    kind: input.kind,
    triggeredAt,
    acknowledgedAt: null,
    payload: input.payload,
  };
}

export function acknowledgeEvent(id: string): AlarmEvent | null {
  const now = new Date().toISOString();
  db.update(alarmEvents).set({ acknowledgedAt: now }).where(eq(alarmEvents.id, id)).run();
  const row = db.select().from(alarmEvents).where(eq(alarmEvents.id, id)).get();
  return row ? rowToEvent(row) : null;
}

export function acknowledgeAll(): number {
  const now = new Date().toISOString();
  const unread = db.select().from(alarmEvents).where(isNull(alarmEvents.acknowledgedAt)).all();
  if (unread.length === 0) return 0;
  db.update(alarmEvents)
    .set({ acknowledgedAt: now })
    .where(isNull(alarmEvents.acknowledgedAt))
    .run();
  return unread.length;
}

/* ------------------------------------------------------------------ */
/*  Disarm code                                                        */
/* ------------------------------------------------------------------ */

export function isDisarmCodeConfigured(): boolean {
  const row = ensureSingleton();
  return Boolean(row.disarmCodeHash && row.disarmCodeHash.length > 0);
}

/** Digit count of the currently stored code, or null if not configured
 * (or stored before this column was introduced). */
export function getDisarmCodeLength(): number | null {
  const row = ensureSingleton();
  return lengthFromStored(row.disarmCodeHash);
}

/** Replace the stored disarm code with a fresh hash. The caller is
 * responsible for verifying the previous code (or for honoring the
 * reset env override). */
export function storeDisarmCode(plain: string): void {
  if (!DISARM_CODE_PATTERN.test(plain)) {
    throw new Error("Il codice deve essere composto da 4-8 cifre.");
  }
  ensureSingleton();
  db.update(alarmState)
    .set({
      disarmCodeHash: hashCode(plain),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(alarmState.id, 1))
    .run();
}

export function verifyDisarmCode(plain: string): boolean {
  if (!plain || !DISARM_CODE_PATTERN.test(plain)) return false;
  const row = ensureSingleton();
  if (!row.disarmCodeHash) return false;
  return verifyHash(plain, row.disarmCodeHash);
}
