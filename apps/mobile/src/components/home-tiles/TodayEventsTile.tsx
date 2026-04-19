import { useNavigate } from "react-router-dom";
import { formatLongDate, formatTime } from "../../lib/dates";
import { useTodayEvents } from "../../lib/hooks/useCalendar";
import { useT } from "../../lib/useT";
import { CalendarArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function TodayEventsTile() {
  const { t } = useT("calendar");
  const navigate = useNavigate();
  const { data } = useTodayEvents();

  const events = data?.events ?? [];
  const today = new Date();
  const upcoming = events.filter((e) => new Date(e.endsAt) >= today).slice(0, 2);

  return (
    <Tile size="md" onClick={() => navigate("/calendar")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-terracotta-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <div className="relative flex items-center gap-4 h-full z-10">
        <div className="flex flex-col justify-between h-full min-w-0 flex-1">
          <span className="label-mono text-text-muted">Oggi</span>
          <div className="flex flex-col gap-1">
            <p className="label-italic text-base capitalize leading-tight text-text truncate">
              {formatLongDate(today)}
            </p>
            {upcoming.length === 0 ? (
              <p className="text-xs text-text-muted">{t("tile.noEvents")}</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {upcoming.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-1.5 text-text text-xs">
                    {ev.categoryColor && (
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: ev.categoryColor }}
                      />
                    )}
                    <span className="font-display tabular-nums shrink-0 font-bold text-text-muted">
                      {ev.allDay ? "—" : formatTime(ev.startsAt)}
                    </span>
                    <span className="font-medium truncate">{ev.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <CalendarArt size={110} className="shrink-0 pointer-events-none select-none" />
      </div>
    </Tile>
  );
}
