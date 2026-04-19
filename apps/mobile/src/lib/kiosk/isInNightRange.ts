/**
 * Checks whether the current hour falls within the night range.
 * Correctly handles ranges that cross midnight
 * (e.g. start=22, end=7 → true for hours 22-23 and 0-6).
 */
export function isInNightRange(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // Cross-midnight: e.g. 22 → 7
  return hour >= start || hour < end;
}
