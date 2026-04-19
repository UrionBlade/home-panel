import { randomUUID } from "node:crypto";
import type {
  VoiceWasteResponse,
  WasteCollectionDay,
  WasteException,
  WasteRule,
  WasteRulePattern,
  WasteType,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { db } from "../db/client.js";
import {
  type WasteExceptionRow,
  type WasteRuleRow,
  type WasteTypeRow,
  wasteExceptions,
  wasteRules,
  wasteTypes,
} from "../db/schema.js";
import { expandWastePattern } from "../lib/waste-expander.js";
import { buildWasteVoiceText } from "../lib/waste-voice.js";

function typeRowToDto(row: WasteTypeRow): WasteType {
  return {
    id: row.id,
    displayName: row.displayName,
    color: row.color,
    icon: row.icon,
    containerType: row.containerType,
    expositionInstructions: row.expositionInstructions,
    active: row.active,
  };
}

function ruleRowToDto(row: WasteRuleRow): WasteRule {
  return {
    id: row.id,
    wasteTypeId: row.wasteTypeId,
    pattern: JSON.parse(row.pattern) as WasteRulePattern,
    expositionTime: row.expositionTime,
    active: row.active,
  };
}

const DAYS_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

interface CollectionMap {
  [date: string]: Set<string>;
}

function buildCollectionCalendar(from: Date, to: Date): CollectionMap {
  const rules = db
    .select()
    .from(wasteRules)
    .all()
    .filter((r) => r.active);
  const exceptions = db.select().from(wasteExceptions).all();

  const map: CollectionMap = {};

  for (const rule of rules) {
    const dto = ruleRowToDto(rule);
    const dates = expandWastePattern(dto.pattern, from, to);
    for (const date of dates) {
      if (!map[date]) map[date] = new Set();
      map[date].add(rule.wasteTypeId);
    }
  }

  // Apply exceptions
  for (const exc of exceptions) {
    if (exc.originalDate) {
      const set = map[exc.originalDate];
      if (set) set.delete(exc.wasteTypeId);
    }
    if (exc.replacementDate) {
      const target = exc.replacementDate;
      // Solo se nel range
      const targetDate = new Date(`${target}T00:00:00Z`);
      if (targetDate >= from && targetDate <= to) {
        if (!map[target]) map[target] = new Set();
        map[target].add(exc.wasteTypeId);
      }
    }
  }

  return map;
}

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function tomorrowUTC(): Date {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function endOfDayUTC(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

function exceptionRowToDto(row: WasteExceptionRow): WasteException {
  return {
    id: row.id,
    wasteTypeId: row.wasteTypeId,
    originalDate: row.originalDate,
    replacementDate: row.replacementDate,
    reason: row.reason,
    source: row.source,
  };
}

export const wasteRouter = new Hono()
  /* ---- types: list ---- */
  .get("/types", (c) => {
    const rows = db.select().from(wasteTypes).all();
    return c.json(rows.map(typeRowToDto));
  })

  /* ---- types: create ---- */
  .post("/types", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!displayName) {
      return c.json({ error: "displayName obbligatorio" }, 400);
    }

    const color = typeof body.color === "string" ? body.color.trim() : "";
    if (!color) {
      return c.json({ error: "color obbligatorio" }, 400);
    }

    const containerType = body.containerType;
    if (containerType !== "bag" && containerType !== "bin") {
      return c.json({ error: "containerType deve essere 'bag' o 'bin'" }, 400);
    }

    const icon = typeof body.icon === "string" ? body.icon.trim() : "trash";
    const expositionInstructions =
      typeof body.expositionInstructions === "string"
        ? body.expositionInstructions.trim() || null
        : null;

    const now = new Date().toISOString();
    const row: WasteTypeRow = {
      id: randomUUID(),
      displayName,
      color,
      icon,
      containerType,
      expositionInstructions,
      active: true,
      createdAt: now,
    };
    db.insert(wasteTypes).values(row).run();
    return c.json(typeRowToDto(row), 201);
  })

  /* ---- types: update ---- */
  .patch("/types/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(wasteTypes).where(eq(wasteTypes.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<WasteTypeRow> = {};

    if (body.displayName !== undefined) {
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      if (!displayName) return c.json({ error: "displayName non può essere vuoto" }, 400);
      updates.displayName = displayName;
    }
    if (body.color !== undefined) {
      const color = typeof body.color === "string" ? body.color.trim() : "";
      if (!color) return c.json({ error: "color non può essere vuoto" }, 400);
      updates.color = color;
    }
    if (body.icon !== undefined) {
      updates.icon = typeof body.icon === "string" ? body.icon.trim() : existing.icon;
    }
    if (body.containerType !== undefined) {
      if (body.containerType !== "bag" && body.containerType !== "bin") {
        return c.json({ error: "containerType deve essere 'bag' o 'bin'" }, 400);
      }
      updates.containerType = body.containerType;
    }
    if (body.expositionInstructions !== undefined) {
      updates.expositionInstructions =
        typeof body.expositionInstructions === "string"
          ? body.expositionInstructions.trim() || null
          : null;
    }
    if (body.active !== undefined) {
      updates.active = !!body.active;
    }

    if (Object.keys(updates).length === 0) {
      return c.json(typeRowToDto(existing));
    }

    db.update(wasteTypes).set(updates).where(eq(wasteTypes.id, id)).run();
    const updated = db.select().from(wasteTypes).where(eq(wasteTypes.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(typeRowToDto(updated));
  })

  /* ---- types: delete ---- */
  .delete("/types/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(wasteTypes).where(eq(wasteTypes.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ---- rules: list ---- */
  .get("/rules", (c) => {
    const rows = db.select().from(wasteRules).all();
    return c.json(rows.map(ruleRowToDto));
  })

  /* ---- rules: create ---- */
  .post("/rules", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const wasteTypeId = typeof body.wasteTypeId === "string" ? body.wasteTypeId : "";
    if (!wasteTypeId) {
      return c.json({ error: "wasteTypeId obbligatorio" }, 400);
    }
    const typeExists = db.select().from(wasteTypes).where(eq(wasteTypes.id, wasteTypeId)).get();
    if (!typeExists) {
      return c.json({ error: "wasteTypeId non trovato" }, 404);
    }

    const pattern = body.pattern;
    if (!pattern || typeof pattern !== "object") {
      return c.json({ error: "pattern obbligatorio (oggetto JSON)" }, 400);
    }
    const p = pattern as Record<string, unknown>;
    if (!p.freq || !p.anchorDate) {
      return c.json({ error: "pattern deve avere freq e anchorDate" }, 400);
    }

    const expositionTime = typeof body.expositionTime === "string" ? body.expositionTime : "20:00";
    if (!/^\d{2}:\d{2}$/.test(expositionTime)) {
      return c.json({ error: "expositionTime deve essere in formato HH:MM" }, 400);
    }

    const now = new Date().toISOString();
    const row: WasteRuleRow = {
      id: randomUUID(),
      wasteTypeId,
      pattern: JSON.stringify(pattern),
      expositionTime,
      active: true,
      createdAt: now,
    };
    db.insert(wasteRules).values(row).run();
    return c.json(ruleRowToDto(row), 201);
  })

  /* ---- rules: update ---- */
  .patch("/rules/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(wasteRules).where(eq(wasteRules.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<WasteRuleRow> = {};

    if (body.pattern !== undefined) {
      if (!body.pattern || typeof body.pattern !== "object") {
        return c.json({ error: "pattern deve essere un oggetto JSON" }, 400);
      }
      updates.pattern = JSON.stringify(body.pattern);
    }
    if (body.expositionTime !== undefined) {
      const expositionTime = typeof body.expositionTime === "string" ? body.expositionTime : "";
      if (!/^\d{2}:\d{2}$/.test(expositionTime)) {
        return c.json({ error: "expositionTime deve essere in formato HH:MM" }, 400);
      }
      updates.expositionTime = expositionTime;
    }
    if (body.active !== undefined) {
      updates.active = !!body.active;
    }

    if (Object.keys(updates).length === 0) {
      return c.json(ruleRowToDto(existing));
    }

    db.update(wasteRules).set(updates).where(eq(wasteRules.id, id)).run();
    const updated = db.select().from(wasteRules).where(eq(wasteRules.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(ruleRowToDto(updated));
  })

  /* ---- rules: delete ---- */
  .delete("/rules/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(wasteRules).where(eq(wasteRules.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ---- exceptions: list ---- */
  .get("/exceptions", (c) => {
    const rows = db.select().from(wasteExceptions).all();
    return c.json(rows.map(exceptionRowToDto));
  })

  /* ---- exceptions: create ---- */
  .post("/exceptions", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const wasteTypeId = typeof body.wasteTypeId === "string" ? body.wasteTypeId : "";
    if (!wasteTypeId) {
      return c.json({ error: "wasteTypeId obbligatorio" }, 400);
    }
    const typeExists = db.select().from(wasteTypes).where(eq(wasteTypes.id, wasteTypeId)).get();
    if (!typeExists) {
      return c.json({ error: "wasteTypeId non trovato" }, 404);
    }

    const originalDate = typeof body.originalDate === "string" ? body.originalDate : null;
    const replacementDate = typeof body.replacementDate === "string" ? body.replacementDate : null;
    const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    const now = new Date().toISOString();
    const row: WasteExceptionRow = {
      id: randomUUID(),
      wasteTypeId,
      originalDate,
      replacementDate,
      reason,
      source: "manual",
      createdAt: now,
    };
    db.insert(wasteExceptions).values(row).run();
    return c.json(exceptionRowToDto(row), 201);
  })

  /* ---- exceptions: delete ---- */
  .delete("/exceptions/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(wasteExceptions).where(eq(wasteExceptions.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ---- calendar (range) ---- */
  .get("/calendar", (c) => {
    const fromStr = c.req.query("from");
    const toStr = c.req.query("to");
    if (!fromStr || !toStr) {
      return c.json({ error: "from e to obbligatori" }, 400);
    }
    const from = new Date(`${fromStr}T00:00:00Z`);
    const to = endOfDayUTC(new Date(`${toStr}T00:00:00Z`));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return c.json({ error: "Date non valide" }, 400);
    }

    const map = buildCollectionCalendar(from, to);
    const types = db.select().from(wasteTypes).all();
    const typeById = new Map<string, WasteTypeRow>();
    for (const t of types) typeById.set(t.id, t);

    const rules = db.select().from(wasteRules).all();
    const expositionByType = new Map<string, string>();
    for (const r of rules) {
      expositionByType.set(r.wasteTypeId, r.expositionTime);
    }

    const days: WasteCollectionDay[] = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, set]) => {
        const date = new Date(`${dateKey}T00:00:00Z`);
        const today = todayUTC();
        const tomorrow = tomorrowUTC();
        return {
          date: dateKey,
          dayOfWeek: DAYS_IT[date.getUTCDay()] ?? "",
          isToday: dateKey === today.toISOString().slice(0, 10),
          isTomorrow: dateKey === tomorrow.toISOString().slice(0, 10),
          wasteTypes: Array.from(set)
            .map((id) => {
              const t = typeById.get(id);
              if (!t) return null;
              return {
                id,
                displayName: t.displayName,
                color: t.color,
                icon: t.icon,
                expositionTime: expositionByType.get(id) ?? "20:00",
              };
            })
            .filter(
              (
                x,
              ): x is {
                id: string;
                displayName: string;
                color: string;
                icon: string;
                expositionTime: string;
              } => x !== null,
            ),
        };
      });

    return c.json(days);
  })

  /* ---- today / tomorrow voice ---- */
  .get("/today", (c) => buildVoiceWaste("tonight", c))
  .get("/tomorrow", (c) => buildVoiceWaste("tomorrow", c));

function buildVoiceWaste(when: "tonight" | "tomorrow", c: Context) {
  const target = when === "tonight" ? todayUTC() : tomorrowUTC();
  const dateKey = target.toISOString().slice(0, 10);
  const map = buildCollectionCalendar(target, endOfDayUTC(target));

  const ids = Array.from(map[dateKey] ?? []);
  const types = db.select().from(wasteTypes).all();
  const typeById = new Map<string, WasteTypeRow>();
  for (const t of types) typeById.set(t.id, t);

  const wasteTypesOut = ids
    .map((id) => {
      const t = typeById.get(id);
      return t ? { id, displayName: t.displayName } : null;
    })
    .filter((x): x is { id: string; displayName: string } => x !== null);

  const response: VoiceWasteResponse = {
    date: dateKey,
    dayOfWeek: DAYS_IT[target.getUTCDay()] ?? "",
    wasteTypes: wasteTypesOut,
    voiceText: buildWasteVoiceText(wasteTypesOut, when),
  };
  return c.json(response);
}
