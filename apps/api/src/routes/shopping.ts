import { randomUUID } from "node:crypto";
import type {
  AuditEntry,
  CreateShoppingItemInput,
  Product,
  ShoppingCategory,
  ShoppingItem,
  ShoppingUnit,
  UpdateShoppingItemInput,
} from "@home-panel/shared";
import { SHOPPING_CATEGORIES, SHOPPING_UNITS } from "@home-panel/shared";
import { and, asc, desc, eq, like } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { productCatalog, type ShoppingItemRow, shoppingItems } from "../db/schema.js";
import { levenshtein } from "../lib/levenshtein.js";

const MAX_AUDIT_ENTRIES = 20;

function rowToItem(row: ShoppingItemRow): ShoppingItem {
  let log: AuditEntry[] = [];
  try {
    log = JSON.parse(row.auditLog) as AuditEntry[];
  } catch {
    log = [];
  }
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit as ShoppingUnit,
    category: row.category as ShoppingCategory,
    completed: row.completed,
    addedAt: row.addedAt,
    addedBy: row.addedBy,
    auditLog: log,
  };
}

function pushAudit(log: AuditEntry[], entry: AuditEntry): AuditEntry[] {
  const next = [...log, entry];
  if (next.length > MAX_AUDIT_ENTRIES) {
    return next.slice(next.length - MAX_AUDIT_ENTRIES);
  }
  return next;
}

interface NamedRow {
  name: string;
}

function findByName<T extends NamedRow>(name: string, rows: T[]): T | null {
  const target = name.trim().toLowerCase();
  if (!target) return null;
  // exact
  let match = rows.find((r) => r.name.toLowerCase() === target);
  if (match) return match;
  // prefix
  match = rows.find((r) => r.name.toLowerCase().startsWith(target));
  if (match) return match;
  // fuzzy levenshtein <= 2
  let bestDistance = 3;
  let best: T | null = null;
  for (const r of rows) {
    const d = levenshtein(target, r.name.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = r;
    }
  }
  return best;
}

