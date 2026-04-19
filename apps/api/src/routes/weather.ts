import { randomUUID } from "node:crypto";
import type {
  CurrentWeather,
  DailyForecast,
  VoiceWeatherResponse,
  WeatherLocation,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type WeatherLocationRow, weatherCache, weatherLocations } from "../db/schema.js";
import { fetchOpenMeteo, normalizeOpenMeteoResponse } from "../lib/open-meteo.js";

const CACHE_TTL_MS = 15 * 60 * 1000;

function locationRowToDto(row: WeatherLocationRow): WeatherLocation {
  return {
    id: row.id,
    label: row.label,
    latitude: row.latitude,
    longitude: row.longitude,
    isDefault: row.isDefault,
  };
}

function getDefaultLocation(): WeatherLocationRow | null {
  return (
    db.select().from(weatherLocations).where(eq(weatherLocations.isDefault, true)).get() ??
    db.select().from(weatherLocations).get() ??
    null
  );
}

interface CachedPayload {
  current: CurrentWeather;
  daily: DailyForecast[];
}

async function getOrFetchWeather(locationRow: WeatherLocationRow): Promise<CachedPayload> {
  const cacheRow = db
    .select()
    .from(weatherCache)
    .where(eq(weatherCache.locationId, locationRow.id))
    .get();

  const now = Date.now();
  if (cacheRow) {
    const fetchedAt = new Date(cacheRow.fetchedAt).getTime();
    if (now - fetchedAt < CACHE_TTL_MS) {
      const cached = JSON.parse(cacheRow.payload) as CachedPayload;
      cached.current.stale = false;
      return cached;
    }
  }

  // Fetch fresh
  try {
    const raw = await fetchOpenMeteo(locationRow.latitude, locationRow.longitude);
    const normalized = normalizeOpenMeteoResponse(raw, locationRowToDto(locationRow), new Date());
    db.insert(weatherCache)
      .values({
        locationId: locationRow.id,
        fetchedAt: normalized.current.fetchedAt,
        payload: JSON.stringify(normalized),
      })
      .onConflictDoUpdate({
        target: weatherCache.locationId,
        set: {
          fetchedAt: normalized.current.fetchedAt,
          payload: JSON.stringify(normalized),
        },
      })
      .run();
    return normalized;
  } catch (err) {
    if (cacheRow) {
      console.warn("[weather] Open-Meteo failed, serving stale cache", (err as Error).message);
      const cached = JSON.parse(cacheRow.payload) as CachedPayload;
      cached.current.stale = true;
      return cached;
    }
    throw err;
  }
}

function buildVoiceText(when: string, current: CurrentWeather, daily: DailyForecast[]): string {
  const t = Math.round(current.temperature);
  const max = Math.round(current.todayMax);
  const min = Math.round(current.todayMin);
  if (when === "now") {
    return `A ${current.locationLabel} ci sono ${t} gradi, ${current.condition.toLowerCase()}. Massima ${max}, minima ${min}.`;
  }
  if (when === "today") {
    return `Oggi a ${current.locationLabel} ${current.condition.toLowerCase()}, tra ${min} e ${max} gradi.`;
  }
  if (when === "tomorrow") {
    const t1 = daily[1];
    if (!t1) return "Previsione di domani non disponibile";
    return `Domani a ${current.locationLabel} ${t1.condition.toLowerCase()}, tra ${Math.round(t1.temperatureMin)} e ${Math.round(t1.temperatureMax)} gradi.`;
  }
  return current.condition;
}

