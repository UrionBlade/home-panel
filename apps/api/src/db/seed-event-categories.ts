import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { eventCategories } from "./schema.js";

interface SeedCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

const CATEGORIES: SeedCategory[] = [
  { id: "vet", name: "Veterinario", color: "oklch(72% 0.13 30)", icon: "Stethoscope" },
  { id: "school", name: "Scuola", color: "oklch(72% 0.13 240)", icon: "GraduationCap" },
  { id: "work", name: "Lavoro", color: "oklch(60% 0.10 70)", icon: "Briefcase" },
  { id: "health", name: "Salute", color: "oklch(70% 0.15 5)", icon: "Heartbeat" },
  { id: "birthday", name: "Compleanno", color: "oklch(78% 0.15 320)", icon: "Cake" },
  { id: "family", name: "Famiglia", color: "oklch(72% 0.10 50)", icon: "Users" },
  { id: "other", name: "Altro", color: "oklch(70% 0.04 80)", icon: "Star" },
];

export function seedEventCategories() {
  const existing = db.select({ count: sql<number>`count(*)` }).from(eventCategories).get();
  if (existing && existing.count > 0) return;

  for (const cat of CATEGORIES) {
    db.insert(eventCategories).values(cat).run();
  }
  console.log(`[seed] event_categories: ${CATEGORIES.length} categorie inserite`);
}