export const shoppingRouter = new Hono()
  /* ----- categories / units ----- */
  .get("/categories", (c) => c.json(SHOPPING_CATEGORIES.map((id) => ({ id }))))
  .get("/units", (c) => c.json(SHOPPING_UNITS.map((id) => ({ id }))))

  /* ----- product catalog (autocomplete) ----- */
  .get("/products", (c) => {
    const q = (c.req.query("q") ?? "").trim();
    const rows = q
      ? db
          .select()
          .from(productCatalog)
          .where(like(productCatalog.name, `${q}%`))
          .orderBy(asc(productCatalog.name))
          .limit(8)
          .all()
      : db.select().from(productCatalog).orderBy(asc(productCatalog.name)).limit(8).all();
    const products: Product[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category as ShoppingCategory,
      defaultUnit: r.defaultUnit as ShoppingUnit,
    }));
    return c.json(products);
  })

  /* ----- items list ----- */
  .get("/items", (c) => {
    const rows = db
      .select()
      .from(shoppingItems)
      .orderBy(asc(shoppingItems.completed), desc(shoppingItems.addedAt))
      .all();
    return c.json(rows.map(rowToItem));
  })

  /* ----- create ----- */
  .post("/items", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateShoppingItemInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ error: "name è obbligatorio" }, 400);
    }
    const category = body.category ?? "other";
    const unit = body.unit ?? "pz";
    if (!SHOPPING_CATEGORIES.includes(category)) {
      return c.json({ error: "category non valida" }, 400);
    }
    if (!SHOPPING_UNITS.includes(unit)) {
      return c.json({ error: "unit non valida" }, 400);
    }
    const now = new Date().toISOString();
    const audit: AuditEntry[] = [{ action: "added", at: now, by: body.addedBy ?? null }];
    const row: ShoppingItemRow = {
      id: randomUUID(),
      name: body.name.trim(),
      quantity: body.quantity ?? "1",
      unit,
      category,
      completed: false,
      addedAt: now,
      addedBy: body.addedBy ?? null,
      auditLog: JSON.stringify(audit),
    };
    db.insert(shoppingItems).values(row).run();
    return c.json(rowToItem(row), 201);
  })

  /* ----- update ----- */
  .patch("/items/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(shoppingItems).where(eq(shoppingItems.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdateShoppingItemInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }
    const updates: Partial<ShoppingItemRow> = {};
    const diff: Record<string, [unknown, unknown]> = {};

    if (body.name !== undefined && body.name !== existing.name) {
      if (body.name.trim().length === 0) {
        return c.json({ error: "name non può essere vuoto" }, 400);
      }
      updates.name = body.name.trim();
      diff.name = [existing.name, updates.name];
    }
    if (body.quantity !== undefined && body.quantity !== existing.quantity) {
      updates.quantity = body.quantity;
      diff.quantity = [existing.quantity, body.quantity];
    }
    if (body.unit !== undefined && body.unit !== existing.unit) {
      if (!SHOPPING_UNITS.includes(body.unit)) {
        return c.json({ error: "unit non valida" }, 400);
      }
      updates.unit = body.unit;
      diff.unit = [existing.unit, body.unit];
    }
    if (body.category !== undefined && body.category !== existing.category) {
      if (!SHOPPING_CATEGORIES.includes(body.category)) {
        return c.json({ error: "category non valida" }, 400);
      }
      updates.category = body.category;
      diff.category = [existing.category, body.category];
    }

    let auditAction: AuditEntry["action"] | null = null;
    if (body.completed !== undefined && body.completed !== existing.completed) {
      updates.completed = body.completed;
      auditAction = body.completed ? "completed" : "uncompleted";
    } else if (Object.keys(diff).length > 0) {
      auditAction = "updated";
    }

    if (auditAction) {
      const log = JSON.parse(existing.auditLog) as AuditEntry[];
      const entry: AuditEntry = {
        action: auditAction,
        at: new Date().toISOString(),
        by: null,
        ...(Object.keys(diff).length > 0 ? { diff } : {}),
      };
      updates.auditLog = JSON.stringify(pushAudit(log, entry));
    }

    if (Object.keys(updates).length === 0) {
      return c.json(rowToItem(existing));
    }

    db.update(shoppingItems).set(updates).where(eq(shoppingItems.id, id)).run();

    const updated = db.select().from(shoppingItems).where(eq(shoppingItems.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToItem(updated));
  })

  /* ----- delete ----- */
  .delete("/items/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(shoppingItems).where(eq(shoppingItems.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ----- voice-ready: by-name ----- */
  .post("/items/by-name", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      name: string;
      addedBy?: string | null;
    } | null;
    if (!body?.name?.trim()) {
      return c.json({ error: "name obbligatorio" }, 400);
    }
    const products = db.select().from(productCatalog).all();
    const product = findByName(body.name, products);

    const now = new Date().toISOString();
    const finalName = product?.name ?? body.name.trim();
    const category = (product?.category ?? "other") as ShoppingCategory;
    const unit = (product?.defaultUnit ?? "pz") as ShoppingUnit;

    const audit: AuditEntry[] = [{ action: "added", at: now, by: body.addedBy ?? null }];
    const row: ShoppingItemRow = {
      id: randomUUID(),
      name: finalName,
      quantity: "1",
      unit,
      category,
      completed: false,
      addedAt: now,
      addedBy: body.addedBy ?? null,
      auditLog: JSON.stringify(audit),
    };
    db.insert(shoppingItems).values(row).run();
    return c.json(rowToItem(row), 201);
  })
  .post("/items/complete-by-name", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { name: string } | null;
    if (!body?.name?.trim()) {
      return c.json({ error: "name obbligatorio" }, 400);
    }
    const activeRows = db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.completed, false))
      .all();
    const match = findByName(body.name, activeRows);
    if (!match) {
      return c.json({ error: `Nessun '${body.name}' nella lista` }, 404);
    }
    const log = JSON.parse(match.auditLog) as AuditEntry[];
    db.update(shoppingItems)
      .set({
        completed: true,
        auditLog: JSON.stringify(
          pushAudit(log, {
            action: "completed",
            at: new Date().toISOString(),
            by: null,
          }),
        ),
      })
      .where(eq(shoppingItems.id, match.id))
      .run();
    const updated = db.select().from(shoppingItems).where(eq(shoppingItems.id, match.id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToItem(updated));
  })
  .delete("/items/by-name", (c) => {
    const name = c.req.query("name") ?? "";
    if (!name.trim()) {
      return c.json({ error: "name obbligatorio" }, 400);
    }
    const activeRows = db
      .select()
      .from(shoppingItems)
      .where(eq(shoppingItems.completed, false))
      .all();
    const match = findByName(name, activeRows);
    if (!match) {
      return c.json({ error: `Nessun '${name}' nella lista` }, 404);
    }
    db.delete(shoppingItems).where(eq(shoppingItems.id, match.id)).run();
    return c.body(null, 204);
  });

// Suppress unused import lint (and is used by drizzle's where chaining; kept for future)
void and;
