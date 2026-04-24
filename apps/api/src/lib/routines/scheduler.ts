/**
 * Routines scheduler.
 *
 * Ticks once per minute (aligned to the wall clock) and fires every enabled
 * time/cron routine whose trigger matches the current minute. Manual and
 * voice triggers are ignored here — they only run on user action.
 *
 * Firings are deduplicated per minute via an in-memory `Set`: if the tick is
 * slow or runs twice in the same minute (clock adjustments, CPU contention)
 * we avoid running the same routine twice.
 */

import type { RoutineTriggerCron, RoutineTriggerTime } from "@home-panel/shared";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db/client.js";
import { routines } from "../../db/schema.js";
import { runRoutineById } from "./runner.js";
import { parseTrigger } from "./validation.js";

let intervalHandle: NodeJS.Timeout | null = null;
let firedThisMinute = new Set<string>();
let lastMinuteKey = "";

export function startRoutinesScheduler(): () => void {
  if (intervalHandle) return () => {};

  const run = () => {
    try {
      tick();
    } catch (err) {
      console.error("[routines] scheduler tick error:", err);
    }
  };
  /* Wake every 15s so we never miss a minute boundary even if a tick is
   * delayed by GC or a long internal call. The dedup set makes duplicate
   * checks in the same minute cheap. */
  run();
  intervalHandle = setInterval(run, 15_000);
  return () => {
    if (intervalHandle) clearInterval(intervalHandle);
    intervalHandle = null;
    firedThisMinute.clear();
  };
}

function tick(): void {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  if (minuteKey !== lastMinuteKey) {
    firedThisMinute = new Set();
    lastMinuteKey = minuteKey;
  }

  /* Only time/cron rows can be fired by the scheduler. Voice and manual are
   * skipped entirely at the query level. */
  const rows = db
    .select()
    .from(routines)
    .where(
      and(
        eq(routines.enabled, true),
        ne(routines.triggerType, "voice"),
        ne(routines.triggerType, "manual"),
      ),
    )
    .all();

  for (const row of rows) {
    if (firedThisMinute.has(row.id)) continue;
    let shouldFire = false;
    try {
      const trigger = parseTrigger(row.triggerType, row.triggerConfig);
      if (trigger.type === "time") shouldFire = matchTime(trigger, now);
      else if (trigger.type === "cron") shouldFire = matchCron(trigger, now);
    } catch (err) {
      console.warn(`[routines] trigger malformato per ${row.id}:`, err);
      continue;
    }
    if (!shouldFire) continue;
    firedThisMinute.add(row.id);

    void runRoutineById(row.id, { emitSse: true }).catch((err) => {
      console.error(`[routines] fire failed for ${row.id}:`, err);
    });
  }
}

function matchTime(trigger: RoutineTriggerTime, now: Date): boolean {
  if (trigger.hour !== now.getHours()) return false;
  if (trigger.minute !== now.getMinutes()) return false;
  if (trigger.daysOfWeek.length > 0 && !trigger.daysOfWeek.includes(now.getDay())) return false;
  return true;
}

// Minimal cron matcher covering the grammar accepted by `isValidCron`.
// Fields: minute(0-59) hour(0-23) dom(1-31) month(1-12) dow(0-6). Supports
// `<asterisk>`, step (`<asterisk>/n`), integer, ranges and comma lists.
function matchCron(trigger: RoutineTriggerCron, now: Date): boolean {
  const parts = trigger.expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  return (
    matchField(m, now.getMinutes(), 0, 59) &&
    matchField(h, now.getHours(), 0, 23) &&
    matchField(dom, now.getDate(), 1, 31) &&
    matchField(mon, now.getMonth() + 1, 1, 12) &&
    matchField(dow, now.getDay(), 0, 6)
  );
}

function matchField(expr: string, value: number, min: number, max: number): boolean {
  if (expr === "*") return true;
  if (expr.startsWith("*/")) {
    const step = Number(expr.slice(2));
    if (!Number.isFinite(step) || step <= 0) return false;
    return (value - min) % step === 0;
  }
  for (const chunk of expr.split(",")) {
    if (chunk.includes("-")) {
      const [rawA, rawB] = chunk.split("-");
      const a = Number(rawA);
      const b = Number(rawB);
      if (Number.isFinite(a) && Number.isFinite(b) && value >= a && value <= b) return true;
    } else {
      const n = Number(chunk);
      if (Number.isFinite(n) && n === value) return true;
    }
    void max;
  }
  return false;
}
