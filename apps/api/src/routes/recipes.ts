import { randomUUID } from "node:crypto";
import type {
  CreateRecipeInput,
  ImportedRecipeData,
  Recipe,
  RecipeDifficulty,
  RecipeStep,
  UpdateRecipeInput,
} from "@home-panel/shared";
import { and, eq, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type RecipeRow, recipes } from "../db/schema.js";
import {
  fetchGialloZafferanoDetails,
  fetchGialloZafferanoFeed,
  searchGialloZafferano,
} from "../lib/giallo-zafferano.js";
import { assertPublicUrl } from "../lib/url-safety.js";

const VALID_DIFFICULTIES: RecipeDifficulty[] = ["facile", "medio", "difficile"];

/** Escapes SQLite wildcards `%` `_` and `\` for use in LIKE with ESCAPE '\\' */
function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

/**
 * Normalizes the `steps` field stored in the DB.
 * Historically it was `string[]`; since the "rich recipes" milestone it is
 * `RecipeStep[]` with `{ text, images }`. For backward compatibility we
 * accept both formats and map strings to steps without images.
 */
function parseStepsJson(raw: string): RecipeStep[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): RecipeStep | null => {
        if (typeof item === "string") {
          return { text: item, images: [] };
        }
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          const text = typeof obj.text === "string" ? obj.text : "";
          if (!text) return null;
          const images = Array.isArray(obj.images)
            ? (obj.images as unknown[]).filter((x): x is string => typeof x === "string")
            : [];
          return { text, images };
        }
        return null;
      })
      .filter((x): x is RecipeStep => x !== null);
  } catch {
    return [];
  }
}

/**
 * Inverse of `parseStepsJson`: accepts mixed string|RecipeStep input
 * (for API payload backward compatibility) and always returns
 * `RecipeStep[]` to be serialized to the DB.
 */
function normalizeIncomingSteps(input: Array<string | RecipeStep> | undefined): RecipeStep[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s): RecipeStep | null => {
      if (typeof s === "string") {
        const t = s.trim();
        return t ? { text: t, images: [] } : null;
      }
      if (s && typeof s === "object" && typeof s.text === "string") {
        const text = s.text.trim();
        if (!text) return null;
        const images = Array.isArray(s.images)
          ? s.images.filter((img): img is string => typeof img === "string" && img.length > 0)
          : [];
        return { text, images };
      }
      return null;
    })
    .filter((x): x is RecipeStep => x !== null);
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    sourceUrl: row.sourceUrl,
    sourceName: row.sourceName,
    imageUrl: row.imageUrl,
    prepTimeMinutes: row.prepTimeMinutes,
    cookTimeMinutes: row.cookTimeMinutes,
    servings: row.servings,
    difficulty: row.difficulty as RecipeDifficulty | null,
    ingredients: parseJsonStringArray(row.ingredients),
    steps: parseStepsJson(row.steps),
    tags: parseJsonStringArray(row.tags),
    favorite: row.favorite,
    notes: row.notes,
    tips: row.tips,
    conservation: row.conservation,
  };
}

