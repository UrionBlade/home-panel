import type { EventInstance } from "@home-panel/shared";
import { addDays, endOfDay, isoDate, startOfDay } from "../../lib/dates";
import { useExpandedEvents } from "../../lib/hooks/useCalendar";
import { useT } from "../../lib/useT";
import { EventCard } from "./EventCard";

interface TodayViewProps {
  onEventClick?: (ev: EventInstance) => void;
}

export function TodayView({ onEventClick }: TodayViewProps) {
  const { t } = useT("calendar");
  const { t: tCommon } = useT("common");
  const today = new Date();
  const from = isoDate(startOfDay(today));
  const to = endOfDay(addDays(today, 0)).toISOString();

  const { data: events = [], isLoading } = useExpandedEvents(from, to);

  if (isLoading) {
    return <p className="text-text-muted">{tCommon("states.loading")}</p>;
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-display text-3xl">{t("today.noEvents")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-3xl">{t("today.header")}</h2>
      {events.map((ev) => (
        <EventCard
          key={`${ev.id}-${ev.instanceStartsAt}`}
          event={ev}
          onClick={onEventClick ? () => onEventClick(ev) : undefined}
        />
      ))}
    </div>
  );
}
