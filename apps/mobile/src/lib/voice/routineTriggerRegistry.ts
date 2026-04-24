/**
 * Runtime registry of voice-triggered routines, populated from the backend
 * whenever the panel starts or a routine is edited.
 *
 * The voice command parser is a pure function with no React context. This
 * registry is a module-scoped cache it consults before the built-in keyword
 * rules so user-defined phrases always win over generic matches.
 */

import type { RoutineVoiceTrigger } from "@home-panel/shared";

let _triggers: RoutineVoiceTrigger[] = [];

export function setRoutineTriggers(triggers: RoutineVoiceTrigger[]): void {
  _triggers = triggers;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:]+/g, " ")
    .replace(/['ʼ'`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Try every registered routine phrase against the transcript. The match is
 * keyword-style: the phrase appears as a substring of the normalized input.
 * Returns the routine id of the first match, newest routines first. */
export function matchRoutineTrigger(rawTranscript: string): { routineId: string } | null {
  const normalized = normalize(rawTranscript);
  if (!normalized) return null;

  for (const trigger of _triggers) {
    for (const phrase of trigger.phrases) {
      const np = normalize(phrase);
      if (!np) continue;
      /* Whole-word match: the phrase must appear surrounded by word
       * boundaries to avoid "buon" matching inside "buongiorno". */
      const re = new RegExp(`\\b${escapeRegExp(np)}\\b`);
      if (re.test(normalized)) return { routineId: trigger.routineId };
    }
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
