import { useNavigate } from "react-router-dom";
import { formatTime } from "../../lib/dates";
import { useTodayEvents } from "../../lib/hooks/useCalendar";
import { useT } from "../../lib/useT";
import { CalendarArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

/**
 * Today's events — the list *is* the tile. No 3D illustration, no count
 * number. Each row shows a colored category bar + time + title; the content
 * takes the full width of the tile.
 */
export function TodayEventsTile() {
  const { t } = useT("calendar");
  const navigate = useNavigate();
  const { data } = useTodayEvents();

  const now = Date.now();
  const events = data?.events ?? [];
  const upcoming = events.filter((e) => new Date(e.endsAt).getTime() >= now);
  const visible = upcoming.slice(0, 3);
  const overflow = upcoming.length - visible.length;

  return (
    <Tile size="md" onClick={() => navigate("/calendar")} ariaLabel={t("title")}>
      {/* Calendar art as a discreet anchor in the top-right, not dominant. */}
      <CalendarArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none opacity-90"
      />
      <span
        className="label-mono text-accent absolute top-5 left-6 z-10"
        style={{ fontWeight: 900 }}
      >
        {t("tile.title")}
      </span>

      {visible.length === 0 ? (
        <div className="relative flex h-full items-center px-2 pt-6">
          <p className="font-display text-xl italic text-text-muted leading-tight max-w-[70%]">
            {t("tile.noEvents")}
          </p>
        </div>
      ) : (
        <ul className="relative flex flex-col h-full justify-center gap-2.5 pr-20 md:pr-24 pt-4">
          {visible.map((ev) => (
            <li key={ev.id} className="flex items-center gap-3 min-w-0">
              {/* Colored rail per category — replaces the dot, reads at 3m. */}
              <span
                className="w-[3px] self-stretch rounded-full shrink-0"
                style={{
                  background: ev.categoryColor ?? "var(--color-accent)",
                  opacity: 0.9,
                }}
              />
              <span className="font-display text-lg md:text-xl font-bold tabular-nums tracking-tight text-text-muted shrink-0 w-[3.5rem]">
                {ev.allDay ? "—:—" : formatTime(ev.startsAt)}
              </span>
              <span className="font-medium text-base md:text-lg text-text truncate">
                {ev.title}
              </span>
              {ev.attendeeNames.length > 0 && (
                <span className="text-xs text-text-subtle italic truncate shrink-0 hidden lg:inline">
                  · {ev.attendeeNames.slice(0, 2).join(", ")}
                </span>
              )}
            </li>
          ))}
          {overflow > 0 && (
            <li className="text-xs font-medium text-text-subtle tracking-tight mt-1">
              {t("tile.moreCount", { count: overflow })}
            </li>
          )}
        </ul>
      )}
    </Tile>
  );
}
