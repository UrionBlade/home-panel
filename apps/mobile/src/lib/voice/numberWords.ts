/**
 * Italian (and ASCII digit) number words 0-100.
 *
 * Scope: enough coverage for TV volume (0-100). Splits the space into a
 * hardcoded dictionary + composition rules for compound forms ("ventiquattro").
 */

const UNITS: Record<string, number> = {
  zero: 0,
  uno: 1,
  un: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
};

const TEENS: Record<string, number> = {
  dieci: 10,
  undici: 11,
  dodici: 12,
  tredici: 13,
  quattordici: 14,
  quindici: 15,
  sedici: 16,
  diciassette: 17,
  diciotto: 18,
  diciannove: 19,
};

const TENS: Record<string, number> = {
  venti: 20,
  trenta: 30,
  quaranta: 40,
  cinquanta: 50,
  sessanta: 60,
  settanta: 70,
  ottanta: 80,
  novanta: 90,
};

const ROUND_EXTRA: Record<string, number> = {
  cento: 100,
};

const ALL = new Map<string, number>();
for (const [k, v] of Object.entries(UNITS)) ALL.set(k, v);
for (const [k, v] of Object.entries(TEENS)) ALL.set(k, v);
for (const [k, v] of Object.entries(TENS)) ALL.set(k, v);
for (const [k, v] of Object.entries(ROUND_EXTRA)) ALL.set(k, v);

const COMPOUND_ELISION: Record<string, string> = {
  ventu: "venti",
  trenta: "trenta",
};

/** Try to read a single Italian number word, including compounds. */
function readItalianWord(word: string): number | null {
  const normalized = word.replace(/['ʼ'`´]/g, "").toLowerCase();
  if (ALL.has(normalized)) return ALL.get(normalized) ?? null;

  /* Compound forms: ventuno, ventidue, trentacinque, ... */
  for (const [tensName, tensValue] of Object.entries(TENS)) {
    /* Italian elides the final vowel before o/a: ventuno, trentotto. */
    const prefixes = [tensName, tensName.slice(0, -1)];
    for (const prefix of prefixes) {
      if (!normalized.startsWith(prefix) || normalized === prefix) continue;
      const rest = normalized.slice(prefix.length);
      if (rest in UNITS) return tensValue + UNITS[rest];
      /* Handle "ventuno" = venti + uno with elision. */
      if (rest === "no") return tensValue + 1;
      if (rest === "tto") return tensValue + 8;
    }
  }

  return null;
}

/**
 * Scan text for a number (digits or Italian word) and return the first match.
 * Returns null when nothing numeric is found.
 */
export function extractItalianNumber(text: string): number | null {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  /* Digits win if present. */
  const digits = normalized.match(/\b(\d{1,3})\b/);
  if (digits) {
    const n = Number.parseInt(digits[1], 10);
    if (Number.isFinite(n)) return n;
  }

  /* Otherwise walk through words. */
  const tokens = normalized.split(/\s+/);
  for (const tok of tokens) {
    const val = readItalianWord(tok);
    if (val !== null) return val;
  }
  return null;
}

/* Unused in this codebase but kept exported for discoverability. */
export const ITALIAN_NUMBER_COMPOUND_ELISION = COMPOUND_ELISION;
