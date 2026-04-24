import type { EventInstance } from "@home-panel/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { addDays, endOfDay, formatTime, isoDate, startOfDay } from "../../lib/dates";
import { useExpandedEvents } from "../../lib/hooks/useCalendar";
import { useT } from "../../lib/useT";
import { CalendarArt } from "../illustrations/TileArt";
import { Button } from "../ui/Button";
import { EventCard } from "./EventCard";

interface TodayViewProps {
  onEventClick?: (ev: EventInstance) => void;
  /** Opens the create-event flow; passed down from CalendarPage. */
  onCreateEvent?: () => void;
}

export function TodayView({ onEventClick, onCreateEvent }: TodayViewProps) {
  const { t } = useT("calendar");
  const { t: tCommon } = useT("common");
  const today = new Date();
  const from = isoDate(startOfDay(today));
  const to = endOfDay(addDays(today, 0)).toISOString();

  // Upcoming 7 days (starting tomorrow) — used in the empty state chip.
  const upcomingFrom = isoDate(addDays(today, 1));
  const upcomingTo = endOfDay(addDays(today, 7)).toISOString();

  const { data: events = [], isLoading } = useExpandedEvents(from, to);
  const { data: upcoming = [] } = useExpandedEvents(upcomingFrom, upcomingTo);

  if (isLoading) {
    return <p className="text-text-muted">{tCommon("states.loading")}</p>;
  }

  if (events.length === 0) {
    // Pick the next closest upcoming event (already sorted by instanceStartsAt from API).
    const nextEvent = upcoming[0];
    let nextChip: string;
    if (nextEvent) {
      const d = new Date(nextEvent.instanceStartsAt);
      // Locale-aware short weekday + day number using the app's date helpers.
      const dayLabel = d.toLocaleDateString(undefined, { weekday: "long", day: "numeric" });
      const timeLabel = nextEvent.allDay ? "" : `, ${formatTime(nextEvent.instanceStartsAt)}`;
      nextChip = t("today.next", {
        day: dayLabel,
        title: nextEvent.title,
        time: timeLabel,
      });
    } else {
      nextChip = t("today.noUpcoming");
    }

    return (
      <div className="flex flex-col items-center pt-24 gap-6 flex-1">
        <CalendarArt size={96} />
        <p className="font-display italic font-light text-2xl text-center max-w-md text-text">
          {t("today.noEvents")}
        </p>
        <p className="text-sm text-text-muted text-center max-w-sm">{nextChip}</p>
        {onCreateEvent && (
          <Button
            variant="ghost"
            size="md"
            iconLeft={<PlusIcon size={20} weight="bold" />}
            onClick={onCreateEvent}
            className="border-accent/50 text-accent hover:bg-accent/10"
          >
            {t("today.cta")}
          </Button>
        )}
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
