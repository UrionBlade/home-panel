import { randomUUID } from "node:crypto";
import type {
  Alarm,
  CreateAlarmInput,
  CreateTimerInput,
  Timer,
  UpdateAlarmInput,
} from "@home-panel/shared";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type AlarmRow, alarms } from "../db/schema.js";
import { sseEmitter } from "./sse.js";

/* ─────────────────────── In-memory timer state ─────────────────────── */

interface TimerState {
  id: string;
  label: string | null;
  durationMs: number;
  /** Accumulated elapsed ms BEFORE current run segment */
  elapsedMs: number;
  /** When the timer last started/resumed (null if paused) */
  startedAt: number | null;
  status: "running" | "paused" | "finished";
  createdAt: string;
  finishedAt: string | null;
}

const timers = new Map<string, TimerState>();

function computeRemaining(t: TimerState): number {
  if (t.status === "finished") return 0;
  const elapsed = t.elapsedMs + (t.startedAt ? Date.now() - t.startedAt : 0);
  return Math.max(0, Math.ceil((t.durationMs - elapsed) / 1000));
}

function toTimer(t: TimerState): Timer {
  return {
    id: t.id,
    label: t.label,
    durationSeconds: Math.ceil(t.durationMs / 1000),
    remainingSeconds: computeRemaining(t),
    status: t.status,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt,
  };
}

/* Background check: ogni secondo verifica timer scaduti */
setInterval(() => {
  for (const t of timers.values()) {
    if (t.status !== "running") continue;
    if (computeRemaining(t) <= 0) {
      t.status = "finished";
      t.finishedAt = new Date().toISOString();
      t.startedAt = null;
      sseEmitter.emit("push", {
        event: "timer:finished",
        payload: toTimer(t),
      });
    }
  }
}, 1000);

/* Background check: ogni 30s controlla se un alarm deve scattare */
const firedAlarms = new Set<string>();
setInterval(() => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const dow = now.getDay(); // 0=dom

  const rows = db.select().from(alarms).all();
  for (const row of rows) {
    if (!row.enabled) continue;
    if (row.hour !== h || row.minute !== m) continue;

    const days: number[] = JSON.parse(row.daysOfWeek);
    if (days.length > 0 && !days.includes(dow)) continue;

    // Evita di sparare più volte nello stesso minuto
    const key = `${row.id}:${h}:${m}`;
    if (firedAlarms.has(key)) continue;
    firedAlarms.add(key);
    // Pulisci dopo 2 min
    setTimeout(() => firedAlarms.delete(key), 120_000);

    const alarm = rowToAlarm(row);
    sseEmitter.emit("push", {
      event: "alarm:fired",
      payload: alarm,
    });

    // One-shot: disabilita dopo lo scatto
    if (days.length === 0) {
      db.update(alarms).set({ enabled: false }).where(eq(alarms.id, row.id)).run();
    }
  }
}, 30_000);

/* ─────────────────────── Alarm helpers ─────────────────────── */

function rowToAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    label: row.label,
    hour: row.hour,
    minute: row.minute,
    daysOfWeek: JSON.parse(row.daysOfWeek),
    enabled: row.enabled,
    sound: row.sound,
    createdAt: row.createdAt,
  };
}

/* ─────────────────────── Router ─────────────────────── */

