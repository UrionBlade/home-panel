import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { kioskSettings } from "./schema.js";

export function seedKioskSettings() {
  const existing = db.select({ count: sql<number>`count(*)` }).from(kioskSettings).get();
  if (existing && existing.count > 0) return;

  db.insert(kioskSettings).values({ id: 1 }).run();
  console.log("[seed] kiosk_settings: default row (id=1)");
}
