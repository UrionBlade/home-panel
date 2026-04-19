/**
 * Helper data senza dipendenze esterne (date-fns rimosso, troppo grande).
 * Tutto in italiano locale, UTC-safe.
 */

const DAYS_LONG = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const DAYS_SHORT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS_LONG = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

export function dayLabelLong(d: Date): string {
  return DAYS_LONG[d.getDay()] ?? "";
}

export function dayLabelShort(d: Date): string {
  return DAYS_SHORT[d.getDay()] ?? "";
}

export function monthLabel(d: Date): string {
  return MONTHS_LONG[d.getMonth()] ?? "";
}

export function formatLongDate(d: Date): string {
  return `${dayLabelLong(d)} ${d.getDate()} ${monthLabel(d)}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/**
 * Restituisce la griglia 6 settimane di un mese.
 * Inizia dalla prima domenica visibile (anche del mese precedente).
 */
export function monthGrid(d: Date): Date[][] {
  const first = startOfMonth(d);
  const startDayOfWeek = first.getDay();
  const start = addDays(first, -startDayOfWeek);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(addDays(start, w * 7 + i));
    }
    weeks.push(week);
  }
  return weeks;
}

export function isoDate(d: Date): string {
  // YYYY-MM-DD
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoDateTime(d: Date): string {
  return d.toISOString();
}
