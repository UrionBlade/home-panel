/**
 * Recipes — tipi condivisi tra mobile e api.
 * Ricettario di famiglia con preferiti e import da URL.
 */

export type RecipeDifficulty = "facile" | "medio" | "difficile";

/**
 * Singolo passaggio di una ricetta locale: testo + immagini opzionali.
 * Le immagini sono URL assoluti remoti (es. CDN GialloZafferano) — non
 * vengono mai duplicate nel nostro storage.
 *
 * Storato in DB come JSON array; quando il backend riceve un legacy
 * `string` lo normalizza a `{ text, images: [] }`.
 */
export interface RecipeStep {
  text: string;
  images: string[];
}

export interface Recipe {
  id: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  imageUrl: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  difficulty: RecipeDifficulty | null;
  ingredients: string[];
  steps: RecipeStep[];
  tags: string[];
  favorite: boolean;
  notes: string | null;
  /** "Consiglio" del sito sorgente (es. GialloZafferano), distinto da `notes`. */
  tips: string | null;
  /** "Conservazione" del sito sorgente. */
  conservation: string | null;
}

export interface CreateRecipeInput {
  title: string;
  description?: string;
  sourceUrl?: string;
  sourceName?: string;
  imageUrl?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  difficulty?: RecipeDifficulty;
  ingredients?: string[];
  /** Accetta sia stringhe semplici (form manuale) sia step ricchi
   *  (import da GZ con immagini). Il backend normalizza. */
  steps?: Array<string | RecipeStep>;
  tags?: string[];
  notes?: string;
  tips?: string;
  conservation?: string;
}

export interface UpdateRecipeInput extends Partial<CreateRecipeInput> {
  favorite?: boolean;
}

export interface ImportedRecipeData {
  title?: string;
  description?: string;
  imageUrl?: string;
  sourceName?: string;
  ingredients?: string[];
  steps?: string[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
}

/**
 * Ingrediente con quantità separata, estratto dal markup strutturato di
 * giallozafferano.it. Sia `quantity` che `unit` sono opzionali perché
 * per ingredienti tipo "Pepe nero" la quantità è "q.b." o assente.
 */
export interface GialloZafferanoIngredient {
  name: string;
  quantity: string | null;
}

/**
 * Singolo passaggio della ricetta, con testo e lista di immagini.
 * Le immagini sono URL assoluti (già normalizzati dal backend).
 */
export interface GialloZafferanoStep {
  index: number;
  text: string;
  images: string[];
}

/**
 * Dettaglio completo di una ricetta di giallozafferano.it — merge di
 * dati JSON-LD e scraping HTML (per ingredienti con quantità e
 * immagini per step, che non sono nel JSON-LD).
 *
 * Ritornato da `GET /recipes/gz/details?url=...`.
 */
export interface GialloZafferanoRecipeDetails {
  title: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  difficulty: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  servings: number | null;
  ingredients: GialloZafferanoIngredient[];
  steps: GialloZafferanoStep[];
  notes: string | null;
  tips: string | null;
  conservation: string | null;
  sourceUrl: string;
}

/**
 * Risultato di ricerca su giallozafferano.it.
 * Dati estratti dai card della pagina `/ricerca-ricette/{query}/`.
 * Per il dettaglio completo (ingredienti, passaggi, tempi) si richiama
 * poi `POST /recipes/import-url` con `url`.
 *
 * I campi `description`, `totalTimeMinutes`, `difficulty` sono presenti
 * solo sui card "orizzontali" (risultati principali). I card "verticali"
 * (carosello correlate) hanno solo titolo, immagine, rating e commenti.
 */
export interface GialloZafferanoSearchResult {
  title: string;
  url: string;
  imageUrl: string | null;
  description: string | null;
  category: string | null;
  totalTimeMinutes: number | null;
  difficulty: string | null;
  rating: number | null;
  comments: number | null;
}
