import type { WasteRulePattern } from "@home-panel/shared";

/**
 * Espande un pattern waste rule in date concrete (YYYY-MM-DD) dentro [from, to].
 * Tutte le date sono in UTC, semplice giorno-base senza orari.
 */
export function expandWastePattern(pattern: WasteRulePattern, from: Date, to: Date): string[] {
  const out = new Set<string>();
  const anchor = new Date(`${pattern.anchorDate}T00:00:00Z`);
  const endsOn = pattern.endsOn ? new Date(`${pattern.endsOn}T23:59:59Z`) : null;

  const startScan = new Date(Math.max(from.getTime(), anchor.getTime()));
  startScan.setUTCHours(0, 0, 0, 0);

  const stop = endsOn ? new Date(Math.min(to.getTime(), endsOn.getTime())) : to;
  stop.setUTCHours(23, 59, 59, 999);

  let safety = 0;
  const SAFETY = 5000;

  switch (pattern.freq) {
    case "weekly": {
      const interval = pattern.interval ?? 1;
      const weekdays = pattern.byWeekday ?? [anchor.getUTCDay()];
      // Determina settimana dell'anchor (epoch in settimane semplici)
      const cursor = new Date(startScan);
      while (cursor <= stop && safety++ < SAFETY) {
        const weeksFromAnchor = Math.floor(
          (cursor.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000),
        );
        if (
          weeksFromAnchor >= 0 &&
          weeksFromAnchor % interval === 0 &&
          weekdays.includes(cursor.getUTCDay()) &&
          cursor >= anchor
        ) {
          out.add(toIsoDate(cursor));
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      break;
    }
    case "every-n-days": {
      const interval = pattern.interval ?? 1;
      const cursor = new Date(anchor);
      while (cursor <= stop && safety++ < SAFETY) {
        if (cursor >= startScan) {
          out.add(toIsoDate(cursor));
        }
        cursor.setUTCDate(cursor.getUTCDate() + interval);
      }
      break;
    }
    case "monthly": {
      const interval = pattern.interval ?? 1;
      const cursor = new Date(anchor);
      while (cursor <= stop && safety++ < SAFETY) {
        if (cursor >= startScan) {
          out.add(toIsoDate(cursor));
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + interval);
      }
      break;
    }
  }

  return Array.from(out).sort();
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
