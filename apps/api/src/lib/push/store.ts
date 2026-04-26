/**
 * SQLite store for push notification device tokens.
 *
 * Inserts use ON CONFLICT to merge: when the same APNs token shows up
 * twice (app reinstalled, OS rotated the token, etc.) the row's
 * `last_seen_at` and label are refreshed in place — no duplicates.
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { type NewPushTokenRow, type PushTokenRow, pushTokens } from "../../db/schema.js";

export interface RegisterInput {
  token: string;
  platform?: "ios" | "android" | "web";
  label?: string | null;
  familyMemberId?: string | null;
}

export function registerToken(input: RegisterInput): PushTokenRow {
  const now = new Date().toISOString();
  const existing = db.select().from(pushTokens).where(eq(pushTokens.token, input.token)).get();
  if (existing) {
    const updates: Partial<NewPushTokenRow> = { lastSeenAt: now };
    if (input.label !== undefined) updates.label = input.label;
    if (input.familyMemberId !== undefined) updates.familyMemberId = input.familyMemberId;
    if (input.platform) updates.platform = input.platform;
    db.update(pushTokens).set(updates).where(eq(pushTokens.id, existing.id)).run();
    return { ...existing, ...updates } as PushTokenRow;
  }
  const id = crypto.randomUUID();
  const row: NewPushTokenRow = {
    id,
    token: input.token,
    platform: input.platform ?? "ios",
    label: input.label ?? null,
    familyMemberId: input.familyMemberId ?? null,
    lastSeenAt: now,
  };
  db.insert(pushTokens).values(row).run();
  return db.select().from(pushTokens).where(eq(pushTokens.id, id)).get() as PushTokenRow;
}

export function listTokens(platform?: "ios" | "android" | "web"): PushTokenRow[] {
  if (platform) {
    return db.select().from(pushTokens).where(eq(pushTokens.platform, platform)).all();
  }
  return db.select().from(pushTokens).all();
}

export function removeTokenById(id: string): boolean {
  const existed = db.select().from(pushTokens).where(eq(pushTokens.id, id)).get();
  if (!existed) return false;
  db.delete(pushTokens).where(eq(pushTokens.id, id)).run();
  return true;
}

export function removeTokenByValue(token: string): void {
  db.delete(pushTokens).where(eq(pushTokens.token, token)).run();
}
