/**
 * Scraper giallozafferano.it per la ricerca ricette.
 *
 * Replica il comportamento del vecchio `gialloZafferanoService` del
 * repo home-panel, ma lato server (niente CORS, niente DOMParser).
 *
 * Strategia:
 *  - `searchGialloZafferano(query)` scarica la pagina
 *    `https://www.giallozafferano.it/ricerca-ricette/<query>/` e parse i
 *    blocchi `<article class="gz-card …">` con regex (nessuna dipendenza
 *    external: the structure is simple and stable).
 *  - I risultati di ricerca usano `gz-card-horizontal gz-card-search`
 *    (title <h2>, description, time, difficulty, rating). The
 *    "vertical" cards are recommendation carousels: we skip them because
 *    rumorose, salvo la pagina non ne abbia altre.
 *  - Details (ingredients / steps / times) are handled by
 *    `/api/v1/recipes/import-url` tramite JSON-LD `@type=Recipe`, che
 *    GZ espone su ogni ricetta.
 */

import type {
  GialloZafferanoIngredient,
  GialloZafferanoRecipeDetails,
  GialloZafferanoSearchResult,
  GialloZafferanoStep,
} from "@home-panel/shared";

const SEARCH_URL_TEMPLATE = "https://www.giallozafferano.it/ricerca-ricette";
const FEED_URL = "https://www.giallozafferano.it/feed/";
const GZ_BASE_URL = "https://www.giallozafferano.it";
const GZ_RICETTE_URL = "https://ricette.giallozafferano.it";
const RECIPE_HOST_PATTERN = /giallozafferano\.it/i;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESULTS = 30;

// Match di un singolo `<article class="…gz-card…">…</article>`.
// Lazy match to avoid spanning across adjacent cards.
const ARTICLE_BLOCK_RE =
  /<article[^>]*class="([^"]*\bgz-card\b[^"]*)"[^>]*>([\s\S]*?)<\/article>/gi;

const HREF_RE = /<a[^>]+href="([^"]+)"/i;
// Horizontal cards have the title in <h2 class="gz-title"><a>...</a></h2>
// su quelli verticali `<h4 class="gz-title …">…</h4>`. Catturiamo entrambi.
const TITLE_RE = /<h[234][^>]*class="[^"]*\bgz-title\b[^"]*"[^>]*>([\s\S]*?)<\/h[234]>/i;
const IMG_SRC_RE = /<img[^>]+src="([^"]+)"/i;
const IMG_DATA_SRC_RE = /<img[^>]+data-(?:lazy-)?src="([^"]+)"/i;
const DESCRIPTION_RE = /<div[^>]*class="[^"]*\bgz-description\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
const CATEGORY_RE = /<div[^>]*class="[^"]*\bgz-category\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
const LI_BLOCK_RE = /<li[^>]*class="[^"]*\bgz-single-data-recipe\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;

/**
 * Cleans an HTML string of residual tags and common entities.
 */
function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&hellip;/g, "…")
    .replace(/&egrave;/g, "è")
    .replace(/&agrave;/g, "à")
    .replace(/&ograve;/g, "ò")
    .replace(/&ugrave;/g, "ù")
    .replace(/&igrave;/g, "ì")
    .replace(/&eacute;/g, "é")
    .replace(/\s+/g, " ")
    .trim();
}

interface ParsedStats {
  rating: number | null;
  comments: number | null;
  totalTimeMinutes: number | null;
  difficulty: string | null;
}

/**
 * Scansiona tutti i `li.gz-single-data-recipe` di un card e classifica
 * il contenuto in base all'icona svg usata:
 *  - `voto-*`        → rating (es. "4,3")
 *  - `commento-*`    → numero commenti
 *  - `tempo-*`       → tempo totale ("35 min")
 *  - `difficolta-*`  → textual difficulty ("Facile" / "Media" / "Difficile")
 *  - altri (kcal, …) ignorati
 */
