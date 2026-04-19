import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./client.js";
import { wasteExceptions, wasteRules, wasteTypes } from "./schema.js";

interface SeedType {
  id: string;
  displayName: string;
  color: string;
  icon: string;
  containerType: "bag" | "bin";
  expositionInstructions: string;
  active: boolean;
}

const TYPES: SeedType[] = [
  {
    id: "secco",
    displayName: "Secco non riciclabile",
    color: "oklch(50% 0.02 70)",
    icon: "TrashSimple",
    containerType: "bag",
    expositionInstructions: "Sacchi RFID grigi forniti dal Comune, max 7-8kg",
    active: true,
  },
  {
    id: "umido",
    displayName: "Umido",
    color: "oklch(50% 0.10 60)",
    icon: "Leaf",
    containerType: "bin",
    expositionInstructions: "Contenitore marrone con coperchio. Sacchetti compostabili",
    active: true,
  },
  {
    id: "plastica",
    displayName: "Plastica",
    color: "oklch(80% 0.15 90)",
    icon: "Bottle",
    containerType: "bag",
    expositionInstructions: "Sacchi gialli trasparenti",
    active: true,
  },
  {
    id: "vetro_lattine",
    displayName: "Vetro e lattine",
    color: "oklch(60% 0.13 150)",
    icon: "Wine",
    containerType: "bin",
    expositionInstructions: "Contenitore verde con coperchio e manico. Niente sacchetti",
    active: true,
  },
  {
    id: "carta",
    displayName: "Carta e cartone",
    color: "oklch(58% 0.13 240)",
    icon: "Newspaper",
    containerType: "bin",
    expositionInstructions: "Contenitore blu o legata. Max 7-8kg",
    active: true,
  },
  {
    id: "verde",
    displayName: "Verde / scarti vegetali",
    color: "oklch(65% 0.13 130)",
    icon: "Plant",
    containerType: "bin",
    expositionInstructions: "Servizio a pagamento. Contenitore carrellato giallo 240L",
    active: true,
  },
  {
    id: "pannolini",
    displayName: "Pannolini",
    color: "oklch(70% 0.15 25)",
    icon: "Baby",
    containerType: "bag",
    expositionInstructions: "Servizio opt-in (richiedi al Comune). Sacchi rossi forniti, max 7-8kg",
    active: false,
  },
];

interface SeedRule {
  id: string;
  wasteTypeId: string;
  pattern: object;
}

const RULES: SeedRule[] = [
  // WET WASTE: every Tuesday + every Friday
  {
    id: "rule-umido-besozzo-2026",
    wasteTypeId: "umido",
    pattern: {
      freq: "weekly",
      byWeekday: [2, 5],
      anchorDate: "2026-01-06",
    },
  },
  // PAPER: every Friday
  {
    id: "rule-carta-besozzo-2026",
    wasteTypeId: "carta",
    pattern: {
      freq: "weekly",
      byWeekday: [5],
      anchorDate: "2026-01-02",
    },
  },
  // PLASTIC: every Friday
  {
    id: "rule-plastica-besozzo-2026",
    wasteTypeId: "plastica",
    pattern: {
      freq: "weekly",
      byWeekday: [5],
      anchorDate: "2026-01-02",
    },
  },
  // DRY WASTE: every 14 days from Jan 6 2026 (Tuesday)
  {
    id: "rule-secco-besozzo-2026",
    wasteTypeId: "secco",
    pattern: {
      freq: "every-n-days",
      interval: 14,
      anchorDate: "2026-01-06",
    },
  },
  // VETRO E LATTINE: ogni 14gg dal 13 gennaio 2026 (martedì, sfasato di 7gg dal secco)
  {
    id: "rule-vetro-besozzo-2026",
    wasteTypeId: "vetro_lattine",
    pattern: {
      freq: "every-n-days",
      interval: 14,
      anchorDate: "2026-01-13",
    },
  },
];

interface SeedException {
  id: string;
  wasteTypeId: string;
  originalDate: string | null;
  replacementDate: string | null;
  reason: string;
}

const EXCEPTIONS: SeedException[] = [
  {
    id: "exc-besozzo-natale-plastica-2025",
    wasteTypeId: "plastica",
    originalDate: "2025-12-25",
    replacementDate: "2025-12-23",
    reason: "Spostamento per Natale",
  },
  {
    id: "exc-besozzo-natale-carta-2025",
    wasteTypeId: "carta",
    originalDate: "2025-12-25",
    replacementDate: "2025-12-26",
    reason: "Spostamento per Natale",
  },
  {
    id: "exc-besozzo-1mag-plastica-2026",
    wasteTypeId: "plastica",
    originalDate: "2026-05-01",
    replacementDate: "2026-04-29",
    reason: "Spostamento per Festa del Lavoro",
  },
];

export function seedBesozzo2026() {
  const existing = db.select({ count: sql<number>`count(*)` }).from(wasteTypes).get();
  if (existing && existing.count > 0) return;

  for (const t of TYPES) {
    db.insert(wasteTypes).values(t).run();
  }
  for (const r of RULES) {
    db.insert(wasteRules)
      .values({
        id: r.id,
        wasteTypeId: r.wasteTypeId,
        pattern: JSON.stringify(r.pattern),
        expositionTime: "20:00",
        active: true,
      })
      .run();
  }
  for (const e of EXCEPTIONS) {
    db.insert(wasteExceptions)
      .values({
        ...e,
        source: "manual",
      })
      .run();
  }
  // Suppress unused
  void randomUUID;
  console.log(
    `[seed] besozzo: ${TYPES.length} tipi, ${RULES.length} regole, ${EXCEPTIONS.length} eccezioni`,
  );
}
