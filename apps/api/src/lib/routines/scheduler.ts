/**
 * Routines scheduler.
 *
 * Ticks once per minute (aligned to the wall clock) and fires every enabled
 * time/cron routine whose trigger matches the current minute in the
 * configured zone (default Europe/Rome). Manual and voice triggers are
 * ignored here — they only run on user action.
 *
 * Time/cron matching always runs against the configured zone, not the
 * Node process zone — Alpine containers default to UTC and we don't want
 * the scheduler to fire two hours late in CEST.
 *
 * Firings are deduplicated per minute via an in-memory `Set`: if the tick is
 * slow or runs twice in the same minute (clock adjustments, CPU contention)
 * we avoid running the same routine twice.
 */

import { and, eq, ne } from "drizzle-orm";
import { db } from "../../db/client.js";
import { routines } from "../../db/schema.js";
import { runRoutineById } from "./runner.js";
import {
  formatZoned,
  getRoutineTimezone,
  getZonedFields,
  matchCronTrigger,
  matchTimeTrigger,
  nextFireAt,
} from "./time.js";
import { parseTrigger } from "./validation.js";

let intervalHandle: NodeJS.Timeout | null = null;
let firedThisMinute = new Set<string>();
let lastMinuteKey = "";

export function startRoutinesScheduler(): () => void {
  if (intervalHandle) return () => {};

  const tz = getRoutineTimezone();
  console.log(`[routines] scheduler started — timezone=${tz}`);
  logEnabledRoutines(tz);

  const run = () => {
    try {
      tick(tz);
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

function logEnabledRoutines(tz: string): void {
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

  console.log(`[routines] ${rows.length} time/cron routine abilitate al boot`);
  const now = new Date();
  for (const row of rows) {
    try {
      const trigger = parseTrigger(row.triggerType, row.triggerConfig);
      const next = nextFireAt(trigger, now, tz);
      const nextStr = next ? formatZoned(next, tz) : "—";
      const desc =
        trigger.type === "time"
          ? `time ${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")} dow=[${trigger.daysOfWeek.join(",") || "*"}]`
          : trigger.type === "cron"
            ? `cron "${trigger.expr}"`
            : trigger.type;
      console.log(`[routines]   "${row.name}" (${row.id}) ${desc} → next-fire-at=${nextStr}`);
    } catch (err) {
      console.error(`[routines]   "${row.name}" (${row.id}) trigger malformato:`, err);
    }
  }
}

function tick(tz: string): void {
  const now = new Date();
  const zoned = getZonedFields(now, tz);
  const minuteKey = `${zoned.year}-${zoned.month}-${zoned.day}-${zoned.hour}-${zoned.minute}`;
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
      if (trigger.type === "time") shouldFire = matchTimeTrigger(trigger, zoned);
      else if (trigger.type === "cron") shouldFire = matchCronTrigger(trigger, zoned);
    } catch (err) {
      console.error(`[routines] trigger malformato per ${row.id}:`, err);
      continue;
    }
    if (!shouldFire) continue;
    firedThisMinute.add(row.id);

    /* Compute the *next* fire after this one for the log line, so the
     * operator can sanity-check the cadence without scraping the boot dump. */
    let nextStr = "—";
    try {
      const trigger = parseTrigger(row.triggerType, row.triggerConfig);
      const next = nextFireAt(trigger, now, tz);
      if (next) nextStr = formatZoned(next, tz);
    } catch {
      /* Already logged above. */
    }
    console.log(`[routines] FIRED "${row.name}" (${row.id}) — next=${nextStr}`);

    void runRoutineById(row.id, { emitSse: true }).catch((err) => {
      console.error(`[routines] fire failed for ${row.id}:`, err);
    });
  }
}