function parseStats(cardHtml: string): ParsedStats {
  const stats: ParsedStats = {
    rating: null,
    comments: null,
    totalTimeMinutes: null,
    difficulty: null,
  };

  let safety = 0;
  for (const m of cardHtml.matchAll(LI_BLOCK_RE)) {
    if (safety++ >= 16) break;
    const inner = m[1];
    if (!inner) continue;
    const iconId = inner.match(/xlink:href="[^"#]*#([a-z0-9-]+)"/i)?.[1] ?? "";
    const text = stripHtml(inner);

    if (/^voto/i.test(iconId) && stats.rating === null) {
      const num = text.match(/\d+[,.]\d+|\d+/)?.[0];
      if (num) stats.rating = Number(num.replace(",", "."));
      continue;
    }
    if (/^commento/i.test(iconId) && stats.comments === null) {
      const num = text.match(/\d+/)?.[0];
      if (num) stats.comments = Number(num);
      continue;
    }
    if (/^tempo/i.test(iconId) && stats.totalTimeMinutes === null) {
      // GZ scrive "35 min" oppure "1 h" / "1 h 20 min".
      const hoursMatch = text.match(/(\d+)\s*h/i);
      const minsMatch = text.match(/(\d+)\s*min/i);
      const hours = hoursMatch?.[1] ? Number(hoursMatch[1]) : 0;
      const mins = minsMatch?.[1] ? Number(minsMatch[1]) : 0;
      const total = hours * 60 + mins;
      if (total > 0) stats.totalTimeMinutes = total;
      continue;
    }
    if (/^difficolta/i.test(iconId) && stats.difficulty === null) {
      const cleaned = text.replace(/\s+/g, " ").trim();
      if (cleaned) stats.difficulty = cleaned;
    }
  }

  return stats;
}

/**
 * Esegue fetch con header User-Agent da browser e timeout esplicito.
 * Alcune pagine GZ rispondono con 403 per UA "bot".
 */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "it-IT,it;q=0.9",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GZ HTTP ${res.status}`);
  }
  return res.text();
}

interface ParsedCard extends GialloZafferanoSearchResult {
  /** true if the card is a main search result (`gz-card-search`),
   * false if it is a "recommended" card from the sidebar carousel. Used for sorting. */
  primary: boolean;
}

function parseCard(classes: string, body: string): ParsedCard | null {
  const hrefMatch = body.match(HREF_RE);
  const href = hrefMatch?.[1]?.trim();
  if (!href || !RECIPE_HOST_PATTERN.test(href)) return null;
  if (!/\.html?(?:$|[?#])/i.test(href)) return null;

  const titleMatch = body.match(TITLE_RE);
  const titleRaw = titleMatch?.[1];
  const title = titleRaw ? stripHtml(titleRaw) : "";
  if (!title) return null;

  const srcValue = body.match(IMG_SRC_RE)?.[1];
  const dataSrcValue = body.match(IMG_DATA_SRC_RE)?.[1];
  let imageUrl: string | null = null;
  if (srcValue && !srcValue.startsWith("data:")) {
    imageUrl = srcValue;
  } else if (dataSrcValue) {
    imageUrl = dataSrcValue;
  }

  const descRaw = body.match(DESCRIPTION_RE)?.[1];
  const description = descRaw ? stripHtml(descRaw) : null;

  const catRaw = body.match(CATEGORY_RE)?.[1];
  const category = catRaw ? stripHtml(catRaw) : null;

  const stats = parseStats(body);

  return {
    title,
    url: href,
    imageUrl,
    description: description && description.length > 0 ? description : null,
    category: category && category.length > 0 ? category : null,
    totalTimeMinutes: stats.totalTimeMinutes,
    difficulty: stats.difficulty,
    rating: stats.rating,
    comments: stats.comments,
    primary: /\bgz-card-search\b/.test(classes),
  };
}

/**
 * Cerca ricette su giallozafferano.it.
 *
 * @param query testo libero (es. "carbonara", "pollo al curry")
 * @returns lista di risultati uniformi; array vuoto se nessun match.
 *
 * Strategia di ordinamento: prima i card `gz-card-search` (risultati
 * principali della SERP), poi eventuali card "vertical" come fallback.
 * De-duplicazione per URL canonico.
 */
export async function searchGialloZafferano(query: string): Promise<GialloZafferanoSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const searchUrl = `${SEARCH_URL_TEMPLATE}/${encodeURIComponent(trimmed)}/`;
  const html = await fetchHtml(searchUrl);

  const collected: ParsedCard[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(ARTICLE_BLOCK_RE)) {
    const classes = match[1] ?? "";
    const body = match[2];
    if (!body) continue;
    const parsed = parseCard(classes, body);
    if (!parsed) continue;
    if (seen.has(parsed.url)) continue;
    seen.add(parsed.url);
    collected.push(parsed);
    if (collected.length >= MAX_RESULTS * 2) break;
  }

  // Primary first, mantenendo l'ordine d'apparizione all'interno di ogni gruppo.
  collected.sort((a, b) => Number(b.primary) - Number(a.primary));

  return collected.slice(0, MAX_RESULTS).map(({ primary: _p, ...rest }) => rest);
}

/* -------------------------------------------------------------------- */
/*  RSS feed                                                             */
/* -------------------------------------------------------------------- */

const ITEM_BLOCK_RE = /<item>([\s\S]*?)<\/item>/gi;
const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/;
const TITLE_XML_RE = /<title>([\s\S]*?)<\/title>/i;
const LINK_XML_RE = /<link>([\s\S]*?)<\/link>/i;
const GUID_XML_RE = /<guid[^>]*>([\s\S]*?)<\/guid>/i;
const DESC_XML_RE = /<description>([\s\S]*?)<\/description>/i;
const MEDIA_CONTENT_RE = /<media:content[^>]*url="([^"]+)"/i;
const MEDIA_THUMB_RE = /<media:thumbnail[^>]*url="([^"]+)"/i;
const CONTENT_IMG_RE = /<img[^>]+src="([^"]+)"/i;

function unwrapCdata(raw: string): string {
  const m = raw.match(CDATA_RE);
  return (m?.[1] ?? raw).trim();
}

/**
 * Scarica le ultime ricette pubblicate via RSS feed di GZ.
 *
 * Ritorna i dati nello stesso shape di `searchGialloZafferano` per
 * permettere al frontend di usare lo stesso componente card. I campi
 * `totalTimeMinutes` / `difficulty` / `rating` / `comments` non sono
 * presenti nel feed e restano `null`.
 */
export async function fetchGialloZafferanoFeed(): Promise<GialloZafferanoSearchResult[]> {
  const res = await fetch(FEED_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml,application/xml,text/xml",
      "Accept-Language": "it-IT,it;q=0.9",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GZ feed HTTP ${res.status}`);
  const xml = await res.text();

  const results: GialloZafferanoSearchResult[] = [];
  const seen = new Set<string>();

  for (const m of xml.matchAll(ITEM_BLOCK_RE)) {
    const item = m[1];
    if (!item) continue;

    const guid = item.match(GUID_XML_RE)?.[1]?.trim();
    const linkRaw = item.match(LINK_XML_RE)?.[1]?.trim();
    const url = (guid || linkRaw || "").trim();
    if (!url || !RECIPE_HOST_PATTERN.test(url)) continue;
    if (!/\.html?(?:$|[?#])/i.test(url)) continue;
    if (seen.has(url)) continue;

    const titleRaw = item.match(TITLE_XML_RE)?.[1] ?? "";
    const title = stripHtml(unwrapCdata(titleRaw));
    if (!title) continue;

    const descRaw = item.match(DESC_XML_RE)?.[1] ?? "";
    const descUnwrapped = unwrapCdata(descRaw);
    const description = stripHtml(descUnwrapped).slice(0, 260) || null;

    // Priority: media:content > media:thumbnail > first <img> in description
    let imageUrl: string | null =
      item.match(MEDIA_CONTENT_RE)?.[1] ??
      item.match(MEDIA_THUMB_RE)?.[1] ??
      descUnwrapped.match(CONTENT_IMG_RE)?.[1] ??
      null;
    // Scarta immagini "strip" (multi-step) e data-uri.
    if (imageUrl && /_strip_/.test(imageUrl)) imageUrl = null;
    if (imageUrl?.startsWith("data:")) imageUrl = null;

    seen.add(url);
    results.push({
      title,
      url,
      imageUrl,
      description,
      category: null,
      totalTimeMinutes: null,
      difficulty: null,
      rating: null,
      comments: null,
    });

    if (results.length >= MAX_RESULTS) break;
  }

  return results;
}

/* -------------------------------------------------------------------- */
/*  Details scraper (ingredients + steps with images + notes)            */
/* -------------------------------------------------------------------- */

const ISO_DURATION_RE = /PT(?:(\d+)H)?(?:(\d+)M)?/;
const JSON_LD_SCRIPT_RE =
  /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const INGREDIENTS_DL_RE =
  /<dl[^>]*class="[^"]*\bgz-list-ingredients\b[^"]*"[^>]*>([\s\S]*?)<\/dl>/i;
const INGREDIENT_DD_RE = /<dd[^>]*class="[^"]*\bgz-ingredient\b[^"]*"[^>]*>([\s\S]*?)<\/dd>/gi;

// Match a single step block: from the opening div up to the
// prossimo div di step, oppure fino al prossimo <h2>/<section>/<footer>.
// Use lookahead because steps contain nested divs (img-container)
// that we cannot balance with pure regex.
// `(?![-a-z])` evita falsi positivi su "gz-content-recipe-step-img" /
// "gz-content-recipe-step-img-container" which are nested divs with
// a class name that starts the same way.
const STEP_DIV_RE =
  /<div[^>]*class="[^"]*\bgz-content-recipe-step(?![-a-z])[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*\bgz-content-recipe-step(?![-a-z])|<h2\b|<section\b|<footer\b|<aside\b)/gi;

const STEP_IMG_RE = /<img[^>]+(?:data-src|src)="([^"]+)"/gi;
const STEP_P_RE = /<p[^>]*>([\s\S]*?)<\/p>/i;

