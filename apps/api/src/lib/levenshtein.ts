/**
 * Distanza di Levenshtein iterativa con due righe.
 * Usata per il fuzzy matching by-name.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const al = a.length;
  const bl = b.length;
  let prev = Array.from({ length: bl + 1 }, (_, i) => i);
  let curr = Array.from({ length: bl + 1 }, () => 0);

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const insertCost = (curr[j - 1] ?? 0) + 1;
      const deleteCost = (prev[j] ?? 0) + 1;
      const replaceCost = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(insertCost, deleteCost, replaceCost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[bl] ?? 0;
}
