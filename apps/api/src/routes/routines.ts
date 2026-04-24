/**
 * Routines — CRUD + manual run endpoint.
 *
 * Storage lives in the `routines` table; trigger config and steps are JSON
 * blobs validated on read and on write. The runner is shared with the
 * scheduler so a "Run now" from the UI and a scheduled fire walk the same
 * code path.
 */

import { randomUUID } from "node:crypto";
import type {
  Routine,
  RoutineCreateInput,
  RoutineRunResult,
  RoutineStep,
  RoutineTrigger,
  RoutineUpdateInput,
  RoutineVoiceTrigger,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type RoutineRow, routines } from "../db/schema.js";
import { runRoutineById } from "../lib/routines/runner.js";
import {
  isValidStep,
  isValidTrigger,
  parseSteps,
  parseTrigger,
} from "../lib/routines/validation.js";

function rowToRoutine(row: RoutineRow): Routine {
  const trigger = parseTrigger(row.triggerType, row.triggerConfig);
  const steps = parseSteps(row.steps);
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    enabled: row.enabled,
    trigger,
    voiceResponse: row.voiceResponse,
    steps,
    lastRunAt: row.lastRunAt,
    lastRunStatus: row.lastRunStatus,
    lastRunError: row.lastRunError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateCreateBody(body: unknown): RoutineCreateInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body JSON obbligatorio" };
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || !b.name.trim()) return { error: "name richiesto" };
  if (b.name.length > 80) return { error: "name max 80 caratteri" };
  if (!b.trigger || typeof b.trigger !== "object") return { error: "trigger richiesto" };
  const triggerCheck = isValidTrigger(b.trigger as RoutineTrigger);
  if (!triggerCheck.ok) return { error: `trigger: ${triggerCheck.error}` };
  if (!Array.isArray(b.steps)) return { error: "steps deve essere un array" };
  if (b.steps.length === 0) return { error: "almeno uno step richiesto" };
  if (b.steps.length > 50) return { error: "max 50 step per routine" };
  for (let i = 0; i < b.steps.length; i += 1) {
    const stepCheck = isValidStep(b.steps[i] as RoutineStep);
    if (!stepCheck.ok) return { error: `step ${i}: ${stepCheck.error}` };
  }
  return {
    name: b.name.trim(),
    icon: typeof b.icon === "string" ? b.icon : null,
    color: typeof b.color === "string" ? b.color : null,
    enabled: b.enabled !== false,
    trigger: b.trigger as RoutineTrigger,
    voiceResponse: typeof b.voiceResponse === "string" ? b.voiceResponse : null,
    steps: b.steps as RoutineStep[],
  };
}

export const routinesRouter = new Hono()
  /* List all routines (enabled + disabled). */
  .get("/", (c) => {
    const rows = db.select().from(routines).all();
    const body: Routine[] = rows.map(rowToRoutine);
    return c.json(body);
  })

  /* Subset exposed to the voice parser — only voice-triggered, enabled rows. */
  .get("/voice-triggers", (c) => {
    const rows = db.select().from(routines).where(eq(routines.enabled, true)).all();
    const body: RoutineVoiceTrigger[] = [];
    for (const row of rows) {
      if (row.triggerType !== "voice") continue;
      try {
        const trigger = parseTrigger(row.triggerType, row.triggerConfig);
        if (trigger.type !== "voice") continue;
        const phrases = trigger.phrases.filter((p) => p.trim().length > 0);
        if (phrases.length === 0) continue;
        body.push({ routineId: row.id, name: row.name, phrases });
      } catch {
        /* Malformed trigger_config — skip instead of failing the whole call. */
      }
    }
    return c.json(body);
  })

  .get("/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(routines).where(eq(routines.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(rowToRoutine(row));
  })

  .post("/", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = validateCreateBody(raw);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const now = new Date().toISOString();
    const id = randomUUID();
    const row: RoutineRow = {
      id,
      name: parsed.name,
      icon: parsed.icon ?? null,
      color: parsed.color ?? null,
      enabled: parsed.enabled ?? true,
      triggerType: parsed.trigger.type,
      triggerConfig: JSON.stringify(stripType(parsed.trigger)),
      voiceResponse: parsed.voiceResponse ?? null,
      steps: JSON.stringify(parsed.steps),
      lastRunAt: null,
      lastRunStatus: null,
      lastRunError: null,
      createdAt: now,
      updatedAt: now,
    };
    db.insert(routines).values(row).run();
    return c.json(rowToRoutine(row), 201);
  })

  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(routines).where(eq(routines.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const raw = (await c.req.json().catch(() => null)) as RoutineUpdateInput | null;
    if (!raw || typeof raw !== "object") return c.json({ error: "Body JSON obbligatorio" }, 400);

    const updates: Partial<RoutineRow> = { updatedAt: new Date().toISOString() };

    if (raw.name !== undefined) {
      const name = raw.name.trim();
      if (!name || name.length > 80) return c.json({ error: "name 1-80 caratteri" }, 400);
      updates.name = name;
    }
    if (raw.icon !== undefined) updates.icon = raw.icon ?? null;
    if (raw.color !== undefined) updates.color = raw.color ?? null;
    if (raw.enabled !== undefined) updates.enabled = Boolean(raw.enabled);
    if (raw.voiceResponse !== undefined) updates.voiceResponse = raw.voiceResponse ?? null;
    if (raw.trigger !== undefined) {
      const check = isValidTrigger(raw.trigger);
      if (!check.ok) return c.json({ error: `trigger: ${check.error}` }, 400);
      updates.triggerType = raw.trigger.type;
      updates.triggerConfig = JSON.stringify(stripType(raw.trigger));
    }
    if (raw.steps !== undefined) {
      if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
        return c.json({ error: "steps deve essere array non vuoto" }, 400);
      }
      if (raw.steps.length > 50) return c.json({ error: "max 50 step per routine" }, 400);
      for (let i = 0; i < raw.steps.length; i += 1) {
        const check = isValidStep(raw.steps[i]);
        if (!check.ok) return c.json({ error: `step ${i}: ${check.error}` }, 400);
      }
      updates.steps = JSON.stringify(raw.steps);
    }

    db.update(routines).set(updates).where(eq(routines.id, id)).run();
    const row = db.select().from(routines).where(eq(routines.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(rowToRoutine(row));
  })

  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(routines).where(eq(routines.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);
    db.delete(routines).where(eq(routines.id, id)).run();
    return c.body(null, 204);
  })

  /* Manual run — used by the "Run now" button in the UI and by the voice
   * client after matching a custom phrase. Returns `clientActions` the caller
   * is responsible for playing. */
  .post("/:id/run", async (c) => {
    const id = c.req.param("id");
    try {
      const result: RoutineRunResult = await runRoutineById(id, { emitSse: false });
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore esecuzione routine";
      if (msg === "not_found") return c.json({ error: "not_found" }, 404);
      console.error("[routines] run error:", err);
      return c.json({ error: msg }, 500);
    }
  });

// ---------- Helpers ----------

/** Strip `type` from trigger before persisting — it's already the row column
 * `trigger_type`, no point duplicating it in the JSON blob. */
function stripType(trigger: RoutineTrigger): Omit<RoutineTrigger, "type"> | Record<string, never> {
  const { type: _discard, ...rest } = trigger as RoutineTrigger & { type: string };
  void _discard;
  return rest as Omit<RoutineTrigger, "type">;
}
