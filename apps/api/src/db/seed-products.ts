import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { productCatalog } from "./schema.js";

interface SeedProduct {
  name: string;
  category: string;
  defaultUnit: string;
}

const PRODUCTS: SeedProduct[] = [
  // dairy
  { name: "Latte", category: "dairy", defaultUnit: "l" },
  { name: "Yogurt", category: "dairy", defaultUnit: "confezione" },
  { name: "Formaggio", category: "dairy", defaultUnit: "g" },
  { name: "Mozzarella", category: "dairy", defaultUnit: "pz" },
  { name: "Parmigiano", category: "dairy", defaultUnit: "g" },
  { name: "Burro", category: "dairy", defaultUnit: "g" },
  { name: "Panna", category: "dairy", defaultUnit: "ml" },
  { name: "Ricotta", category: "dairy", defaultUnit: "confezione" },
  // bakery
  { name: "Pane", category: "bakery", defaultUnit: "pz" },
  { name: "Pancarré", category: "bakery", defaultUnit: "confezione" },
  { name: "Grissini", category: "bakery", defaultUnit: "confezione" },
  { name: "Crackers", category: "bakery", defaultUnit: "confezione" },
  { name: "Biscotti", category: "bakery", defaultUnit: "confezione" },
  { name: "Cornetti", category: "bakery", defaultUnit: "confezione" },
  // pantry
  { name: "Pasta", category: "pantry", defaultUnit: "g" },
  { name: "Riso", category: "pantry", defaultUnit: "kg" },
  { name: "Farina", category: "pantry", defaultUnit: "kg" },
  { name: "Zucchero", category: "pantry", defaultUnit: "kg" },
  { name: "Sale", category: "pantry", defaultUnit: "kg" },
  { name: "Olio extravergine", category: "pantry", defaultUnit: "l" },
  { name: "Aceto", category: "pantry", defaultUnit: "ml" },
  { name: "Pelati", category: "pantry", defaultUnit: "barattolo" },
  { name: "Tonno", category: "pantry", defaultUnit: "lattina" },
  { name: "Legumi", category: "pantry", defaultUnit: "barattolo" },
  { name: "Fagioli", category: "pantry", defaultUnit: "barattolo" },
  { name: "Ceci", category: "pantry", defaultUnit: "barattolo" },
  { name: "Lenticchie", category: "pantry", defaultUnit: "barattolo" },
  { name: "Caffè", category: "pantry", defaultUnit: "confezione" },
  { name: "Tè", category: "pantry", defaultUnit: "confezione" },
  { name: "Cereali", category: "pantry", defaultUnit: "confezione" },
  { name: "Marmellata", category: "pantry", defaultUnit: "barattolo" },
  { name: "Miele", category: "pantry", defaultUnit: "barattolo" },
  { name: "Cacao", category: "pantry", defaultUnit: "confezione" },
  { name: "Cioccolato", category: "pantry", defaultUnit: "confezione" },
  // fruits
  { name: "Mele", category: "fruits", defaultUnit: "kg" },
  { name: "Banane", category: "fruits", defaultUnit: "kg" },
  { name: "Arance", category: "fruits", defaultUnit: "kg" },
  { name: "Limoni", category: "fruits", defaultUnit: "pz" },
  { name: "Pomodori", category: "fruits", defaultUnit: "kg" },
  { name: "Insalata", category: "fruits", defaultUnit: "busta" },
  { name: "Patate", category: "fruits", defaultUnit: "kg" },
  { name: "Cipolle", category: "fruits", defaultUnit: "kg" },
  { name: "Aglio", category: "fruits", defaultUnit: "pz" },
  { name: "Carote", category: "fruits", defaultUnit: "kg" },
  { name: "Zucchine", category: "fruits", defaultUnit: "kg" },
  { name: "Melanzane", category: "fruits", defaultUnit: "kg" },
  { name: "Peperoni", category: "fruits", defaultUnit: "kg" },
  { name: "Funghi", category: "fruits", defaultUnit: "g" },
  { name: "Spinaci", category: "fruits", defaultUnit: "busta" },
  { name: "Broccoli", category: "fruits", defaultUnit: "pz" },
  { name: "Cavolfiore", category: "fruits", defaultUnit: "pz" },
  { name: "Basilico", category: "fruits", defaultUnit: "pz" },
  { name: "Prezzemolo", category: "fruits", defaultUnit: "pz" },
  { name: "Sedano", category: "fruits", defaultUnit: "pz" },
  // meat
  { name: "Pollo", category: "meat", defaultUnit: "kg" },
  { name: "Manzo", category: "meat", defaultUnit: "kg" },
  { name: "Maiale", category: "meat", defaultUnit: "kg" },
  { name: "Salsiccia", category: "meat", defaultUnit: "kg" },
  { name: "Prosciutto crudo", category: "meat", defaultUnit: "g" },
  { name: "Prosciutto cotto", category: "meat", defaultUnit: "g" },
  { name: "Salame", category: "meat", defaultUnit: "g" },
  { name: "Bresaola", category: "meat", defaultUnit: "g" },
  { name: "Mortadella", category: "meat", defaultUnit: "g" },
  { name: "Speck", category: "meat", defaultUnit: "g" },
  { name: "Pesce", category: "meat", defaultUnit: "kg" },
  { name: "Salmone", category: "meat", defaultUnit: "g" },
  { name: "Uova", category: "meat", defaultUnit: "confezione" },
  // beverages
  { name: "Acqua", category: "beverages", defaultUnit: "bottiglia" },
  { name: "Vino", category: "beverages", defaultUnit: "bottiglia" },
  { name: "Birra", category: "beverages", defaultUnit: "bottiglia" },
  { name: "Succo di frutta", category: "beverages", defaultUnit: "bottiglia" },
  { name: "Coca cola", category: "beverages", defaultUnit: "bottiglia" },
  // frozen
  { name: "Pizza surgelata", category: "frozen", defaultUnit: "pz" },
  { name: "Bastoncini di pesce", category: "frozen", defaultUnit: "confezione" },
  { name: "Verdure surgelate", category: "frozen", defaultUnit: "confezione" },
  { name: "Gelato", category: "frozen", defaultUnit: "confezione" },
  // other
  { name: "Carta igienica", category: "other", defaultUnit: "confezione" },
  { name: "Detersivo piatti", category: "other", defaultUnit: "bottiglia" },
  { name: "Detersivo lavatrice", category: "other", defaultUnit: "confezione" },
  { name: "Sapone", category: "other", defaultUnit: "pz" },
];

export function seedProductCatalog() {
  const existing = db.select({ count: sql<number>`count(*)` }).from(productCatalog).get();
  if (existing && existing.count > 0) return;

  for (const product of PRODUCTS) {
    db.insert(productCatalog)
      .values({
        id: randomUUID(),
        name: product.name,
        category: product.category,
        defaultUnit: product.defaultUnit,
      })
      .run();
  }
  console.log(`[seed] product_catalog: ${PRODUCTS.length} prodotti inseriti`);
}