export const weatherRouter = new Hono()
  /* ----- list locations ----- */
  .get("/locations", (c) => {
    const rows = db.select().from(weatherLocations).all();
    return c.json(rows.map(locationRowToDto));
  })

  /* ----- create location ----- */
  .post("/locations", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      label?: string;
      latitude?: number;
      longitude?: number;
      isDefault?: boolean;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }
    const label = body.label?.trim();
    if (!label) {
      return c.json({ error: "label è obbligatorio" }, 400);
    }
    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return c.json({ error: "latitude deve essere un numero tra -90 e 90" }, 400);
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return c.json({ error: "longitude deve essere un numero tra -180 e 180" }, 400);
    }
    const isDefault = body.isDefault ?? false;
    if (isDefault) {
      db.update(weatherLocations)
        .set({ isDefault: false })
        .where(eq(weatherLocations.isDefault, true))
        .run();
    }
    const now = new Date().toISOString();
    const row: WeatherLocationRow = {
      id: randomUUID(),
      label,
      latitude: lat,
      longitude: lng,
      isDefault: isDefault,
      createdAt: now,
    };
    db.insert(weatherLocations).values(row).run();
    return c.json(locationRowToDto(row), 201);
  })

  /* ----- update location ----- */
  .patch("/locations/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(weatherLocations).where(eq(weatherLocations.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as {
      label?: string;
      latitude?: number;
      longitude?: number;
    } | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<WeatherLocationRow> = {};
    if (body.label !== undefined) {
      const label = body.label?.trim();
      if (!label) return c.json({ error: "label non può essere vuoto" }, 400);
      updates.label = label;
    }
    if (body.latitude !== undefined) {
      const lat = Number(body.latitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        return c.json({ error: "latitude deve essere un numero tra -90 e 90" }, 400);
      }
      updates.latitude = lat;
    }
    if (body.longitude !== undefined) {
      const lng = Number(body.longitude);
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        return c.json({ error: "longitude deve essere un numero tra -180 e 180" }, 400);
      }
      updates.longitude = lng;
    }

    if (Object.keys(updates).length === 0) {
      return c.json(locationRowToDto(existing));
    }

    db.update(weatherLocations).set(updates).where(eq(weatherLocations.id, id)).run();
    const updated = db.select().from(weatherLocations).where(eq(weatherLocations.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(locationRowToDto(updated));
  })

  /* ----- delete location ----- */
  .delete("/locations/:id", (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(weatherLocations).where(eq(weatherLocations.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    if (existing.isDefault) {
      const totalCount = db.select().from(weatherLocations).all().length;
      if (totalCount <= 1) {
        return c.json({ error: "Non puoi eliminare l'unica località predefinita" }, 400);
      }
      // Delete, then set another as default
      db.delete(weatherLocations).where(eq(weatherLocations.id, id)).run();
      db.delete(weatherCache).where(eq(weatherCache.locationId, id)).run();
      const next = db.select().from(weatherLocations).get();
      if (next) {
        db.update(weatherLocations)
          .set({ isDefault: true })
          .where(eq(weatherLocations.id, next.id))
          .run();
      }
    } else {
      db.delete(weatherLocations).where(eq(weatherLocations.id, id)).run();
      db.delete(weatherCache).where(eq(weatherCache.locationId, id)).run();
    }
    return c.body(null, 204);
  })

  /* ----- set default location ----- */
  .post("/locations/:id/set-default", (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(weatherLocations).where(eq(weatherLocations.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    db.update(weatherLocations)
      .set({ isDefault: false })
      .where(eq(weatherLocations.isDefault, true))
      .run();
    db.update(weatherLocations).set({ isDefault: true }).where(eq(weatherLocations.id, id)).run();

    const updated = db.select().from(weatherLocations).where(eq(weatherLocations.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(locationRowToDto(updated));
  })

  .get("/current", async (c) => {
    const locId = c.req.query("locationId");
    let row: WeatherLocationRow | null = null;
    if (locId) {
      row = db.select().from(weatherLocations).where(eq(weatherLocations.id, locId)).get() ?? null;
    }
    if (!row) row = getDefaultLocation();
    if (!row) return c.json({ error: "no_location_configured" }, 404);

    const data = await getOrFetchWeather(row);
    return c.json(data.current);
  })

  .get("/forecast", async (c) => {
    const locId = c.req.query("locationId");
    const days = Math.min(14, Math.max(1, Number(c.req.query("days") ?? 7)));
    let row: WeatherLocationRow | null = null;
    if (locId) {
      row = db.select().from(weatherLocations).where(eq(weatherLocations.id, locId)).get() ?? null;
    }
    if (!row) row = getDefaultLocation();
    if (!row) return c.json({ error: "no_location_configured" }, 404);

    const data = await getOrFetchWeather(row);
    return c.json({
      current: data.current,
      daily: data.daily.slice(0, days),
    });
  })

  .get("/voice", async (c) => {
    const when = c.req.query("when") ?? "now";
    const row = getDefaultLocation();
    if (!row) return c.json({ error: "no_location_configured" }, 404);
    const data = await getOrFetchWeather(row);
    const response: VoiceWeatherResponse = {
      voiceText: buildVoiceText(when, data.current, data.daily),
    };
    return c.json(response);
  });
