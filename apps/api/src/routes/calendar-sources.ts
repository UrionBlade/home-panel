import { randomUUID } from "node:crypto";
import type {
  CalendarSource,
  CreateCalendarSourceInput,
  UpdateCalendarSourceInput,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type CalendarSourceRow, calendarSources } from "../db/schema.js";
import { syncSource } from "../lib/calendar-sync.js";

function sourceRowToDto(row: CalendarSourceRow): CalendarSource {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    type: row.type,
    color: row.color,
    enabled: row.enabled,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    syncIntervalMinutes: row.syncIntervalMinutes,
  };
}

export const calendarSourcesRouter = new Hono()

  /* ---- list ---- */
  .get("/", (c) => {
    const rows = db.select().from(calendarSources).all();
    return c.json(rows.map(sourceRowToDto));
  })

  /* ---- create + immediate sync ---- */
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateCalendarSourceInput | null;
    if (!body?.name?.trim() || !body.url?.trim()) {
      return c.json({ error: "name e url sono obbligatori" }, 400);
    }

    const id = randomUUID();
    db.insert(calendarSources)
      .values({
        id,
        name: body.name.trim(),
        url: body.url.trim(),
        type: body.type ?? "ics",
        color: body.color ?? "#4A90D9",
        syncIntervalMinutes: body.syncIntervalMinutes ?? 30,
      })
      .run();

    const row = db.select().from(calendarSources).where(eq(calendarSources.id, id)).get();
    if (!row) return c.json({ error: "insert_failed" }, 500);

    void syncSource(row);

    return c.json(sourceRowToDto(row), 201);
  })

  /* ---- update ---- */
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(calendarSources).where(eq(calendarSources.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdateCalendarSourceInput | null;
    if (!body) return c.json({ error: "Body JSON obbligatorio" }, 400);

    const updates: Partial<CalendarSourceRow> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.url !== undefined) updates.url = body.url.trim();
    if (body.type !== undefined) updates.type = body.type;
    if (body.color !== undefined) updates.color = body.color;
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.syncIntervalMinutes !== undefined)
      updates.syncIntervalMinutes = body.syncIntervalMinutes;

    db.update(calendarSources).set(updates).where(eq(calendarSources.id, id)).run();

    const row = db.select().from(calendarSources).where(eq(calendarSources.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(sourceRowToDto(row));
  })

  /* ---- delete ---- */
  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(calendarSources).where(eq(calendarSources.id, id)).run();
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  })

  /* ---- trigger manual sync ---- */
  .post("/:id/sync", async (c) => {
    const id = c.req.param("id");
    const source = db.select().from(calendarSources).where(eq(calendarSources.id, id)).get();
    if (!source) return c.json({ error: "not_found" }, 404);

    await syncSource(source);

    // Reload after sync to get updated status
    const updated = db.select().from(calendarSources).where(eq(calendarSources.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(sourceRowToDto(updated));
  });
