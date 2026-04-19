import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { voiceSettings } from "./schema.js";

export function seedVoiceSettings() {
  const existing = db.select({ count: sql<number>`count(*)` }).from(voiceSettings).get();
  if (existing && existing.count > 0) return;

  db.insert(voiceSettings)
    .values({
      id: 1,
      enabled: false,
      sensitivity: 0.5,
      preferredTtsVoice: null,
      updatedAt: new Date().toISOString(),
    })
    .run();
  console.log("[seed] voice_settings: default row");
}
