/**
 * Converte una RRULE ICS (es. "FREQ=WEEKLY;INTERVAL=2;COUNT=10")
 * nel formato RecurrenceRule usato internamente dall'app.
 */
import type { RecurrenceRule } from "@home-panel/shared";

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

export function icsRruleToJson(rrule: string): RecurrenceRule | null {
  const parts = rrule.split(";");
  const map = new Map<string, string>();
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key && value) map.set(key.toUpperCase(), value);
  }

  const freq = map.get("FREQ");
  if (!freq) return null;

  let mappedFreq: RecurrenceRule["freq"];
  switch (freq) {
    case "DAILY":
      mappedFreq = "daily";
      break;
    case "WEEKLY":
      mappedFreq = "weekly";
      break;
    case "MONTHLY":
      mappedFreq = "monthly";
      break;
    case "YEARLY":
      mappedFreq = "yearly";
      break;
    default:
      return null;
  }

  const rule: RecurrenceRule = { freq: mappedFreq };

  const interval = map.get("INTERVAL");
  if (interval) {
    const n = Number.parseInt(interval, 10);
    if (!Number.isNaN(n) && n > 1) rule.interval = n;
  }

  const count = map.get("COUNT");
  if (count) {
    const n = Number.parseInt(count, 10);
    if (!Number.isNaN(n) && n > 0) rule.count = n;
  }

  const until = map.get("UNTIL");
  if (until) {
    // UNTIL can be DATE or DATETIME: extract date only
    const dateStr = until.slice(0, 8);
    if (/^\d{8}$/.test(dateStr)) {
      rule.endsOn = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
  }

  const byday = map.get("BYDAY");
  if (byday && mappedFreq === "weekly") {
    const days = byday.split(",").map((d) => DAY_MAP[d.trim().toUpperCase()]);
    const valid = days.filter((d): d is number => d !== undefined);
    if (valid.length > 0) rule.byWeekday = valid;
  }

  const bymonthday = map.get("BYMONTHDAY");
  if (bymonthday && mappedFreq === "monthly") {
    const n = Number.parseInt(bymonthday, 10);
    if (!Number.isNaN(n)) rule.byMonthDay = n;
  }

  return rule;
}
