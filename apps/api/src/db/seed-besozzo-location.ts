import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { weatherLocations } from "./schema.js";

export function seedBesozzoLocation() {
  const existing = db.select({ count: sql<number>`count(*)` }).from(weatherLocations).get();
  if (existing && existing.count > 0) return;

  db.insert(weatherLocations)
    .values({
      id: "besozzo",
      label: "Besozzo",
      latitude: 45.7595,
      longitude: 8.6608,
      isDefault: true,
    })
    .run();
  console.log("[seed] weather_locations: Besozzo (default)");
}
