import { randomUUID } from "node:crypto";
import type {
  CalendarEvent,
  CreateEventInput,
  EventAttendee,
  EventCategory,
  EventInstance,
  RecurrenceRule,
  UpdateEventInput,
  VoiceEventsResponse,
} from "@home-panel/shared";
import { asc, eq, inArray } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { db } from "../db/client.js";
import {
  calendarSources,
  type EventCategoryRow,
  type EventRow,
  eventAttendees,
  eventCategories,
  events,
  familyMembers,
} from "../db/schema.js";
import { expandRecurrence } from "../lib/recurrence.js";

function categoryRowToDto(row: EventCategoryRow): EventCategory {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    icon: row.icon,
  };
}

interface MemberRow {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
}

function attendeeFromRow(row: MemberRow): EventAttendee {
  return {
    id: row.id,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    accentColor: row.accentColor,
  };
}

function loadAttendeesByEventIds(eventIds: string[]): Map<string, EventAttendee[]> {
  if (eventIds.length === 0) return new Map();
  const joinRows = db
    .select({
      eventId: eventAttendees.eventId,
      id: familyMembers.id,
      displayName: familyMembers.displayName,
      avatarUrl: familyMembers.avatarUrl,
      accentColor: familyMembers.accentColor,
    })
    .from(eventAttendees)
    .innerJoin(familyMembers, eq(eventAttendees.familyMemberId, familyMembers.id))
    .where(inArray(eventAttendees.eventId, eventIds))
    .all();

  const map = new Map<string, EventAttendee[]>();
  for (const row of joinRows) {
    const list = map.get(row.eventId) ?? [];
    list.push(
      attendeeFromRow({
        id: row.id,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        accentColor: row.accentColor,
      }),
    );
    map.set(row.eventId, list);
  }
  return map;
}

function loadSourceColorMap(): Map<string, string> {
  const rows = db.select().from(calendarSources).all();
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, row.color);
  }
  return map;
}

