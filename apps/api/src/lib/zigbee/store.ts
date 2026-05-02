/**
 * SQLite store for Zigbee devices. Wraps Drizzle so the MQTT client and
 * the HTTP routes share a consistent shape (`ZigbeeDevice`).
 */

import type { ZigbeeDevice } from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { type NewZigbeeDeviceRow, type ZigbeeDeviceRow, zigbeeDevices } from "../../db/schema.js";

/** A row is a "plug" if the user explicitly tagged it as such, or if no
 * override is set and the Z2M description mentions plug/outlet. Plugs
 * are deliberately kept out of the alarm system: the user has at least
 * one (e.g. a pool pump) where any state change is meaningful traffic,
 * not an intrusion event. */
export function isPlugRow(row: {
  description: string | null;
  kindOverride: string | null;
}): boolean {
  if (row.kindOverride === "plug") return true;
  if (row.kindOverride) return false;
  const desc = (row.description ?? "").toLowerCase();
  return desc.includes("plug") || desc.includes("outlet");
}

function rowToDevice(row: ZigbeeDeviceRow): ZigbeeDevice {
  let state: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.lastStateJson || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      state = parsed as Record<string, unknown>;
    }
  } catch {
    /* keep state empty if the stored JSON ever gets corrupted. */
  }
  return {
    ieeeAddress: row.ieeeAddress,
    friendlyName: row.friendlyName,
    vendor: row.vendor,
    model: row.model,
    description: row.description,
    type: row.type,
    state,
    battery: row.battery,
    linkQuality: row.linkQuality,
    availability: row.availability,
    lastSeenAt: row.lastSeenAt,
    roomId: row.roomId,
    armed: row.armed,
    kindOverride: row.kindOverride,
  };
}

export function listDevices(): ZigbeeDevice[] {
  const rows = db.select().from(zigbeeDevices).all();
  return rows.map(rowToDevice);
}

export function getDevice(ieeeAddress: string): ZigbeeDevice | null {
  const row = db
    .select()
    .from(zigbeeDevices)
    .where(eq(zigbeeDevices.ieeeAddress, ieeeAddress))
    .get();
  return row ? rowToDevice(row) : null;
}

export interface UpsertInput {
  ieeeAddress: string;
  friendlyName?: string;
  vendor?: string | null;
  model?: string | null;
  description?: string | null;
  type?: string | null;
  state?: Record<string, unknown>;
  battery?: number | null;
  linkQuality?: number | null;
  availability?: "online" | "offline" | "unknown";
  lastSeenAt?: string | null;
}

/** Insert or merge — partial updates are common (state-only refresh, etc.). */
export function upsertDevice(input: UpsertInput): ZigbeeDevice | null {
  const existing = db
    .select()
    .from(zigbeeDevices)
    .where(eq(zigbeeDevices.ieeeAddress, input.ieeeAddress))
    .get();

  const now = new Date().toISOString();
  if (!existing) {
    if (!input.friendlyName) return null;
    /* Plugs aren't part of the alarm. The schema defaults `armed` to
     * true (so a freshly-paired contact sensor is wired in immediately)
     * — invert that for plugs at insert time. */
    const isPlug = isPlugRow({
      description: input.description ?? null,
      kindOverride: null,
    });
    const insert: NewZigbeeDeviceRow = {
      ieeeAddress: input.ieeeAddress,
      friendlyName: input.friendlyName,
      vendor: input.vendor ?? null,
      model: input.model ?? null,
      description: input.description ?? null,
      type: input.type ?? null,
      lastStateJson: input.state ? JSON.stringify(input.state) : "{}",
      battery: input.battery ?? null,
      linkQuality: input.linkQuality ?? null,
      availability: input.availability ?? "unknown",
      lastSeenAt: input.lastSeenAt ?? null,
      armed: !isPlug,
      updatedAt: now,
    };
    db.insert(zigbeeDevices).values(insert).run();
    return getDevice(input.ieeeAddress);
  }

  const updates: Partial<NewZigbeeDeviceRow> = { updatedAt: now };
  if (input.friendlyName !== undefined) updates.friendlyName = input.friendlyName;
  if (input.vendor !== undefined) updates.vendor = input.vendor;
  if (input.model !== undefined) updates.model = input.model;
  if (input.description !== undefined) updates.description = input.description;
  if (input.type !== undefined) updates.type = input.type;
  if (input.state !== undefined) updates.lastStateJson = JSON.stringify(input.state);
  if (input.battery !== undefined) updates.battery = input.battery;
  if (input.linkQuality !== undefined) updates.linkQuality = input.linkQuality;
  if (input.availability !== undefined) updates.availability = input.availability;
  if (input.lastSeenAt !== undefined) updates.lastSeenAt = input.lastSeenAt;

  db.update(zigbeeDevices)
    .set(updates)
    .where(eq(zigbeeDevices.ieeeAddress, input.ieeeAddress))
    .run();
  return getDevice(input.ieeeAddress);
}

export function setRoom(ieeeAddress: string, roomId: string | null): ZigbeeDevice | null {
  db.update(zigbeeDevices)
    .set({ roomId, updatedAt: new Date().toISOString() })
    .where(eq(zigbeeDevices.ieeeAddress, ieeeAddress))
    .run();
  return getDevice(ieeeAddress);
}

export function setArmed(ieeeAddress: string, armed: boolean): ZigbeeDevice | null {
  const row = db
    .select()
    .from(zigbeeDevices)
    .where(eq(zigbeeDevices.ieeeAddress, ieeeAddress))
    .get();
  if (!row) return null;
  /* Plugs are never part of the alarm — silently coerce to false so a
   * stray armAll() left over from before this change can't keep a plug
   * armed. The route returns success regardless so the editor sheet
   * doesn't surface a confusing error when the user touches the
   * (now hidden) toggle on an already-saved plug. */
  const next = isPlugRow(row) ? false : armed;
  db.update(zigbeeDevices)
    .set({ armed: next, updatedAt: new Date().toISOString() })
    .where(eq(zigbeeDevices.ieeeAddress, ieeeAddress))
    .run();
  return getDevice(ieeeAddress);
}

/** Bulk-arm every device in the Zigbee table — called when the alarm
 * system is armed so a forgotten per-device mute doesn't silently keep
 * a sensor out of the alarm. Idempotent. Plugs are excluded: they are
 * actuators (smart outlets), not intrusion sensors, and arming them
 * would surface their state changes as alarm events. */
export function armAll(): number {
  const rows = db.select().from(zigbeeDevices).all();
  const targets = rows.filter((r) => !isPlugRow(r));
  const now = new Date().toISOString();
  let changed = 0;
  for (const row of targets) {
    if (row.armed) continue;
    db.update(zigbeeDevices)
      .set({ armed: true, updatedAt: now })
      .where(eq(zigbeeDevices.ieeeAddress, row.ieeeAddress))
      .run();
    changed += 1;
  }
  return changed;
}

export function setKindOverride(
  ieeeAddress: string,
  kindOverride: string | null,
): ZigbeeDevice | null {
  db.update(zigbeeDevices)
    .set({ kindOverride, updatedAt: new Date().toISOString() })
    .where(eq(zigbeeDevices.ieeeAddress, ieeeAddress))
    .run();
  return getDevice(ieeeAddress);
}

export function removeDevice(ieeeAddress: string): void {
  db.delete(zigbeeDevices).where(eq(zigbeeDevices.ieeeAddress, ieeeAddress)).run();
}
