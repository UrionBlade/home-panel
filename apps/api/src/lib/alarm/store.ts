/**
 * SQLite store for the home alarm system.
 *
 * Singleton state row (id = 1, lazily seeded on first read) plus an
 * append-only events log. The store doesn't know anything about
 * Zigbee — `triggerEvent()` is called by the zigbee client when a
 * device satisfies the trigger predicate.
 */

import type { AlarmEvent, AlarmEventKind, AlarmState } from "@home-panel/shared";
import { desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import {
  type AlarmEventRow,
  type AlarmStateRow,
  alarmEvents,
  alarmState,
} from "../../db/schema.js";

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
