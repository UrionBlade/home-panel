import type { RecurrenceRule } from "@home-panel/shared";

/**
 * Espande una singola serie ricorrente in date di occorrenza concrete dentro [from, to].
 * Subset semplice: daily, weekly (con byWeekday), monthly (con byMonthDay), yearly, every-n-days.
 *
 * DST-safe: advancing via setUTCDate keeps UTC offset fixed, which would shift
 * the local wall-clock time by ±1h across DST boundaries (CET ↔ CEST). We
 * re-align each pushed occurrence to the original startDate's local time so
 * "recurring at 17:00" stays at 17:00 local year-round.
 */
export function expandRecurrence(
  startDate: Date,
  rule: RecurrenceRule | null,
  from: Date,
  to: Date,
): Date[] {
  if (from > to) return [];

  if (!rule) {
    return startDate >= from && startDate <= to ? [new Date(startDate)] : [];
  }

  const out: Date[] = [];
  const endsOn = rule.endsOn ? new Date(`${rule.endsOn}T23:59:59.999Z`) : null;
  const maxCount = rule.count ?? Number.POSITIVE_INFINITY;

  let cursor = new Date(startDate);
  let counter = 0;
  let safety = 0;
  const SAFETY_LIMIT = 5000;

  const refHours = startDate.getHours();
  const refMinutes = startDate.getMinutes();
  const refSeconds = startDate.getSeconds();
  const refMs = startDate.getMilliseconds();

  function withOriginalLocalTime(d: Date): Date {
    const out = new Date(d);
    out.setHours(refHours, refMinutes, refSeconds, refMs);
    return out;
  }

  function isValid(d: Date): boolean {
    if (endsOn && d > endsOn) return false;
    if (counter >= maxCount) return false;
    return true;
  }

  function pushIfInRange(d: Date) {
    const aligned = withOriginalLocalTime(d);
    if (aligned >= from && aligned <= to) out.push(aligned);
  }

  switch (rule.freq) {
    case "daily": {
      const interval = rule.interval ?? 1;
      while (isValid(cursor) && safety++ < SAFETY_LIMIT) {
        if (cursor > to) break;
        pushIfInRange(cursor);
        counter++;
        cursor.setUTCDate(cursor.getUTCDate() + interval);
      }
      break;
    }
    case "every-n-days": {
      const interval = rule.interval ?? 1;
      while (isValid(cursor) && safety++ < SAFETY_LIMIT) {
        if (cursor > to) break;
        pushIfInRange(cursor);
        counter++;
        cursor.setUTCDate(cursor.getUTCDate() + interval);
      }
      break;
    }
    case "weekly": {
      const interval = rule.interval ?? 1;
      const weekdays = rule.byWeekday ?? [startDate.getUTCDay()];
      // Advance day by day, skip days not in the weekly interval
      // dell'intervallo settimanale.
      const startOfWeek = new Date(startDate);
      startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());

      while (cursor <= to && isValid(cursor) && safety++ < SAFETY_LIMIT) {
        const weeksFromStart = Math.floor(
          (cursor.getTime() - startOfWeek.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        if (
          weeksFromStart >= 0 &&
          weeksFromStart % interval === 0 &&
          weekdays.includes(cursor.getUTCDay()) &&
          cursor >= startDate
        ) {
          pushIfInRange(cursor);
          counter++;
          if (counter >= maxCount) break;
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      break;
    }
    case "monthly": {
      const interval = rule.interval ?? 1;
      const targetDay = rule.byMonthDay ?? startDate.getUTCDate();
      cursor = new Date(
        Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth(),
          targetDay,
          startDate.getUTCHours(),
          startDate.getUTCMinutes(),
          startDate.getUTCSeconds(),
        ),
      );
      while (isValid(cursor) && safety++ < SAFETY_LIMIT) {
        if (cursor > to) break;
        if (cursor >= startDate) {
          pushIfInRange(cursor);
          counter++;
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + interval);
      }
      break;
    }
    case "yearly": {
      const interval = rule.interval ?? 1;
      while (isValid(cursor) && safety++ < SAFETY_LIMIT) {
        if (cursor > to) break;
        pushIfInRange(cursor);
        counter++;
        cursor.setUTCFullYear(cursor.getUTCFullYear() + interval);
      }
      break;
    }
  }

  return out;
}
