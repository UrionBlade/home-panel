/**
 * Family calendar — tipi condivisi.
 * Subset semplice di RRULE: niente RFC 5545 completo.
 */

export type RecurrenceFreq = "daily" | "weekly" | "monthly" | "yearly" | "every-n-days";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval?: number;
  byWeekday?: number[]; // 0=domenica, 6=sabato
  byMonthDay?: number;
  endsOn?: string; // ISO date
  count?: number;
}

export interface EventCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
}

export interface EventAttendee {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  accentColor: string | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  categoryId: string | null;
  category?: EventCategory | null;
  recurrenceRule: RecurrenceRule | null;
  reminderMinutes: number | null;
  attendees: EventAttendee[];
  sourceId: string | null;
  sourceColor: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Istanza espansa di un evento ricorrente per una data specifica.
 */
export interface EventInstance extends CalendarEvent {
  instanceStartsAt: string;
  instanceEndsAt: string;
}

export interface CreateEventInput {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  location?: string | null;
  categoryId?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  reminderMinutes?: number | null;
  attendeeIds?: string[];
}

export interface UpdateEventInput {
  title?: string;
  description?: string | null;
  startsAt?: string;
  endsAt?: string;
  allDay?: boolean;
  location?: string | null;
  categoryId?: string | null;
  recurrenceRule?: RecurrenceRule | null;
  reminderMinutes?: number | null;
  attendeeIds?: string[];
}

/* ---- Calendar sources (iCal/CalDAV sync) ---- */

export interface CalendarSource {
  id: string;
  name: string;
  url: string;
  type: "ics" | "caldav";
  color: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  syncIntervalMinutes: number;
}

export interface CreateCalendarSourceInput {
  name: string;
  url: string;
  type?: "ics" | "caldav";
  color?: string;
  syncIntervalMinutes?: number;
}

export interface UpdateCalendarSourceInput {
  name?: string;
  url?: string;
  type?: "ics" | "caldav";
  color?: string;
  enabled?: boolean;
  syncIntervalMinutes?: number;
}

export interface VoiceEventsResponse {
  date: string;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    categoryName: string | null;
    categoryColor: string | null;
    attendeeNames: string[];
  }>;
}
