/**
 * Generatore voiceText italiano per il calendario raccolta.
 */

const ARTICLES: Record<string, string> = {
  secco: "il",
  umido: "l'",
  plastica: "la",
  vetro_lattine: "il",
  carta: "la",
  verde: "il",
  pannolini: "i",
};

function formatNoun(typeId: string, displayName: string): string {
  const article = ARTICLES[typeId] ?? "il";
  // For "umido" the apostrophe already joins the article
  if (article.endsWith("'")) {
    return `${article}${displayName.toLowerCase()}`;
  }
  return `${article} ${displayName.toLowerCase()}`;
}

export function buildWasteVoiceText(
  types: Array<{ id: string; displayName: string }>,
  when: "tonight" | "tomorrow",
): string {
  const prefix = when === "tonight" ? "Stasera" : "Domani";
  if (types.length === 0) {
    return `${prefix} niente da portare fuori`;
  }
  const names = types.map((t) => formatNoun(t.id, t.displayName));
  if (names.length === 1) {
    return `${prefix} porta fuori ${names[0]}`;
  }
  if (names.length === 2) {
    return `${prefix} porta fuori ${names[0]} e ${names[1]}`;
  }
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(", ");
  return `${prefix} porta fuori ${head} e ${last}`;
}
