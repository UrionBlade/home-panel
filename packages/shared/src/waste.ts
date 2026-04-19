/**
 * Waste schedule — tipi condivisi.
 * Modello generico (rules + exceptions) seedato con regole Besozzo 2026.
 */

export type WasteContainerType = "bag" | "bin";

export interface WasteType {
  id: string;
  displayName: string;
  color: string;
  icon: string;
  containerType: WasteContainerType;
  expositionInstructions: string | null;
  active: boolean;
}

export type WasteFreq = "weekly" | "every-n-days" | "monthly";

export interface WasteRulePattern {
  freq: WasteFreq;
  interval?: number;
  byWeekday?: number[]; // 0=domenica, 6=sabato
  anchorDate: string; // ISO date YYYY-MM-DD
  endsOn?: string;
}

export interface WasteRule {
  id: string;
  wasteTypeId: string;
  pattern: WasteRulePattern;
  expositionTime: string;
  active: boolean;
}

export interface WasteException {
  id: string;
  wasteTypeId: string;
  originalDate: string | null;
  replacementDate: string | null;
  reason: string | null;
  source: "manual" | "ics";
}

export interface WasteCollectionDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  isToday: boolean;
  isTomorrow: boolean;
  wasteTypes: Array<{
    id: string;
    displayName: string;
    color: string;
    icon: string;
    expositionTime: string;
  }>;
}

export interface VoiceWasteResponse {
  date: string;
  dayOfWeek: string;
  wasteTypes: Array<{ id: string; displayName: string }>;
  voiceText: string;
}
