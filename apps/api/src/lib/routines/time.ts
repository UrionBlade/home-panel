/**
 * Timezone helpers for the routines scheduler.
 *
 * The API container runs in UTC by default (Alpine), but routines are
 * configured by the user in their local time ("alle 2 di notte" means
 * 02:00 Europe/Rome). Comparing `now.getHours()` against the trigger would
 * fire two hours late in CEST. We avoid that by always evaluating triggers
 * against the configured zone (default Europe/Rome) via Intl.DateTimeFormat.
 */

import type { RoutineTrigger, RoutineTriggerCron, RoutineTriggerTime } from "@home-panel/shared";

export interface ZonedFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday, 6 = Saturday — matches Date.prototype.getDay() semantics. */
  dayOfWeek: number;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const fieldFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFieldFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = fieldFormatterCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    fieldFormatterCache.set(tz, fmt);
  }
  return fmt;
}

export function getZonedFields(date: Date, tz: string): ZonedFields {
  const parts = getFieldFormatter(tz).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") lookup[p.type] = p.value;
  }
  /* en-US returns hour=24 at midnight under hour12:false in some node
   * versions; clamp to 0 so downstream comparisons stay correct. */
  const rawHour = Number(lookup.hour ?? "0");
  return {
    year: Number(lookup.year ?? "0"),
    month: Number(lookup.month ?? "0"),
    day: Number(lookup.day ?? "0"),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(lookup.minute ?? "0"),
    dayOfWeek: WEEKDAY_TO_INDEX[lookup.weekday ?? "Sun"] ?? 0,
  };
}

/** Default zone used by the routines scheduler. Overridable via env so a
 * non-Italian deployment can switch without touching code. */
export function getRoutineTimezone(): string {
  return process.env.ROUTINE_TIMEZONE ?? "Europe/Rome";
}

export function matchTimeTrigger(trigger: RoutineTriggerTime, zoned: ZonedFields): boolean {
  if (trigger.hour !== zoned.hour) return false;
  if (trigger.minute !== zoned.minute) return false;
  if (trigger.daysOfWeek.length > 0 && !trigger.daysOfWeek.includes(zoned.dayOfWeek)) return false;
  return true;
}

export function matchCronTrigger(trigger: RoutineTriggerCron, zoned: ZonedFields): boolean {
  const parts = trigger.expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  return (
    matchField(m, zoned.minute, 0, 59) &&
    matchField(h, zoned.hour, 0, 23) &&
    matchField(dom, zoned.day, 1, 31) &&
    matchField(mon, zoned.month, 1, 12) &&
    matchField(dow, zoned.dayOfWeek, 0, 6)
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

/**
 * Compute the next firing time for a trigger.
 *
 * Naive walk one minute at a time up to `maxLookaheadMinutes` ahead. Cheap
 * enough for boot-time logging (~once per process) and for ad-hoc API
 * exposure. Returns null when no match is found within the window — that
 * would only happen for malformed cron expressions or `daysOfWeek=[]` on a
 * time trigger that never gets evaluated as fireable.
 */
export function nextFireAt(
  trigger: RoutineTrigger,
  from: Date,
  tz: string,
  maxLookaheadMinutes = 60 * 24 * 366,
): Date | null {
  if (trigger.type !== "time" && trigger.type !== "cron") return null;

  /* Round up to the next minute boundary so we never report "now" as the
   * next fire even if `from` happens to land on an exact match. */
  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  for (let i = 0; i < maxLookaheadMinutes; i += 1) {
    const candidate = new Date(start.getTime() + i * 60_000);
    const zoned = getZonedFields(candidate, tz);
    const ok =
      trigger.type === "time" ? matchTimeTrigger(trigger, zoned) : matchCronTrigger(trigger, zoned);
    if (ok) return candidate;
  }
  return null;
}

/** Format an instant in the configured zone for log output. Example:
 * `2026-04-27 02:00 Europe/Rome`. */
export function formatZoned(date: Date, tz: string): string {
  const z = getZonedFields(date, tz);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${z.year}-${pad(z.month)}-${pad(z.day)} ${pad(z.hour)}:${pad(z.minute)} ${tz}`;
}
