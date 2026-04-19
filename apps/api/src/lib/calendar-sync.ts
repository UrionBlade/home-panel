/**
 * Logica di sincronizzazione calendari esterni (ICS/CalDAV).
 * - Fetch ICS da URL
 * - Parse con ics-parser
 * - Upsert eventi nel database (match per externalId + sourceId)
 * - Rimuovi eventi non più presenti nel feed remoto
 * - Scheduler periodico
 */

import { randomUUID } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { type CalendarSourceRow, calendarSources, events } from "../db/schema.js";
import { parseIcs } from "./ics-parser.js";
import { icsRruleToJson } from "./ics-rrule.js";

export async function syncSource(source: CalendarSourceRow): Promise<void> {
  try {
    const response = await fetch(source.url, {
      headers: { "User-Agent": "HomePanel/1.0" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const icsText = await response.text();
    const parsed = parseIcs(icsText);

    const now = new Date().toISOString();
    const seenExternalIds: string[] = [];

    for (const ev of parsed) {
      seenExternalIds.push(ev.uid);

      const existing = db
        .select()
        .from(events)
        .where(and(eq(events.sourceId, source.id), eq(events.externalId, ev.uid)))
        .get();

      const rruleJson = ev.rrule ? icsRruleToJson(ev.rrule) : null;

      if (existing) {
        db.update(events)
          .set({
            title: ev.summary,
            description: ev.description,
            startsAt: ev.dtstart,
            endsAt: ev.dtend,
            allDay: ev.allDay,
            location: ev.location,
            recurrenceRule: rruleJson ? JSON.stringify(rruleJson) : null,
            updatedAt: now,
          })
          .where(eq(events.id, existing.id))
          .run();
      } else {
        db.insert(events)
          .values({
            id: randomUUID(),
            title: ev.summary,
            description: ev.description,
            startsAt: ev.dtstart,
            endsAt: ev.dtend,
            allDay: ev.allDay,
            location: ev.location,
            categoryId: null,
            recurrenceRule: rruleJson ? JSON.stringify(rruleJson) : null,
            reminderMinutes: null,
            sourceId: source.id,
            externalId: ev.uid,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }

    // Remove events no longer present in the remote feed
    if (seenExternalIds.length > 0) {
      db.delete(events)
        .where(and(eq(events.sourceId, source.id), notInArray(events.externalId, seenExternalIds)))
        .run();
    } else {
      // Feed vuoto: rimuovi tutti gli eventi di questa source
      db.delete(events).where(eq(events.sourceId, source.id)).run();
    }

    // Aggiorna stato sync
    db.update(calendarSources)
      .set({ lastSyncAt: now, lastSyncError: null })
      .where(eq(calendarSources.id, source.id))
      .run();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(calendarSources)
      .set({ lastSyncError: message })
      .where(eq(calendarSources.id, source.id))
      .run();
    console.error(`[calendar-sync] Errore sync "${source.name}":`, message);
  }
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export function startSyncScheduler(): void {
  if (schedulerTimer) return;

  // Controlla ogni minuto se qualche source deve essere sincronizzata
  schedulerTimer = setInterval(() => {
    const sources = db
      .select()
      .from(calendarSources)
      .where(eq(calendarSources.enabled, true))
      .all();

    const now = Date.now();
    for (const source of sources) {
      const lastSync = source.lastSyncAt ? new Date(source.lastSyncAt).getTime() : 0;
      const intervalMs = source.syncIntervalMinutes * 60 * 1000;
      if (now - lastSync >= intervalMs) {
        void syncSource(source);
      }
    }
  }, 60_000);

  // Sync iniziale di tutte le source abilitate
  const sources = db.select().from(calendarSources).where(eq(calendarSources.enabled, true)).all();
  for (const source of sources) {
    void syncSource(source);
  }

  console.log(`[calendar-sync] Scheduler avviato, ${sources.length} source attive`);
}

export function stopSyncScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