export const timersRouter = new Hono()
  /* ── Timer CRUD ── */
  .get("/timers", (c) => {
    const list: Timer[] = [];
    for (const t of timers.values()) {
      list.push(toTimer(t));
    }
    // Ordina: running first, poi paused, poi finished, poi per remaining desc
    list.sort((a, b) => {
      const order = { running: 0, paused: 1, finished: 2 };
      const d = order[a.status] - order[b.status];
      if (d !== 0) return d;
      return b.remainingSeconds - a.remainingSeconds;
    });
    return c.json(list);
  })

  .post("/timers", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateTimerInput | null;
    if (!body || typeof body.durationSeconds !== "number" || body.durationSeconds <= 0) {
      return c.json({ error: "durationSeconds obbligatorio e > 0" }, 400);
    }
    const id = randomUUID();
    const state: TimerState = {
      id,
      label: body.label ?? null,
      durationMs: body.durationSeconds * 1000,
      elapsedMs: 0,
      startedAt: Date.now(),
      status: "running",
      createdAt: new Date().toISOString(),
      finishedAt: null,
    };
    timers.set(id, state);
    return c.json(toTimer(state), 201);
  })

  .post("/timers/:id/pause", (c) => {
    const t = timers.get(c.req.param("id"));
    if (!t) return c.json({ error: "not_found" }, 404);
    if (t.status !== "running") return c.json({ error: "Timer non in esecuzione" }, 400);
    // Accumula elapsed
    t.elapsedMs += Date.now() - (t.startedAt ?? Date.now());
    t.startedAt = null;
    t.status = "paused";
    return c.json(toTimer(t));
  })

  .post("/timers/:id/resume", (c) => {
    const t = timers.get(c.req.param("id"));
    if (!t) return c.json({ error: "not_found" }, 404);
    if (t.status !== "paused") return c.json({ error: "Timer non in pausa" }, 400);
    t.startedAt = Date.now();
    t.status = "running";
    return c.json(toTimer(t));
  })

  .post("/timers/:id/add-time", (c) => {
    const t = timers.get(c.req.param("id"));
    if (!t) return c.json({ error: "not_found" }, 404);
    t.durationMs += 60_000;
    if (t.status === "finished") {
      t.status = "running";
      t.finishedAt = null;
      t.startedAt = Date.now();
      // Reset elapsed to durationMs - 60s (so we have 60s remaining)
      t.elapsedMs = t.durationMs - 60_000;
    }
    return c.json(toTimer(t));
  })

  .delete("/timers/:id", (c) => {
    const id = c.req.param("id");
    if (!timers.has(id)) return c.json({ error: "not_found" }, 404);
    timers.delete(id);
    return c.body(null, 204);
  })

  /* ── Alarm CRUD ── */
  .get("/alarms", (c) => {
    const rows = db.select().from(alarms).orderBy(asc(alarms.hour), asc(alarms.minute)).all();
    return c.json(rows.map(rowToAlarm));
  })

  .post("/alarms", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateAlarmInput | null;
    if (!body?.label?.trim()) {
      return c.json({ error: "label obbligatorio" }, 400);
    }
    if (typeof body.hour !== "number" || body.hour < 0 || body.hour > 23) {
      return c.json({ error: "hour deve essere 0-23" }, 400);
    }
    if (typeof body.minute !== "number" || body.minute < 0 || body.minute > 59) {
      return c.json({ error: "minute deve essere 0-59" }, 400);
    }
    const id = randomUUID();
    const row: AlarmRow = {
      id,
      label: body.label.trim(),
      hour: body.hour,
      minute: body.minute,
      daysOfWeek: JSON.stringify(body.daysOfWeek ?? []),
      enabled: true,
      sound: body.sound ?? "default",
      createdAt: new Date().toISOString(),
    };
    db.insert(alarms).values(row).run();
    return c.json(rowToAlarm(row), 201);
  })

  .patch("/alarms/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(alarms).where(eq(alarms.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdateAlarmInput | null;
    if (!body) return c.json({ error: "Body JSON obbligatorio" }, 400);

    const updates: Partial<AlarmRow> = {};
    if (body.label !== undefined) updates.label = body.label.trim();
    if (body.hour !== undefined) updates.hour = body.hour;
    if (body.minute !== undefined) updates.minute = body.minute;
    if (body.daysOfWeek !== undefined) updates.daysOfWeek = JSON.stringify(body.daysOfWeek);
    if (body.enabled !== undefined) updates.enabled = body.enabled;
    if (body.sound !== undefined) updates.sound = body.sound;

    if (Object.keys(updates).length === 0) {
      return c.json(rowToAlarm(existing));
    }

    db.update(alarms).set(updates).where(eq(alarms.id, id)).run();
    const updated = db.select().from(alarms).where(eq(alarms.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToAlarm(updated));
  })

  .delete("/alarms/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(alarms).where(eq(alarms.id, id)).run();
    if (result.changes === 0) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  })

  .get("/alarms/next", (c) => {
    const rows = db.select().from(alarms).where(eq(alarms.enabled, true)).all();

    if (rows.length === 0) return c.json(null);

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nowDow = now.getDay();

    let best: AlarmRow | null = null;
    let bestDelta = Infinity;

    for (const row of rows) {
      const alarmMinutes = row.hour * 60 + row.minute;
      const days: number[] = JSON.parse(row.daysOfWeek);

      if (days.length === 0) {
        // One-shot: calcola quanti minuti mancano
        let delta = alarmMinutes - nowMinutes;
        if (delta <= 0) delta += 24 * 60;
        if (delta < bestDelta) {
          bestDelta = delta;
          best = row;
        }
      } else {
        // Ricorrente: trova il prossimo giorno
        for (let offset = 0; offset < 7; offset++) {
          const checkDow = (nowDow + offset) % 7;
          if (!days.includes(checkDow)) continue;
          const delta = offset * 24 * 60 + (alarmMinutes - nowMinutes);
          if (offset === 0 && alarmMinutes <= nowMinutes) continue;
          if (delta <= 0) continue;
          if (delta < bestDelta) {
            bestDelta = delta;
            best = row;
          }
          break;
        }
      }
    }

    return c.json(best ? rowToAlarm(best) : null);
  });
