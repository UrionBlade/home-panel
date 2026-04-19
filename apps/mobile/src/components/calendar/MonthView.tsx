import type { EventInstance } from "@home-panel/shared";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  endOfDay,
  endOfMonth,
  isoDate,
  isSameDay,
  monthGrid,
  monthLabel,
  startOfDay,
  startOfMonth,
} from "../../lib/dates";
import { useExpandedEvents } from "../../lib/hooks/useCalendar";
import { IconButton } from "../ui/IconButton";
import { contrastTextForEvent, eventBackground } from "./EventCard";

const DAY_HEADERS = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

interface MonthViewProps {
  onEventClick?: (event: EventInstance) => void;
}

export function MonthView({ onEventClick }: MonthViewProps) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));

  const grid = monthGrid(cursor);
  const firstDay = grid[0]?.[0] ?? cursor;
  const lastDay = grid[5]?.[6] ?? grid[grid.length - 1]?.[6] ?? cursor;
  const from = isoDate(startOfDay(firstDay));
  const to = endOfDay(lastDay).toISOString();
  const { data: events = [] } = useExpandedEvents(from, to);

  const eventsByDay = new Map<string, EventInstance[]>();
  for (const ev of events) {
    const key = ev.instanceStartsAt.slice(0, 10);
    const list = eventsByDay.get(key) ?? [];
    list.push(ev);
    eventsByDay.set(key, list);
  }

  const today = new Date();
  const isCurrentMonth = (d: Date) => d.getMonth() === cursor.getMonth();

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <h2 className="font-display text-3xl capitalize">
          {monthLabel(cursor)} {cursor.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <IconButton
            icon={<CaretLeftIcon size={24} />}
            label="Mese precedente"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          />
          <IconButton
            icon={<CaretRightIcon size={24} />}
            label="Mese successivo"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          />
        </div>
      </header>

      <div className="grid grid-cols-7 gap-2 text-text-muted text-sm font-medium">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {grid.flat().map((day) => {
          const isToday = isSameDay(day, today);
          const inMonth = isCurrentMonth(day);
          const dayEvents = eventsByDay.get(isoDate(day)) ?? [];
          return (
            <div
              key={day.toISOString()}
              className={`min-h-[110px] rounded-md border p-2 flex flex-col gap-1 ${
                inMonth
                  ? "bg-surface border-border"
                  : "bg-transparent border-transparent opacity-40"
              } ${isToday ? "ring-2 ring-accent" : ""}`}
            >
              <span className={`text-sm font-medium ${isToday ? "text-accent" : "text-text"}`}>
                {day.getDate()}
              </span>
              {dayEvents.slice(0, 3).map((ev) => (
                <button
                  key={`${ev.id}-${ev.instanceStartsAt}`}
                  type="button"
                  onClick={() => onEventClick?.(ev)}
                  className="text-xs px-1.5 py-0.5 rounded truncate text-left hover:opacity-80 transition-opacity w-full"
                  style={{
                    background: eventBackground(ev),
                    color: contrastTextForEvent(ev),
                  }}
                  title={ev.title}
                >
                  {ev.title}
                </button>
              ))}
              {dayEvents.length > 3 && (
                <span className="text-xs text-text-subtle">+{dayEvents.length - 3}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

void endOfMonth;
