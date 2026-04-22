import { randomUUID } from "node:crypto";
import type { CreateRoomInput, Room, UpdateRoomInput } from "@home-panel/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type RoomRow, rooms } from "../db/schema.js";

function rowToRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 64) return null;
  return trimmed;
}

export const roomsRouter = new Hono()
  .get("/", (c) => {
    const list = db.select().from(rooms).orderBy(asc(rooms.sortOrder), asc(rooms.createdAt)).all();
    return c.json(list.map(rowToRoom));
  })

  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateRoomInput | null;
    const name = normalizeName(body?.name);
    if (!name) {
      return c.json({ error: "name obbligatorio (1-64 caratteri)" }, 400);
    }
    const now = new Date().toISOString();
    const row: RoomRow = {
      id: randomUUID(),
      name,
      icon: typeof body?.icon === "string" && body.icon.trim() ? body.icon.trim() : null,
      sortOrder: Number.isFinite(body?.sortOrder) ? Number(body?.sortOrder) : 0,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(rooms).values(row).run();
    return c.json(rowToRoom(row), 201);
  })

  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(rooms).where(eq(rooms.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdateRoomInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<RoomRow> = {};
    if (body.name !== undefined) {
      const name = normalizeName(body.name);
      if (!name) return c.json({ error: "name non valido" }, 400);
      updates.name = name;
    }
    if (body.icon !== undefined) {
      updates.icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : null;
    }
    if (body.sortOrder !== undefined && Number.isFinite(body.sortOrder)) {
      updates.sortOrder = Number(body.sortOrder);
    }

    if (Object.keys(updates).length === 0) {
      return c.json(rowToRoom(existing));
    }

    updates.updatedAt = new Date().toISOString();
    db.update(rooms).set(updates).where(eq(rooms.id, id)).run();
    const updated = db.select().from(rooms).where(eq(rooms.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToRoom(updated));
  })

  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(rooms).where(eq(rooms.id, id)).run();
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });
