import type { UpdateVoiceSettingsInput, VoiceSettings } from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type VoiceSettingsRow, voiceSettings } from "../db/schema.js";

function rowToDto(row: VoiceSettingsRow): VoiceSettings {
  return {
    enabled: row.enabled,
    sensitivity: row.sensitivity,
    preferredTtsVoice: row.preferredTtsVoice,
  };
}

function getSettingsRow(): VoiceSettingsRow {
  const row = db.select().from(voiceSettings).where(eq(voiceSettings.id, 1)).get();
  if (row) return row;
  db.insert(voiceSettings)
    .values({
      id: 1,
      enabled: false,
      sensitivity: 0.5,
      preferredTtsVoice: null,
      updatedAt: new Date().toISOString(),
    })
    .run();
  const created = db.select().from(voiceSettings).where(eq(voiceSettings.id, 1)).get();
  if (!created) throw new Error("voice_settings insert failed");
  return created;
}

export const voiceRouter = new Hono()
  .get("/settings", (c) => {
    const row = getSettingsRow();
    return c.json(rowToDto(row));
  })

  .patch("/settings", async (c) => {
    const body = (await c.req.json().catch(() => null)) as UpdateVoiceSettingsInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<VoiceSettingsRow> = {};

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "enabled deve essere un booleano" }, 400);
      }
      updates.enabled = body.enabled;
    }

    if (body.sensitivity !== undefined) {
      if (typeof body.sensitivity !== "number" || body.sensitivity < 0 || body.sensitivity > 1) {
        return c.json({ error: "sensitivity deve essere un numero tra 0 e 1" }, 400);
      }
      updates.sensitivity = body.sensitivity;
    }

    if (body.preferredTtsVoice !== undefined) {
      updates.preferredTtsVoice = body.preferredTtsVoice;
    }

    if (Object.keys(updates).length === 0) {
      const row = getSettingsRow();
      return c.json(rowToDto(row));
    }

    updates.updatedAt = new Date().toISOString();

    db.update(voiceSettings).set(updates).where(eq(voiceSettings.id, 1)).run();

    const updated = getSettingsRow();
    return c.json(rowToDto(updated));
  });
