/**
 * Persistence helpers for `ge_devices`. Keeps routes and the poller
 * free of drizzle imports and gives us one place to update when the
 * schema changes.
 */

import type { AcDevice, AcState } from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { geDevices } from "../../db/schema.js";

function parseState(raw: string | null | undefined): AcState | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AcState;
  } catch {
    return null;
  }
}

export function listAcDevices(): AcDevice[] {
  const rows = db.select().from(geDevices).all();
  return rows.map((row) => ({
    id: row.id,
    serial: row.serial,
    model: row.model ?? null,
    nickname: row.nickname ?? null,
    roomId: row.roomId ?? null,
    state: parseState(row.lastState),
    lastSeenAt: row.lastSeenAt ?? null,
  }));
}

export function getAcDevice(id: string): AcDevice | null {
  const row = db.select().from(geDevices).where(eq(geDevices.id, id)).get();
  if (!row) return null;
  return {
    id: row.id,
    serial: row.serial,
    model: row.model ?? null,
    nickname: row.nickname ?? null,
    roomId: row.roomId ?? null,
    state: parseState(row.lastState),
    lastSeenAt: row.lastSeenAt ?? null,
  };
}

interface UpsertInput {
  id: string;
  serial: string;
  model: string | null;
  nickname: string | null;
  lastSeenAt: string | null;
}

/** Insert new device rows while preserving user-managed fields
 * (roomId, nickname if already set, lastState) on existing rows. */
export function upsertDiscoveredDevices(devices: UpsertInput[]): void {
  const now = new Date().toISOString();
  for (const d of devices) {
    const existing = db.select().from(geDevices).where(eq(geDevices.id, d.id)).get();
    if (existing) {
      db.update(geDevices)
        .set({
          serial: d.serial,
          model: d.model,
          // Keep user-set nickname; only fill in from cloud when empty.
          nickname: existing.nickname ?? d.nickname,
          lastSeenAt: d.lastSeenAt,
          updatedAt: now,
        })
        .where(eq(geDevices.id, d.id))
        .run();
    } else {
      db.insert(geDevices)
        .values({
          id: d.id,
          serial: d.serial,
          model: d.model,
          nickname: d.nickname,
          roomId: null,
          lastState: null,
          lastSeenAt: d.lastSeenAt,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  }
}

export function saveAcState(id: string, state: AcState): void {
  const now = new Date().toISOString();
  db.update(geDevices)
    .set({
      lastState: JSON.stringify(state),
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(geDevices.id, id))
    .run();
}

export function updateAcDeviceMeta(
  id: string,
  input: { roomId?: string | null; nickname?: string | null },
): AcDevice | null {
  const existing = db.select().from(geDevices).where(eq(geDevices.id, id)).get();
  if (!existing) return null;

  const patch: Partial<typeof geDevices.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if (input.roomId !== undefined) patch.roomId = input.roomId;
  if (input.nickname !== undefined) patch.nickname = input.nickname;

  db.update(geDevices).set(patch).where(eq(geDevices.id, id)).run();
  return getAcDevice(id);
}
