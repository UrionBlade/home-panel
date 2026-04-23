import type { ParsedCommand, VoiceIntent } from "@home-panel/shared";
import { matchAcIntent } from "./acIntents";
import { matchLaundryIntent } from "./laundryIntents";
import { matchLightIntent } from "./lightIntents";
import { matchTvIntent } from "./tvIntents";

/**
 * Parser vocale fuzzy per italiano.
 * Usa keyword scoring: non serve dire la frase esatta,
 * basta che il senso sia chiaro.
 */

interface IntentRule {
  intent: VoiceIntent;
  keywords: string[];
  required?: string[];
  exclude?: string[];
  extractEntity?: (text: string) => Record<string, string>;
}

const FILLER_WORDS = new Set([
  "per",
  "favore",
  "grazie",
  "cortesemente",
  "please",
  "puoi",
  "potresti",
  "vorrei",
  "voglio",
  "ok",
  "okay",
  "casa",
  "ehi",
  "hey",
  "mi",
  "ci",
  "di",
  "che",
  "un",
  "una",
]);

const ARTICLES =
  /^(?:il|lo|la|l['ʼ'`´]?|i|gli|le|un|uno|una|un['ʼ'`´]?|del|dello|della|dell['ʼ'`´]?|dei|degli|delle)\s*/i;

function stripArticle(text: string): string {
  return text.replace(ARTICLES, "").trim();
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extractSubject(text: string, removeWords: string[]): string {
  let result = text.toLowerCase();
  for (const w of removeWords) {
    result = result.replace(new RegExp(`\\b${w}\\b`, "gi"), " ");
  }
  result = result.replace(/\s+/g, " ").trim();
  const words = result.split(" ").filter((w) => !FILLER_WORDS.has(w));
  return capitalize(stripArticle(words.join(" ")));
}

const SHOPPING_REMOVE = [
  "aggiungi",
  "aggiungere",
  "metti",
  "mettere",
  "compra",
  "comprare",
  "prendi",
  "prendere",
  "serve",
  "servono",
  "vuole",
  "vogliono",
  "bisogna",
  "devo",
  "dobbiamo",
  "alla",
  "nella",
  "sulla",
  "lista",
  "spesa",
  "della",
];

const RULES: IntentRule[] = [
  // ==== SPESA ====
  {
    intent: "add_to_shopping",
    keywords: [
      "aggiungi",
      "aggiungere",
      "metti",
      "mettere",
      "compra",
      "comprare",
      "prendi",
      "prendere",
      "serve",
      "servono",
      "bisogna",
    ],
    required: [
      "aggiungi",
      "metti",
      "compra",
      "prendi",
      "serve",
      "servono",
      "bisogna",
      "comprare",
      "aggiungere",
      "mettere",
      "prendere",
    ],
    exclude: ["calendario", "evento", "agenda", "post-it", "nota", "appunto", "timer"],
    extractEntity: (text) => ({
      product: extractSubject(text, SHOPPING_REMOVE),
    }),
  },
  {
    intent: "remove_from_shopping",
    keywords: [
      "togli",
      "togliere",
      "rimuovi",
      "rimuovere",
      "cancella",
      "elimina",
      "leva",
      "levare",
    ],
    required: [
      "togli",
      "togliere",
      "rimuovi",
      "rimuovere",
      "cancella",
      "elimina",
      "leva",
      "levare",
    ],
    exclude: ["timer", "sveglia", "evento"],
    extractEntity: (text) => ({
      product: extractSubject(text, [
        "togli",
        "togliere",
        "rimuovi",
        "rimuovere",
        "cancella",
        "elimina",
        "leva",
        "levare",
        "dalla",
        "spesa",
        "lista",
        "della",
      ]),
    }),
  },
  {
    intent: "read_shopping",
    keywords: ["spesa", "lista", "comprare", "cosa", "leggi", "mostra", "dimmi"],
    required: ["spesa", "lista", "comprare"],
  },

  // ==== CALENDARIO ====
  {
    intent: "add_event",
    keywords: ["calendario", "evento", "agenda", "segna", "appuntamento"],
    required: ["calendario", "evento", "agenda"],
    extractEntity: (text) => ({
      text: extractSubject(text, [
        "aggiungi",
        "aggiungere",
        "metti",
        "mettere",
        "segna",
        "segnare",
        "crea",
        "creare",
        "inserisci",
        "nel",
        "al",
        "sul",
        "in",
        "calendario",
        "agenda",
        "evento",
        "nuovo",
      ]),
    }),
  },
  {
    intent: "read_today_events",
    keywords: [
      "oggi",
      "stamattina",
      "stasera",
      "eventi",
      "impegni",
      "appuntamenti",
      "agenda",
      "programma",
    ],
    required: ["oggi", "stamattina", "stasera"],
    exclude: ["domani", "spazzatura", "rifiuti", "fuori", "porto"],
  },
  {
    intent: "read_tomorrow_events",
    keywords: ["domani", "eventi", "impegni", "appuntamenti", "agenda", "programma"],
    required: ["domani"],
    exclude: ["spazzatura", "rifiuti", "fuori", "porto", "tempo", "meteo"],
  },

  // ==== RIFIUTI ====
  {
    intent: "read_waste_today",
    keywords: [
      "spazzatura",
      "rifiuti",
      "raccolta",
      "immondizia",
      "differenziata",
      "fuori",
      "porto",
      "butto",
    ],
    required: [
      "spazzatura",
      "rifiuti",
      "raccolta",
      "immondizia",
      "differenziata",
      "fuori",
      "porto",
      "butto",
    ],
    exclude: ["domani"],
  },
  {
    intent: "read_waste_tomorrow",
    keywords: [
      "spazzatura",
      "rifiuti",
      "raccolta",
      "immondizia",
      "differenziata",
      "fuori",
      "porto",
      "butto",
      "domani",
    ],
    required: ["domani"],
  },

  // ==== METEO ====
  {
    intent: "read_weather",
    keywords: [
      "tempo",
      "meteo",
      "previsioni",
      "piove",
      "nevica",
      "pioverà",
      "caldo",
      "freddo",
      "bello",
      "brutto",
      "ombrello",
      "giacca",
      "giubbotto",
      "temperatura",
    ],
    required: [
      "tempo",
      "meteo",
      "previsioni",
      "piove",
      "nevica",
      "pioverà",
      "caldo",
      "freddo",
      "ombrello",
      "giacca",
      "temperatura",
    ],
    exclude: ["domani"],
  },
  {
    intent: "read_weather_tomorrow",
    keywords: ["tempo", "meteo", "previsioni", "domani", "pioverà"],
    required: ["domani"],
  },

  // ==== TIMER ====
  {
    // "quanto manca al timer", "quanto tempo resta al timer", etc. Must
    // sit before `set_timer` so its higher score (quanto + manca + timer)
    // beats the 1-point match that set_timer would otherwise claim.
    intent: "query_timer",
    keywords: [
      "quanto",
      "manca",
      "mancano",
      "resta",
      "restano",
      "rimane",
      "rimangono",
      "tempo",
      "timer",
      "cronometro",
      "countdown",
    ],
    required: ["timer", "countdown", "cronometro"],
    exclude: ["imposta", "metti", "avvia", "attiva", "ferma", "stop", "cancella"],
  },
  {
    intent: "set_timer",
    keywords: [
      "timer",
      "conto alla rovescia",
      "countdown",
      "cronometro",
      "avvia",
      "imposta",
      "parti",
    ],
    required: ["timer", "countdown", "cronometro"],
    exclude: ["quanto", "manca", "mancano", "resta", "restano", "rimane", "rimangono"],
    extractEntity: (text) => {
      // Pass near-raw text to parseDuration for the timer intent,
      // stripping only command words but NOT articles/filler words
      // ("un" is critical for "un'ora").
      const duration = text
        .toLowerCase()
        .replace(/\b(metti|imposta|avvia|attiva|fai|partire|timer|cronometro|countdown)\b/g, " ")
        .replace(/\b(di|da|per)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { duration };
    },
  },
  {
    intent: "stop_timer",
    keywords: [
      "ferma",
      "stop",
      "spegni",
      "cancella",
      "elimina",
      "togli",
      "timer",
      "sveglia",
      "allarme",
      "primo",
      "secondo",
      "terzo",
      "quarto",
      "ultimo",
      "tutti",
      "tutto",
    ],
    required: ["timer", "sveglia", "allarme"],
    exclude: ["imposta", "metti", "avvia", "crea"],
  },

  // ==== POST-IT / PROMEMORIA ====
  {
    intent: "add_postit",
    keywords: [
      "nota",
      "appunto",
      "memo",
      "promemoria",
      "ricordami",
      "ricordati",
      "post-it",
      "postit",
      "scrivi",
      "segna",
      "segnati",
    ],
    required: [
      "nota",
      "appunto",
      "memo",
      "promemoria",
      "ricordami",
      "ricordati",
      "post-it",
      "postit",
      "scrivi",
      "segna",
      "segnati",
    ],
    exclude: ["spesa", "lista", "calendario"],
    extractEntity: (text) => ({
      text: extractSubject(text, [
        "nota",
        "appunto",
        "memo",
        "promemoria",
        "ricordami",
        "ricordati",
        "scrivi",
        "segna",
        "segnati",
        "aggiungi",
        "crea",
        "metti",
        "post-it",
        "postit",
      ]),
    }),
  },

  // ==== RICETTE ====
  {
    intent: "search_recipe",
    keywords: [
      "ricetta",
      "ricette",
      "cucinare",
      "cucinamo",
      "cuciniamo",
      "preparare",
      "prepariamo",
      "piatto",
      "piatti",
      "mangiamo",
      "mangiare",
      "cerca",
    ],
    required: [
      "ricetta",
      "ricette",
      "cucinare",
      "cucinamo",
      "cuciniamo",
      "preparare",
      "piatto",
      "mangiamo",
      "mangiare",
    ],
    extractEntity: (text) => ({
      query: extractSubject(text, [
        "cerca",
        "trovami",
        "cercare",
        "ricetta",
        "ricette",
        "cucinare",
        "cucinamo",
        "cuciniamo",
        "preparare",
        "prepariamo",
        "piatto",
        "voglio",
        "vorrei",
        "mangiamo",
        "mangiare",
        "come",
        "si",
        "fa",
      ]),
    }),
  },

  // ==== ORA E DATA ====
  {
    intent: "what_time",
    keywords: ["ore", "ora", "orario"],
    required: ["ore", "ora", "orario"],
    exclude: ["evento", "domani", "sveglia", "timer"],
  },
  {
    intent: "what_date",
    keywords: ["giorno", "data", "siamo", "quanti", "ne", "abbiamo"],
    required: ["data", "quanti"],
    exclude: ["spazzatura", "rifiuti", "evento"],
  },

  // ==== ROUTINE ====
  {
    intent: "routine_morning",
    keywords: ["buongiorno", "buona mattina", "good morning"],
    required: ["buongiorno", "buona"],
  },
  {
    intent: "routine_night",
    keywords: ["buonanotte", "buona notte", "buonasera", "buona sera"],
    required: ["buonanotte", "buonasera", "notte", "sera"],
  },

  // ==== CONVERSAZIONE ====
  {
    intent: "greeting",
    keywords: ["ciao", "salve", "ehi", "hey", "hola", "come", "stai"],
    required: ["ciao", "salve", "ehi", "hey", "hola"],
  },
  {
    intent: "how_are_you",
    keywords: ["come", "stai", "tutto", "bene", "va"],
    required: ["come"],
  },
  {
    intent: "thank_you",
    keywords: ["grazie", "ringrazio", "gentile", "bravo", "brava"],
    required: ["grazie", "ringrazio", "bravo", "brava"],
  },
  {
    intent: "joke",
    keywords: ["barzelletta", "scherzo", "battuta", "ridere", "divertente", "racconta", "fai"],
    required: ["barzelletta", "scherzo", "battuta", "ridere"],
  },
  {
    intent: "compliment",
    keywords: [
      "bello",
      "bella",
      "bellissimo",
      "fantastico",
      "meraviglioso",
      "stupendo",
      "amo",
      "adoro",
      "grande",
    ],
    required: [
      "bello",
      "bella",
      "bellissimo",
      "fantastico",
      "meraviglioso",
      "stupendo",
      "amo",
      "adoro",
    ],
  },
  {
    intent: "who_are_you",
    keywords: ["chi", "sei", "cosa", "nome", "chiami"],
    required: ["chi", "cosa"],
  },
  {
    intent: "help",
    keywords: ["aiuto", "help", "cosa", "puoi", "fare", "sai", "comandi", "funzioni"],
    required: ["aiuto", "help", "comandi", "funzioni"],
  },

  // ==== MUSICA ====
  {
    intent: "music_play",
    keywords: [
      "musica",
      "metti",
      "play",
      "riproduci",
      "avvia",
      "suona",
      "ascolta",
      "canzone",
      "spotify",
    ],
    required: ["musica", "play", "riproduci", "suona", "spotify"],
    exclude: ["pausa", "stop", "ferma", "prossima", "precedente", "volume", "bassa", "alta"],
  },
  {
    intent: "music_pause",
    keywords: ["pausa", "stop", "ferma", "musica", "metti", "smetti"],
    required: ["pausa"],
    exclude: ["timer"],
  },
  {
    intent: "music_next",
    keywords: ["prossima", "canzone", "traccia", "salta", "avanti", "skip", "successiva"],
    required: ["prossima", "salta", "skip", "successiva", "avanti"],
    exclude: ["precedente", "indietro"],
  },
  {
    intent: "music_previous",
    keywords: ["precedente", "canzone", "traccia", "indietro", "torna"],
    required: ["precedente", "indietro"],
  },
  {
    intent: "music_volume",
    keywords: ["volume", "alza", "abbassa", "alto", "basso", "forte", "piano"],
    required: ["volume", "alza", "abbassa", "forte", "piano"],
    extractEntity: (text) => {
      const lower = text.toLowerCase();
      // "volume al 50", "volume 80", "alza il volume" (Italian voice patterns)
      const numMatch = lower.match(/(\d+)/);
      if (numMatch) return { volume: numMatch[1] };
      if (/alza|alto|forte|su/.test(lower)) return { volume: "up" };
      if (/abbassa|basso|piano|giù|giu/.test(lower)) return { volume: "down" };
      return { volume: "50" };
    },
  },

  // ==== CANCEL ====
  {
    intent: "cancel",
    keywords: [
      "annulla",
      "stop",
      "basta",
      "ferma",
      "fermati",
      "spegni",
      "zitto",
      "silenzio",
      "taci",
      "niente",
      "lascia",
      "perdere",
      "smettila",
      "non importa",
      "fa niente",
    ],
    required: [
      "annulla",
      "stop",
      "basta",
      "ferma",
      "fermati",
      "spegni",
      "zitto",
      "silenzio",
      "taci",
      "niente",
      "smettila",
      "lascia",
      "importa",
    ],
  },
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function wordScore(text: string, keywords: string[]): number {
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) score++;
  }
  return score;
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((w) => text.includes(w));
}

export function parseVoiceCommand(text: string): ParsedCommand | null {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 2) return null;

  // Exact phrases with priority — evaluated BEFORE generic rules
  if (/\bbuongiorno\b/.test(normalized)) {
    return { intent: "routine_morning", entities: {}, confidence: 1, raw: text.trim() };
  }
  if (/\bbuonanotte\b|\bbuona\s*notte\b|\bbuonasera\b|\bbuona\s*sera\b/.test(normalized)) {
    return { intent: "routine_night", entities: {}, confidence: 1, raw: text.trim() };
  }
  if (
    /che giorno (è|e|siamo)/.test(normalized) ||
    /\bche data\b/.test(normalized) ||
    /quanti ne abbiamo/.test(normalized)
  ) {
    return { intent: "what_date", entities: {}, confidence: 1, raw: text.trim() };
  }
  if (/che ore sono/.test(normalized) || /che ora (è|e)/.test(normalized)) {
    return { intent: "what_time", entities: {}, confidence: 1, raw: text.trim() };
  }

  /* Device-specific matchers (evaluated before the generic keyword scoring).
   * AC runs first because "condizionatore" alone already carries both the
   * domain and the action hint; lights' broad "accendi" regex would
   * otherwise swallow AC commands. */
  const ac = matchAcIntent(text);
  if (ac) return ac;
  const tv = matchTvIntent(text);
  if (tv) return tv;
  const laundry = matchLaundryIntent(text);
  if (laundry) return laundry;
  const light = matchLightIntent(text);
  if (light) return light;

  let bestIntent: VoiceIntent | null = null;
  let bestScore = 0;
  let bestRule: IntentRule | null = null;

  for (const rule of RULES) {
    if (rule.exclude && hasAny(normalized, rule.exclude)) continue;
    if (rule.required && !hasAny(normalized, rule.required)) continue;

    const score = wordScore(normalized, rule.keywords);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = rule.intent;
      bestRule = rule;
    }
  }

  if (!bestIntent || !bestRule || bestScore === 0) return null;

  const entities = bestRule.extractEntity?.(text) ?? {};

  return {
    intent: bestIntent,
    entities,
    confidence: Math.min(1, bestScore / 3),
    raw: text.trim(),
  };
}