export const recipesRouter = new Hono()
  /* ----- list ----- */
  .get("/", (c) => {
    const tag = c.req.query("tag");
    const favorite = c.req.query("favorite");
    const q = c.req.query("q");

    const conditions = [];

    if (favorite === "true") {
      conditions.push(eq(recipes.favorite, true));
    }
    if (tag) {
      // tags is a JSON array, search with LIKE (SQLite wildcard escaped)
      conditions.push(like(recipes.tags, `%"${escapeLikePattern(tag)}"%`));
    }
    if (q) {
      const esc = escapeLikePattern(q);
      conditions.push(
        sql`(${recipes.title} LIKE ${`%${esc}%`} ESCAPE '\\' OR ${recipes.description} LIKE ${`%${esc}%`} ESCAPE '\\')`,
      );
    }

    const rows =
      conditions.length > 0
        ? db
            .select()
            .from(recipes)
            .where(and(...conditions))
            .all()
        : db.select().from(recipes).all();

    return c.json(rows.map(rowToRecipe));
  })

  /* ----- create ----- */
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as CreateRecipeInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    const title = body.title?.trim();
    if (!title) {
      return c.json({ error: "title è obbligatorio" }, 400);
    }

    if (body.difficulty && !VALID_DIFFICULTIES.includes(body.difficulty)) {
      return c.json({ error: "difficulty non valido" }, 400);
    }

    const now = new Date().toISOString();
    const row: RecipeRow = {
      id: randomUUID(),
      title,
      description: body.description?.trim() || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      sourceName: body.sourceName?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
      prepTimeMinutes: body.prepTimeMinutes ?? null,
      cookTimeMinutes: body.cookTimeMinutes ?? null,
      servings: body.servings ?? null,
      difficulty: body.difficulty ?? null,
      ingredients: JSON.stringify(body.ingredients ?? []),
      steps: JSON.stringify(normalizeIncomingSteps(body.steps)),
      tags: JSON.stringify(body.tags ?? []),
      favorite: false,
      notes: body.notes?.trim() || null,
      tips: body.tips?.trim() || null,
      conservation: body.conservation?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(recipes).values(row).run();
    return c.json(rowToRecipe(row), 201);
  })

  /* ----- update ----- */
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    const body = (await c.req.json().catch(() => null)) as UpdateRecipeInput | null;
    if (!body || typeof body !== "object") {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }

    if (body.difficulty && !VALID_DIFFICULTIES.includes(body.difficulty)) {
      return c.json({ error: "difficulty non valido" }, 400);
    }

    const updates: Partial<RecipeRow> = {};

    if (body.title !== undefined) {
      const trimmed = body.title.trim();
      if (!trimmed) return c.json({ error: "title è obbligatorio" }, 400);
      updates.title = trimmed;
    }
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.sourceUrl !== undefined) updates.sourceUrl = body.sourceUrl?.trim() || null;
    if (body.sourceName !== undefined) updates.sourceName = body.sourceName?.trim() || null;
    if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl?.trim() || null;
    if (body.prepTimeMinutes !== undefined) updates.prepTimeMinutes = body.prepTimeMinutes ?? null;
    if (body.cookTimeMinutes !== undefined) updates.cookTimeMinutes = body.cookTimeMinutes ?? null;
    if (body.servings !== undefined) updates.servings = body.servings ?? null;
    if (body.difficulty !== undefined) updates.difficulty = body.difficulty ?? null;
    if (body.ingredients !== undefined) updates.ingredients = JSON.stringify(body.ingredients);
    if (body.steps !== undefined)
      updates.steps = JSON.stringify(normalizeIncomingSteps(body.steps));
    if (body.tags !== undefined) updates.tags = JSON.stringify(body.tags);
    if (body.favorite !== undefined) updates.favorite = body.favorite;
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
    if (body.tips !== undefined) updates.tips = body.tips?.trim() || null;
    if (body.conservation !== undefined) updates.conservation = body.conservation?.trim() || null;

    if (Object.keys(updates).length === 0) {
      return c.json(rowToRecipe(existing));
    }

    updates.updatedAt = new Date().toISOString();
    db.update(recipes).set(updates).where(eq(recipes.id, id)).run();

    const updated = db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToRecipe(updated));
  })

  /* ----- delete ----- */
  .delete("/:id", (c) => {
    const id = c.req.param("id");
    const result = db.delete(recipes).where(eq(recipes.id, id)).run();
    if (result.changes === 0) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.body(null, 204);
  })

  /* ----- toggle favorite ----- */
  .post("/:id/toggle-favorite", (c) => {
    const id = c.req.param("id");
    const existing = db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!existing) return c.json({ error: "not_found" }, 404);

    db.update(recipes)
      .set({
        favorite: !existing.favorite,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(recipes.id, id))
      .run();

    const updated = db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json(rowToRecipe(updated));
  })

  /* ----- latest recipes from the giallozafferano.it RSS feed ----- */
  .get("/gz/feed", async (c) => {
    try {
      const items = await fetchGialloZafferanoFeed();
      return c.json(items);
    } catch (err) {
      console.error("[recipes/gz/feed]", err);
      return c.json({ error: "Feed GialloZafferano non disponibile" }, 502);
    }
  })

  /* ----- giallozafferano recipe details (full scraping) ----- */
  .get("/gz/details", async (c) => {
    const url = c.req.query("url")?.trim();
    if (!url) {
      return c.json({ error: "url è obbligatorio" }, 400);
    }
    if (!/giallozafferano\.it/i.test(url)) {
      return c.json({ error: "URL non è di giallozafferano.it" }, 400);
    }
    try {
      const details = await fetchGialloZafferanoDetails(url);
      return c.json(details);
    } catch (err) {
      console.error("[recipes/gz/details]", err);
      return c.json({ error: "Dettaglio GialloZafferano non disponibile" }, 502);
    }
  })

  /* ----- search on giallozafferano.it ----- */
  .get("/gz/search", async (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) {
      return c.json({ error: "q è obbligatorio" }, 400);
    }
    const pageRaw = c.req.query("page");
    let page = 1;
    if (pageRaw !== undefined) {
      const parsed = Number.parseInt(pageRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
        return c.json({ error: "page non valido" }, 400);
      }
      page = parsed;
    }
    try {
      const results = await searchGialloZafferano(q, page);
      return c.json(results);
    } catch (err) {
      console.error("[recipes/gz/search]", err);
      return c.json({ error: "Ricerca su GialloZafferano non disponibile" }, 502);
    }
  })

  /* ----- import from URL (best-effort scraper) ----- */
  .post("/import-url", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { url: string } | null;
    if (!body?.url?.trim()) {
      return c.json({ error: "url è obbligatorio" }, 400);
    }

    const url = body.url.trim();

    // SSRF guard: validate scheme + host is not private/loopback/metadata
    let safeUrl: URL;
    try {
      safeUrl = await assertPublicUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "URL non valido";
      return c.json({ error: `URL non consentito: ${msg}` }, 400);
    }

    let html: string;
    try {
      const response = await fetch(safeUrl.toString(), {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.5",
        },
        redirect: "manual", // avoid redirects to internal hosts
        signal: AbortSignal.timeout(12000),
      });
      if (response.status >= 300 && response.status < 400) {
        return c.json({ error: "Redirect non consentito" }, 400);
      }
      html = await response.text();
      // Cap size to avoid OOM and ReDoS
      if (html.length > 5_000_000) {
        return c.json({ error: "Pagina troppo grande" }, 413);
      }
    } catch {
      return c.json({ error: "Impossibile raggiungere la pagina" }, 400);
    }

    const result: ImportedRecipeData = {};

    // Derive sourceName from URL hostname
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      if (hostname.includes("giallozafferano")) {
        result.sourceName = "GialloZafferano";
      } else {
        result.sourceName = hostname;
      }
    } catch {
      // ignore
    }

    // Try JSON-LD Recipe schema
    const jsonLdMatches = html.match(
      /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    );
    if (jsonLdMatches) {
      for (const match of jsonLdMatches) {
        const content = match.replace(/<script[^>]*>|<\/script>/gi, "");
        try {
          const data = JSON.parse(content);
          const candidates = Array.isArray(data) ? data : [data];

          // Helper: check @type supports string and array forms
          const isRecipe = (obj: Record<string, unknown>): boolean => {
            const t = obj["@type"];
            return t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"));
          };

          let recipe: Record<string, unknown> | null = null;
          for (const item of candidates) {
            if (isRecipe(item)) {
              recipe = item;
              break;
            }
            // Check @graph (WPRM, Yoast, etc.)
            const graph = item["@graph"];
            if (Array.isArray(graph)) {
              const found = graph.find((g: Record<string, unknown>) => isRecipe(g));
              if (found) {
                recipe = found as Record<string, unknown>;
                break;
              }
            }
          }

          if (recipe) {
            result.title = recipe.name as string | undefined;
            result.description = recipe.description as string | undefined;

            const img = recipe.image;
            if (typeof img === "string") {
              result.imageUrl = img;
            } else if (Array.isArray(img)) {
              result.imageUrl =
                typeof img[0] === "string"
                  ? img[0]
                  : ((img[0] as Record<string, string>)?.url ?? undefined);
            } else if (img && typeof img === "object") {
              result.imageUrl = (img as Record<string, string>).url;
            }

            if (Array.isArray(recipe.recipeIngredient)) {
              result.ingredients = (recipe.recipeIngredient as unknown[]).filter(
                (x): x is string => typeof x === "string",
              );
            }

            // recipeInstructions: string[], HowToStep[], HowToSection[]
            if (Array.isArray(recipe.recipeInstructions)) {
              const steps: string[] = [];
              for (const s of recipe.recipeInstructions as unknown[]) {
                if (typeof s === "string") {
                  const t = s.trim();
                  if (t) steps.push(t);
                } else if (s && typeof s === "object") {
                  const obj = s as Record<string, unknown>;
                  // HowToStep
                  if (typeof obj.text === "string") {
                    const t = obj.text.trim();
                    if (t) steps.push(t);
                  }
                  // HowToSection → itemListElement: HowToStep[]
                  if (Array.isArray(obj.itemListElement)) {
                    for (const sub of obj.itemListElement as unknown[]) {
                      if (sub && typeof sub === "object") {
                        const text = (sub as Record<string, unknown>).text;
                        if (typeof text === "string" && text.trim()) {
                          steps.push(text.trim());
                        }
                      }
                    }
                  }
                }
              }
              result.steps = steps;
            }

            if (recipe.prepTime) {
              const m = parseDuration(String(recipe.prepTime));
              if (m) result.prepTimeMinutes = m;
            }
            if (recipe.cookTime) {
              const m = parseDuration(String(recipe.cookTime));
              if (m) result.cookTimeMinutes = m;
            }
            if (recipe.recipeYield) {
              const raw = Array.isArray(recipe.recipeYield)
                ? String(recipe.recipeYield[0])
                : String(recipe.recipeYield);
              const n = parseInt(raw, 10);
              if (!Number.isNaN(n)) result.servings = n;
            }
            break;
          }
        } catch {
          // skip malformed JSON-LD
        }
      }
    }

    // Fallback to og:tags if no JSON-LD data found
    if (!result.title) {
      const ogTitle = html.match(
        /<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i,
      );
      if (ogTitle) result.title = ogTitle[1];
    }
    if (!result.imageUrl) {
      const ogImage = html.match(
        /<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']*)["']/i,
      );
      if (ogImage) result.imageUrl = ogImage[1];
    }
    if (!result.description) {
      const ogDesc = html.match(
        /<meta[^>]*property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']*)["']/i,
      );
      if (ogDesc) result.description = ogDesc[1];
    }

    // Final fallback: <title>
    if (!result.title) {
      const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleTag?.[1]) result.title = titleTag[1].trim();
    }

    return c.json(result);
  })

  /* ----- single (MUST be AFTER /gz/* and /import-url to avoid
   *        `:id` intercepting static routes like "gz") ----- */
  .get("/:id", (c) => {
    const id = c.req.param("id");
    const row = db.select().from(recipes).where(eq(recipes.id, id)).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(rowToRecipe(row));
  });

function parseDuration(iso: string): number | null {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = parseInt(match[1] ?? "0", 10);
  const minutes = parseInt(match[2] ?? "0", 10);
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}