const FEATURED_IMG_RE =
  /<picture[^>]*class="[^"]*\bgz-featured-image\b[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i;
const OG_IMAGE_RE = /<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i;
const _OG_DESC_RE =
  /<meta[^>]*property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']+)["']/i;

const INTRO_DIV_RE =
  /<div[^>]*class="[^"]*\bgz-content-recipe-intro\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i;

const TITLED_SECTION_RE =
  /<h2[^>]*class="[^"]*\bgz-title-section\b[^"]*"[^>]*>\s*([^<]+?)\s*<\/h2>\s*<div[^>]*class="[^"]*\bgz-content-recipe\b[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;

function parseIsoDuration(iso: string): number | null {
  const m = iso.match(ISO_DURATION_RE);
  if (!m) return null;
  const h = Number(m[1] ?? "0");
  const mins = Number(m[2] ?? "0");
  const total = h * 60 + mins;
  return total > 0 ? total : null;
}

/**
 * Converte URL relative (es. `/images/...`) in assolute usando
 * l'host principale GZ.
 */
function toAbsoluteUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  const base = url.startsWith("/images") ? GZ_BASE_URL : GZ_RICETTE_URL;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * Estrae ricetta dal primo blocco JSON-LD di tipo Recipe (se presente).
 * Fonte primaria per titolo/descrizione/tempi/porzioni/foto hero.
 */
function extractJsonLdRecipe(html: string): Record<string, unknown> | null {
  for (const m of html.matchAll(JSON_LD_SCRIPT_RE)) {
    const raw = m[1];
    if (!raw) continue;
    try {
      const data = JSON.parse(raw.trim());
      const candidates: unknown[] = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          if (obj["@type"] === "Recipe") return obj;
          const graph = obj["@graph"];
          if (Array.isArray(graph)) {
            const found = graph.find(
              (g) =>
                g && typeof g === "object" && (g as Record<string, unknown>)["@type"] === "Recipe",
            );
            if (found) return found as Record<string, unknown>;
          }
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  }
  return null;
}

/**
 * Parse della `<dl class="gz-list-ingredients">` estraendo nome e
 * quantity for each ingredient. The name is in the inner <a> or in
 * the <dd> text, the quantity in the next <span>.
 */
function parseIngredients(html: string): GialloZafferanoIngredient[] {
  const dlMatch = html.match(INGREDIENTS_DL_RE);
  if (!dlMatch?.[1]) return [];
  const dlBody = dlMatch[1];

  const ingredients: GialloZafferanoIngredient[] = [];
  for (const m of dlBody.matchAll(INGREDIENT_DD_RE)) {
    const dd = m[1];
    if (!dd) continue;

    // Nome: primo <a>…</a> (oppure prima riga di testo non-span)
    const anchorMatch = dd.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
    const name = anchorMatch?.[1] ? stripHtml(anchorMatch[1]) : "";
    if (!name) continue;

    // Quantity: first <span>...</span>
    const spanMatch = dd.match(/<span[^>]*>([\s\S]*?)<\/span>/i);
    const quantity = spanMatch?.[1] ? stripHtml(spanMatch[1]) : "";

    ingredients.push({
      name,
      quantity: quantity.length > 0 ? quantity : null,
    });
  }
  return ingredients;
}

/**
 * Parse dei blocchi `<div class="gz-content-recipe-step">`. Ogni blocco
 * may have 0..N images (typically 1 horizontal strip) and a <p>
 * con il testo del passo. I numeri degli step sono rimossi dal testo
 * because the <span class="num-step">N</span> badges create noise.
 */
function parseSteps(html: string): GialloZafferanoStep[] {
  const matches: string[] = [];
  for (const m of html.matchAll(STEP_DIV_RE)) {
    if (m[1]) matches.push(m[1]);
    if (matches.length > 40) break;
  }

  const steps: GialloZafferanoStep[] = [];
  matches.forEach((body) => {
    // Testo dal primo <p>
    const pMatch = body.match(STEP_P_RE);
    const rawP = pMatch?.[1] ?? "";
    // Remove num-step badges that are often numbers mixed in the text.
    const cleanedP = rawP.replace(
      /<span[^>]*class="[^"]*num-step[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
      "",
    );
    const text = stripHtml(cleanedP);
    if (!text || text.length < 10) return;

    // Immagini: tutte le <img> dentro il blocco (dedup, no data: URIs).
    const images: string[] = [];
    for (const im of body.matchAll(STEP_IMG_RE)) {
      const src = im[1];
      if (!src || src.startsWith("data:")) continue;
      const abs = toAbsoluteUrl(src);
      if (abs && !images.includes(abs)) images.push(abs);
    }

    // Index progressivo DOPO il filtro su testo vuoto.
    steps.push({ index: steps.length + 1, text, images });
  });

  return steps;
}

/**
 * Estrae le sezioni titolate (Conservazione, Consiglio, Note, ecc.)
 * mappandole nei campi `notes` / `tips` / `conservation`.
 */
function parseNamedSections(html: string): {
  notes: string | null;
  tips: string | null;
  conservation: string | null;
} {
  const result = {
    notes: null as string | null,
    tips: null as string | null,
    conservation: null as string | null,
  };

  for (const m of html.matchAll(TITLED_SECTION_RE)) {
    const title = stripHtml(m[1] ?? "").toLowerCase();
    const body = stripHtml(m[2] ?? "");
    if (!title || !body) continue;
    if (title.includes("conservazione") && !result.conservation) {
      result.conservation = body;
    } else if (title.includes("consiglio") && !result.tips) {
      result.tips = body;
    } else if ((title.includes("curiosit") || title.includes("nota")) && !result.notes) {
      result.notes = body;
    }
  }
  return result;
}

function parseIntroDescription(html: string): string | null {
  const m = html.match(INTRO_DIV_RE);
  if (!m?.[1]) return null;
  // Take only the first paragraphs, concatenated.
  const paragraphs: string[] = [];
  const P_RE = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  for (const pm of m[1].matchAll(P_RE)) {
    if (pm[1]) {
      const text = stripHtml(pm[1]);
      if (text.length > 30) paragraphs.push(text);
    }
    if (paragraphs.length >= 3) break;
  }
  return paragraphs.length > 0 ? paragraphs.join("\n\n") : null;
}

/**
 * Scarica una pagina ricetta di giallozafferano.it e la parsifica
 * fully (ingredients with quantities, steps with images,
 * sezioni "Conservazione"/"Consiglio"/"Note").
 *
 * Strategy: JSON-LD = source of truth for title/times/photo; HTML = source of truth
 * for ingredients with separate quantities and steps with images, which
 * non sono esposti nel JSON-LD.
 */
export async function fetchGialloZafferanoDetails(
  url: string,
): Promise<GialloZafferanoRecipeDetails> {
  if (!RECIPE_HOST_PATTERN.test(url)) {
    throw new Error("URL non è di giallozafferano.it");
  }
  const html = await fetchHtml(url);

  const ld = extractJsonLdRecipe(html);

  // --- Titolo / descrizione / foto -----------------------------------
  const titleFromLd = typeof ld?.name === "string" ? (ld.name as string).trim() : "";
  const descFromLd =
    typeof ld?.description === "string" ? stripHtml(ld.description as string) : null;
  const descFromIntro = parseIntroDescription(html);
  const description = descFromIntro ?? descFromLd ?? null;

  let imageUrl: string | null = null;
  const ldImage = ld?.image;
  if (typeof ldImage === "string") imageUrl = ldImage;
  else if (Array.isArray(ldImage) && typeof ldImage[0] === "string") imageUrl = ldImage[0];
  else if (
    ldImage &&
    typeof ldImage === "object" &&
    typeof (ldImage as Record<string, unknown>).url === "string"
  ) {
    imageUrl = (ldImage as Record<string, string>).url ?? null;
  }
  if (!imageUrl) {
    imageUrl = html.match(FEATURED_IMG_RE)?.[1] ?? html.match(OG_IMAGE_RE)?.[1] ?? null;
  }
  if (imageUrl) imageUrl = toAbsoluteUrl(imageUrl);

  // --- Times / servings / category / difficulty ---
  const prepTime =
    typeof ld?.prepTime === "string" ? parseIsoDuration(ld.prepTime as string) : null;
  const cookTime =
    typeof ld?.cookTime === "string" ? parseIsoDuration(ld.cookTime as string) : null;
  const totalTime =
    typeof ld?.totalTime === "string" ? parseIsoDuration(ld.totalTime as string) : null;

  let servings: number | null = null;
  const ldYield = ld?.recipeYield;
  if (typeof ldYield === "number") servings = ldYield;
  else if (typeof ldYield === "string") {
    const n = parseInt(ldYield, 10);
    if (!Number.isNaN(n)) servings = n;
  }

  const category = typeof ld?.recipeCategory === "string" ? (ld.recipeCategory as string) : null;

  // Difficulty: on GZ it's in the keywords or from SERP scraping.
  // deriviamo dall'HTML se presente, altrimenti null.
  let difficulty: string | null = null;
  const diffMatch = html.match(/difficolt[àa]\s*<[^>]*>[^<]*<[^>]*>\s*<[^>]*>([^<]+)/i);
  if (diffMatch?.[1]) difficulty = diffMatch[1].trim();

  // --- Ingredienti / passi / sezioni ---------------------------------
  const ingredients = parseIngredients(html);
  const steps = parseSteps(html);
  const named = parseNamedSections(html);

  // Fallback for ingredients if HTML scraping fails.
  if (ingredients.length === 0 && Array.isArray(ld?.recipeIngredient)) {
    (ld.recipeIngredient as unknown[]).forEach((raw) => {
      if (typeof raw === "string") {
        ingredients.push({ name: raw, quantity: null });
      }
    });
  }
  // Fallback for steps if HTML scraping fails.
  if (steps.length === 0 && Array.isArray(ld?.recipeInstructions)) {
    (ld.recipeInstructions as unknown[]).forEach((raw, i) => {
      if (typeof raw === "string") {
        steps.push({ index: i + 1, text: stripHtml(raw), images: [] });
      } else if (raw && typeof raw === "object") {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.text === "string") {
          steps.push({
            index: i + 1,
            text: stripHtml(obj.text as string),
            images: [],
          });
        }
      }
    });
  }

  return {
    title: titleFromLd || stripHtml(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? ""),
    description,
    imageUrl,
    category,
    difficulty,
    prepTimeMinutes: prepTime,
    cookTimeMinutes: cookTime,
    totalTimeMinutes: totalTime,
    servings,
    ingredients,
    steps,
    notes: named.notes,
    tips: named.tips,
    conservation: named.conservation,
    sourceUrl: url,
  };
}
