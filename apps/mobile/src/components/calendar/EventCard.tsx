import type { CalendarEvent, EventAttendee, EventInstance } from "@home-panel/shared";
import { ClockIcon, MapPinIcon } from "@phosphor-icons/react";
import { EventDescription } from "./EventDescription";

interface EventCardProps {
  event: CalendarEvent | EventInstance;
  variant?: "compact" | "full";
  onClick?: () => void;
}

function formatTimeRange(start: string, end: string, allDay: boolean): string {
  if (allDay) return "Tutto il giorno";
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${fmt(s)} – ${fmt(e)}`;
}

/** Colore evento: attendees > category > source > accent */
export function eventColor(event: CalendarEvent | EventInstance): string {
  const attendeeColors = event.attendees.map((a) => a.accentColor).filter((c): c is string => !!c);
  if (attendeeColors.length === 1 && attendeeColors[0]) return attendeeColors[0];
  return event.category?.color ?? event.sourceColor ?? "var(--color-accent)";
}

/** Background for events with multiple attendees: gradient using their colors */
export function eventBackground(event: CalendarEvent | EventInstance): string {
  const attendeeColors = event.attendees.map((a) => a.accentColor).filter((c): c is string => !!c);
  if (attendeeColors.length >= 2) {
    return `linear-gradient(135deg, ${attendeeColors.join(", ")})`;
  }
  return eventColor(event);
}

/**
 * Estimates a color's brightness (oklch or hex) and returns the appropriate text color.
 * oklch: reads the L% directly. Hex: computes relative luminance.
 */
function srgb(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function contrastText(color: string): string {
  // oklch(62% 0.19 250) → L = 62% lightness
  const oklchMatch = color.match(/oklch\(\s*([\d.]+)%/);
  if (oklchMatch) {
    return Number(oklchMatch[1]) > 65 ? "#1a1a1a" : "#ffffff";
  }
  // hex → relative luminance via sRGB linearization
  const hex = color.replace("#", "");
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = srgb(parseInt(hex.slice(0, 2), 16) / 255);
    const g = srgb(parseInt(hex.slice(2, 4), 16) / 255);
    const b = srgb(parseInt(hex.slice(4, 6), 16) / 255);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.18 ? "#1a1a1a" : "#ffffff";
  }
  return "#ffffff";
}

/** Average contrast text color for multi-attendee gradients */
function contrastTextForAttendees(attendees: EventAttendee[]): string {
  const colors = attendees.map((a) => a.accentColor).filter((c): c is string => !!c);
  if (colors.length === 0) return "#ffffff";
  // Average lightness across attendee colors
  let totalL = 0;
  let count = 0;
  for (const c of colors) {
    const m = c.match(/oklch\(\s*([\d.]+)%/);
    if (m) {
      totalL += Number(m[1]);
      count++;
    }
  }
  if (count > 0) return totalL / count > 65 ? "#1a1a1a" : "#ffffff";
  return contrastText(colors[0] ?? "#ffffff");
}

/** Colore testo adatto per un evento */
export function contrastTextForEvent(event: CalendarEvent | EventInstance): string {
  const bg = eventBackground(event);
  const isGradient = bg.startsWith("linear-gradient");
  return isGradient ? contrastTextForAttendees(event.attendees) : contrastText(eventColor(event));
}

export function EventCard({ event, variant = "full", onClick }: EventCardProps) {
  const color = eventColor(event);
  const bg = eventBackground(event);
  const isGradient = bg.startsWith("linear-gradient");
  const txtColor = isGradient ? contrastTextForAttendees(event.attendees) : contrastText(color);
  const start = "instanceStartsAt" in event ? event.instanceStartsAt : event.startsAt;
  const end = "instanceEndsAt" in event ? event.instanceEndsAt : event.endsAt;

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full text-xs px-2 py-1 rounded-xs truncate text-left hover:opacity-90"
        style={{
          background: bg,
          color: txtColor,
        }}
        title={event.title}
      >
        {event.title}
      </button>
    );
  }

  const Wrapper = onClick ? "button" : "article";

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className="w-full text-left rounded-lg bg-surface border border-border p-5 hover:shadow-md transition-shadow"
      style={{
        borderLeftWidth: "4px",
        borderLeftColor: isGradient ? undefined : color,
        borderImage: isGradient ? `${bg} 1` : undefined,
        borderImageSlice: isGradient ? "1" : undefined,
      }}
    >
      <header className="flex items-start justify-between gap-4 mb-3">
        <h3 className="font-display text-2xl">{event.title}</h3>
        {event.category && (
          <span
            className="text-xs px-2 py-1 rounded-xs"
            style={{
              background: bg,
              color: txtColor,
            }}
          >
            {event.category.name}
          </span>
        )}
      </header>

      <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
        <ClockIcon size={16} weight="duotone" />
        <span>{formatTimeRange(start, end, event.allDay)}</span>
      </div>

      {event.location && (
        <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
          <MapPinIcon size={16} weight="duotone" />
          <span>{event.location}</span>
        </div>
      )}

      {event.description ? <EventDescription description={event.description} /> : null}

      {event.attendees.length > 0 && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {event.attendees.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: a.accentColor
                  ? `color-mix(in oklch, ${a.accentColor} 15%, transparent)`
                  : "var(--color-surface)",
                color: a.accentColor ?? "var(--color-text-muted)",
                border: `1.5px solid ${a.accentColor ? `color-mix(in oklch, ${a.accentColor} 40%, transparent)` : "var(--color-border)"}`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: a.accentColor ?? "var(--color-accent)",
                }}
              />
              {a.displayName}
            </span>
          ))}
        </div>
      )}
    </Wrapper>
  );
}
