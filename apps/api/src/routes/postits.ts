import { randomUUID } from "node:crypto";
import type { CreatePostitInput, Postit, PostitColor, UpdatePostitInput } from "@home-panel/shared";
import { POSTIT_COLORS } from "@home-panel/shared";
import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type PostitRow, postits } from "../db/schema.js";

function rowToPostit(row: PostitRow): Postit {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    color: row.color as PostitColor,
    posX: row.posX,
    posY: row.posY,
    rotation: row.rotation,
    zIndex: row.zIndex,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getMaxZIndex(): number {
  const result = db.select({ max: sql<number>`COALESCE(MAX(z_index), 0)` }).from(postits).get();
  return result?.max ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Common filler patterns in Italian speech. */
const FILLER_RE = /^(ricordami\s+di|ricordati\s+di|nota:\s*|appunto:\s*|memo:\s*)/i;

export const postitsRouter = new Hono()
  /* ----- list ----- */
  .get("/", (c) => {
    const rows = db.select().from(postits).orderBy(asc(postits.zIndex)).all();
    return c.json(rows.map(rowToPostit));
  })

  /* ----- create ----- */
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreatePostitInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const title = body.title?.trim() || null;
    const bodyText = body.body?.trim() || null;

    if (!title && !bodyText) {
      return c.json({ error: "Almeno uno tra title e body è obbligatorio" }, 400);
    }

    const color: PostitColor = body.color ?? "amber";
    if (!(POSTIT_COLORS as readonly string[]).includes(color)) {
      return c.json({ error: "color non valido" }, 400);
    }

    const rotation = Math.round((Math.random() * 16 - 8) * 100) / 100;
    const zIndex = getMaxZIndex() + 1;
    const now = new Date().toISOString();
    // Random position within the safe area (10%-80%)
    const posX = Math.round((0.1 + Math.random() * 0.7) * 1000) / 1000;
    const posY = Math.round((0.1 + Math.random() * 0.7) * 1000) / 1000;

    const row: PostitRow = {
      id: randomUUID(),
      title,
      body: bodyText,
      color,
      posX,
      posY,
      rotation,
      zIndex,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(postits).values(row).run();
    return c.json(rowToPostit(row), 201);
  })

  /* ----- update ----- */
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(postits).where(eq(postits.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdatePostitInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const updates: Partial<PostitRow> = {};

    if (body.title !== undefined) {
      updates.title = body.title?.trim() || null;
    }
    if (body.body !== undefined) {
      updates.body = body.body?.trim() || null;
    }
    if (body.color !== undefined) {
      if (!(POSTIT_COLORS as readonly string[]).includes(body.color)) {
        return c.json({ error: "color non valido" }, 400);
      }
      updates.color = body.color;
    }
    if (body.posX !== undefined) {
      updates.posX = clamp(body.posX, 0, 1);
    }
    if (body.posY !== undefined) {
      updates.posY = clamp(body.posY, 0, 1);
    }

    // Ensure at least one of title/body remains non-empty
    const finalTitle = updates.title !== undefined ? updates.title : existing.title;
    const finalBody = updates.body !== undefined ? updates.body : existing.body;
    if (!finalTitle && !finalBody) {
      return c.json({ error: "Almeno uno tra title e body è obbligatorio" }, 400);
    }

    if (Object.keys(updates).length === 0) {
      return c.json(rowToPostit(existing));
    }

    updates.updatedAt = new Date().toISOString();

    db.update(postits).set(updates).where(eq(postits.id, id)).run();
    const updated = db.select().from(postits).where(eq(postits.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToPostit(updated));
  })

  /* ----- delete ----- */
  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(postits).where(eq(postits.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ----- bring to front ----- */
  .post("/:id/bring-to-front", (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(postits).where(eq(postits.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const newZ = getMaxZIndex() + 1;
    db.update(postits)
      .set({ zIndex: newZ, updatedAt: new Date().toISOString() })
      .where(eq(postits.id, id))
      .run();

    const updated = db.select().from(postits).where(eq(postits.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToPostit(updated));
  })

  /* ----- natural language create ----- */
  .post("/by-natural-language", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { text: string } | null;
    if (!body?.text?.trim()) {
      return c.json({ error: "text obbligatorio" }, 400);
    }

    // Strip fillers
    let cleaned = body.text.trim().replace(FILLER_RE, "").trim();
    if (!cleaned) cleaned = body.text.trim();

    let title: string | null;
    let bodyText: string | null;

    if (cleaned.length <= 30) {
      title = cleaned;
      bodyText = null;
    } else {
      // First sentence (up to 30 chars) as title
      const sentenceEnd = cleaned.search(/[.!?]\s/);
      if (sentenceEnd !== -1 && sentenceEnd <= 30) {
        title = cleaned.slice(0, sentenceEnd + 1);
      } else {
        // Truncate at 30 chars on the nearest word boundary
        const truncated = cleaned.slice(0, 30);
        const lastSpace = truncated.lastIndexOf(" ");
        title = lastSpace > 10 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
      }
      bodyText = cleaned;
    }

    const rotation = Math.round((Math.random() * 16 - 8) * 100) / 100;
    const zIndex = getMaxZIndex() + 1;
    const now = new Date().toISOString();
    const posX = Math.round((0.1 + Math.random() * 0.7) * 1000) / 1000;
    const posY = Math.round((0.1 + Math.random() * 0.7) * 1000) / 1000;

    const row: PostitRow = {
      id: randomUUID(),
      title,
      body: bodyText,
      color: "amber",
      posX,
      posY,
      rotation,
      zIndex,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(postits).values(row).run();
    return c.json(rowToPostit(row), 201);
  });