function eventRowToDto(
  row: EventRow,
  attendees: EventAttendee[],
  categoryDto: EventCategory | null,
  sourceColor: string | null = null,
): CalendarEvent {
  let recurrenceRule: RecurrenceRule | null = null;
  if (row.recurrenceRule) {
    try {
      recurrenceRule = JSON.parse(row.recurrenceRule) as RecurrenceRule;
    } catch {
      recurrenceRule = null;
    }
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    location: row.location,
    categoryId: row.categoryId,
    category: categoryDto,
    recurrenceRule,
    reminderMinutes: row.reminderMinutes,
    attendees,
    sourceId: row.sourceId,
    sourceColor,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function loadCategoryMap(): Map<string, EventCategory> {
  const rows = db.select().from(eventCategories).all();
  const map = new Map<string, EventCategory>();
  for (const row of rows) {
    map.set(row.id, categoryRowToDto(row));
  }
  return map;
}

function isoOrNull(s: string | null): string | null {
  return s;
}
void isoOrNull;

function expandEventRow(
  row: EventRow,
  fromDate: Date,
  toDate: Date,
  attendees: EventAttendee[],
  categoryDto: EventCategory | null,
  sourceColor: string | null = null,
): EventInstance[] {
  const start = new Date(row.startsAt);
  const end = new Date(row.endsAt);
  const durationMs = Math.max(0, end.getTime() - start.getTime());

  let rule: RecurrenceRule | null = null;
  if (row.recurrenceRule) {
    try {
      rule = JSON.parse(row.recurrenceRule) as RecurrenceRule;
    } catch {
      rule = null;
    }
  }

  const occurrences = expandRecurrence(start, rule, fromDate, toDate);

  return occurrences.map((occStart) => {
    const occEnd = new Date(occStart.getTime() + durationMs);
    return {
      ...eventRowToDto(row, attendees, categoryDto, sourceColor),
      instanceStartsAt: occStart.toISOString(),
      instanceEndsAt: occEnd.toISOString(),
    } satisfies EventInstance;
  });
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

export const calendarRouter = new Hono()
  /* ---- categories ---- */
  .get("/categories", (c) => {
    const rows = db.select().from(eventCategories).all();
    return c.json(rows.map(categoryRowToDto));
  })

  /* ---- events list (raw, no expansion) ---- */
  .get("/events", (c) => {
    const rows = db.select().from(events).orderBy(asc(events.startsAt)).all();
    const ids = rows.map((r) => r.id);
    const attendees = loadAttendeesByEventIds(ids);
    const categories = loadCategoryMap();
    const sourceColors = loadSourceColorMap();
    return c.json(
      rows.map((row) =>
        eventRowToDto(
          row,
          attendees.get(row.id) ?? [],
          row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
          row.sourceId ? (sourceColors.get(row.sourceId) ?? null) : null,
        ),
      ),
    );
  })

  .get("/events/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(events).where(eq(events.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    const attendees = loadAttendeesByEventIds([id]);
    const categories = loadCategoryMap();
    const sourceColors = loadSourceColorMap();
    return c.json(
      eventRowToDto(
        row,
        attendees.get(id) ?? [],
        row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
        row.sourceId ? (sourceColors.get(row.sourceId) ?? null) : null,
      ),
    );
  })

  /* ---- expanded (con istanze ricorrenti) ---- */
  .get("/expanded", (c) => {
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    if (!fromStr || !toStr) {
      return c.json({ error: "from e to obbligatori (ISO date)" }, 400);
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    const maxRangeMs = 365 * 24 * 60 * 60 * 1000;
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to.getTime() - from.getTime() > maxRangeMs
    ) {
      return c.json({ error: "Range non valido (max 365gg)" }, 400);
    }

    const rows = db.select().from(events).all();
    const ids = rows.map((r) => r.id);
    const attendees = loadAttendeesByEventIds(ids);
    const categories = loadCategoryMap();
    const sourceColors = loadSourceColorMap();

    const all: EventInstance[] = [];
    for (const row of rows) {
      const expanded = expandEventRow(
        row,
        from,
        to,
        attendees.get(row.id) ?? [],
        row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
        row.sourceId ? (sourceColors.get(row.sourceId) ?? null) : null,
      );
      all.push(...expanded);
    }
    all.sort((a, b) => a.instanceStartsAt.localeCompare(b.instanceStartsAt));
    return c.json(all);
  })

  /* ---- create ---- */
  .post("/events", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateEventInput | null;
    if (!body?.title?.trim()) {
      return c.json({ error: "title è obbligatorio" }, 400);
    }
    if (!body.startsAt || !body.endsAt) {
      return c.json({ error: "startsAt ed endsAt obbligatori" }, 400);
    }
    if (new Date(body.endsAt) < new Date(body.startsAt)) {
      return c.json({ error: "endsAt deve essere ≥ startsAt" }, 400);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(events)
      .values({
        id,
        title: body.title.trim(),
        description: body.description ?? null,
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        allDay: body.allDay ?? false,
        location: body.location ?? null,
        categoryId: body.categoryId ?? null,
        recurrenceRule: body.recurrenceRule ? JSON.stringify(body.recurrenceRule) : null,
        reminderMinutes: body.reminderMinutes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (body.attendeeIds && body.attendeeIds.length > 0) {
      for (const memberId of body.attendeeIds) {
        db.insert(eventAttendees).values({ eventId: id, familyMemberId: memberId }).run();
      }
    }

    const row = db.select().from(events).where(eq(events.id, id)).get();
    if (!row) return c.json({ error: "insert_failed" }, 500);
    const attendees = loadAttendeesByEventIds([id]);
    const categories = loadCategoryMap();
    return c.json(
      eventRowToDto(
        row,
        attendees.get(id) ?? [],
        row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
        null,
      ),
      201,
    );
  })

  /* ---- update ---- */
  .patch("/events/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(events).where(eq(events.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdateEventInput | null;
    if (!body) return c.json({ error: "Body JSON obbligatorio" }, 400);

    const updates: Partial<EventRow> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.title !== undefined) {
      if (!body.title.trim()) {
        return c.json({ error: "title non può essere vuoto" }, 400);
      }
      updates.title = body.title.trim();
    }
    if (body.description !== undefined) updates.description = body.description;
    if (body.startsAt !== undefined) updates.startsAt = body.startsAt;
    if (body.endsAt !== undefined) updates.endsAt = body.endsAt;
    if (body.allDay !== undefined) updates.allDay = body.allDay;
    if (body.location !== undefined) updates.location = body.location;
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
    if (body.recurrenceRule !== undefined) {
      updates.recurrenceRule = body.recurrenceRule ? JSON.stringify(body.recurrenceRule) : null;
    }
    if (body.reminderMinutes !== undefined) {
      updates.reminderMinutes = body.reminderMinutes;
    }

    const finalStarts = updates.startsAt ?? existing.startsAt;
    const finalEnds = updates.endsAt ?? existing.endsAt;
    if (new Date(finalEnds) < new Date(finalStarts)) {
      return c.json({ error: "endsAt deve essere ≥ startsAt" }, 400);
    }

    db.update(events).set(updates).where(eq(events.id, id)).run();

    if (body.attendeeIds) {
      db.delete(eventAttendees).where(eq(eventAttendees.eventId, id)).run();
      for (const memberId of body.attendeeIds) {
        db.insert(eventAttendees).values({ eventId: id, familyMemberId: memberId }).run();
      }
    }

    const row = db.select().from(events).where(eq(events.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    const attendees = loadAttendeesByEventIds([id]);
    const categories = loadCategoryMap();
    const sourceColors = loadSourceColorMap();
    return c.json(
      eventRowToDto(
        row,
        attendees.get(id) ?? [],
        row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
        row.sourceId ? (sourceColors.get(row.sourceId) ?? null) : null,
      ),
    );
  })

  /* ---- delete ---- */
  .delete("/events/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(events).where(eq(events.id, id)).run();
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  })

  /* ---- voice friendly today / tomorrow ---- */
  .get("/today", (c) => buildVoiceEvents(c, 0))
  .get("/tomorrow", (c) => buildVoiceEvents(c, 1));

function buildVoiceEvents(c: Context, dayOffset: number) {
  const now = new Date();
  const day = new Date(now);
  day.setUTCDate(now.getUTCDate() + dayOffset);
  const from = startOfDay(day);
  const to = endOfDay(day);

  const rows = db.select().from(events).all();
  const ids = rows.map((r) => r.id);
  const attendees = loadAttendeesByEventIds(ids);
  const categories = loadCategoryMap();
  const sourceColors = loadSourceColorMap();

  const all: EventInstance[] = [];
  for (const row of rows) {
    const expanded = expandEventRow(
      row,
      from,
      to,
      attendees.get(row.id) ?? [],
      row.categoryId ? (categories.get(row.categoryId) ?? null) : null,
      row.sourceId ? (sourceColors.get(row.sourceId) ?? null) : null,
    );
    all.push(...expanded);
  }
  all.sort((a, b) => a.instanceStartsAt.localeCompare(b.instanceStartsAt));

  const response: VoiceEventsResponse = {
    date: from.toISOString().slice(0, 10),
    events: all.map((ev) => ({
      id: ev.id,
      title: ev.title,
      startsAt: ev.instanceStartsAt,
      endsAt: ev.instanceEndsAt,
      allDay: ev.allDay,
      categoryName: ev.category?.name ?? null,
      categoryColor: ev.category?.color ?? null,
      attendeeNames: ev.attendees.map((a) => a.displayName),
    })),
  };
  return c.json(response);
}
