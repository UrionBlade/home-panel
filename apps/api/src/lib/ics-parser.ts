/**
 * Lightweight ICS parser — extracts VEVENT from iCalendar text (RFC 5545).
 * No external dependencies. Handles SUMMARY, DTSTART, DTEND, DESCRIPTION,
 * LOCATION, UID, RRULE with DATE and DATE-TIME (with and without timezone).
 */

export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  dtstart: string; // ISO 8601
  dtend: string; // ISO 8601
  allDay: boolean;
  rrule: string | null; // raw RRULE value (es. FREQ=WEEKLY;INTERVAL=2)
}

/**
 * Converts a DTSTART/DTEND ICS value to ISO 8601.
 * Supported formats:
 *  - 20260407           (DATE — allDay)
 *  - 20260407T100000    (local datetime)
 *  - 20260407T100000Z   (UTC)
 *  - TZID=Europe/Rome:20260407T100000 (with timezone)
 */
const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getCachedDTF(tz: string): Intl.DateTimeFormat {
  let dtf = dtfCache.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    dtfCache.set(tz, dtf);
  }
  return dtf;
}

function icsDateToISO(raw: string): { iso: string; allDay: boolean } {
  // Extract TZID if present (e.g. "TZID=Europe/Rome:20260407T100000")
  let tzid: string | null = null;
  let value = raw;
  const tzMatch = raw.match(/^TZID=([^:]+):(.+)$/);
  if (tzMatch?.[1] && tzMatch[2]) {
    tzid = tzMatch[1];
    value = tzMatch[2];
  } else {
    const colonIdx = raw.indexOf(":");
    if (colonIdx !== -1) value = raw.slice(colonIdx + 1);
  }

  // DATE only: 8 digits
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00.000Z`, allDay: true };
  }

  // DATE-TIME: 15 digits + optional Z
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (match) {
    const [, y, mo, d, h, mi, s, z] = match;

    if (z === "Z") {
      // Already UTC
      return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, allDay: false };
    }

    if (tzid) {
      // Has a timezone — compute offset to convert to UTC.

      // Probe noon UTC on the same day to get the timezone offset.
      try {
        const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0));
        const utcParts = getCachedDTF("UTC").formatToParts(probe);
        const tzParts = getCachedDTF(tzid).formatToParts(probe);

        const utcH = Number(utcParts.find((p) => p.type === "hour")?.value ?? 0);
        const utcM = Number(utcParts.find((p) => p.type === "minute")?.value ?? 0);
        const tzH = Number(tzParts.find((p) => p.type === "hour")?.value ?? 0);
        const tzM = Number(tzParts.find((p) => p.type === "minute")?.value ?? 0);
        const offsetMinutes = (tzH - utcH) * 60 + (tzM - utcM);

        // Local date minus offset = UTC
        const localMs = Date.UTC(
          Number(y),
          Number(mo) - 1,
          Number(d),
          Number(h),
          Number(mi),
          Number(s),
        );
        const utcMs = localMs - offsetMinutes * 60_000;
        return { iso: new Date(utcMs).toISOString(), allDay: false };
      } catch {
        return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, allDay: false };
      }
    }

    // No timezone, no Z — treat as UTC (fallback)
    return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}Z`, allDay: false };
  }

  // Fallback: return raw as string
  return { iso: value, allDay: false };
}

/**
 * Unfold ICS lines (RFC 5545 §3.1): lines starting with space/tab
 * are continuations of the previous line.
 */
function unfoldLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

/**
 * Extracts the value of an ICS property from a line, handling parameters.
 * Es. "DTSTART;TZID=Europe/Rome:20260407T100000" → "TZID=Europe/Rome:20260407T100000"
 * Es. "SUMMARY:Riunione" → "Riunione"
 */
function propValue(line: string, propName: string): string | null {
  // Property may have params: PROPNAME;PARAM=...:value or PROPNAME:value
  const upper = line.toUpperCase();
  if (!upper.startsWith(propName.toUpperCase())) return null;
  const afterName = line.charAt(propName.length);
  if (afterName !== ":" && afterName !== ";") return null;

  if (afterName === ":") {
    return line.slice(propName.length + 1);
  }
  // Has params — return full "params:value" for DTSTART/DTEND, value only for others
  return line.slice(propName.length + 1);
}

/**
 * Unescape ICS values.
 */
function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\\\/g, "\\");
}

/**
 * Extracts the raw value (after the colon) from a string that may contain parameters.
 */
function extractValueAfterColon(raw: string): string {
  const idx = raw.indexOf(":");
  return idx !== -1 ? raw.slice(idx + 1) : raw;
}

export function parseIcs(icsText: string): ParsedIcsEvent[] {
  const lines = unfoldLines(icsText);
  const events: ParsedIcsEvent[] = [];

  let inEvent = false;
  let uid = "";
  let summary = "";
  let description: string | null = null;
  let location: string | null = null;
  let dtstartRaw = "";
  let dtendRaw = "";
  let rrule: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      uid = "";
      summary = "";
      description = null;
      location = null;
      dtstartRaw = "";
      dtendRaw = "";
      rrule = null;
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (inEvent && uid && summary && dtstartRaw) {
        const start = icsDateToISO(dtstartRaw);
        const end = dtendRaw ? icsDateToISO(dtendRaw) : { iso: start.iso, allDay: start.allDay };

        events.push({
          uid,
          summary,
          description,
          location,
          dtstart: start.iso,
          dtend: end.iso,
          allDay: start.allDay,
          rrule,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const uidVal = propValue(trimmed, "UID");
    if (uidVal !== null) {
      uid = extractValueAfterColon(uidVal);
      continue;
    }

    const sumVal = propValue(trimmed, "SUMMARY");
    if (sumVal !== null) {
      summary = unescapeIcs(extractValueAfterColon(sumVal));
      continue;
    }

    const descVal = propValue(trimmed, "DESCRIPTION");
    if (descVal !== null) {
      description = unescapeIcs(extractValueAfterColon(descVal));
      continue;
    }

    const locVal = propValue(trimmed, "LOCATION");
    if (locVal !== null) {
      location = unescapeIcs(extractValueAfterColon(locVal));
      continue;
    }

    const dtStartVal = propValue(trimmed, "DTSTART");
    if (dtStartVal !== null) {
      dtstartRaw = dtStartVal;
      continue;
    }

    const dtEndVal = propValue(trimmed, "DTEND");
    if (dtEndVal !== null) {
      dtendRaw = dtEndVal;
      continue;
    }

    const rruleVal = propValue(trimmed, "RRULE");
    if (rruleVal !== null) {
      rrule = extractValueAfterColon(rruleVal);
    }
  }

  return events;
}
