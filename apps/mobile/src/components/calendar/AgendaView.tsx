import type { EventInstance } from "@home-panel/shared";
import { addDays, endOfDay, formatLongDate, isoDate, isSameDay, startOfDay } from "../../lib/dates";
import { useExpandedEvents } from "../../lib/hooks/useCalendar";
import { useT } from "../../lib/useT";
import { EventCard } from "./EventCard";

interface AgendaViewProps {
  onEventClick?: (ev: EventInstance) => void;
}

export function AgendaView({ onEventClick }: AgendaViewProps) {
  const { t } = useT("calendar");
  const today = new Date();
  const from = isoDate(startOfDay(today));
  const to = endOfDay(addDays(today, 30)).toISOString();
  const { data: events = [] } = useExpandedEvents(from, to);

  // Group events by day
  const grouped = new Map<string, typeof events>();
  for (const ev of events) {
    const key = ev.instanceStartsAt.slice(0, 10);
    const list = grouped.get(key) ?? [];
    list.push(ev);
    grouped.set(key, list);
  }
  const sortedKeys = Array.from(grouped.keys()).sort();

  if (events.length === 0) {
    return <p className="text-text-muted text-center py-16">{t("agenda.empty30days")}</p>;
  }

  return (
    <div className="space-y-8">
      {sortedKeys.map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        const isToday = isSameDay(date, new Date());
        return (
          <section key={dateKey}>
            <h3 className={`font-display text-2xl mb-3 ${isToday ? "text-accent" : "text-text"}`}>
              {isToday ? "Oggi · " : ""}
              {formatLongDate(date)}
            </h3>
            <div className="space-y-3">
              {(grouped.get(dateKey) ?? []).map((ev) => (
                <EventCard
                  key={`${ev.id}-${ev.instanceStartsAt}`}
                  event={ev}
                  onClick={onEventClick ? () => onEventClick(ev) : undefined}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
