import { useNavigate } from "react-router-dom";
import { useNextAlarm, useTimers } from "../../lib/hooks/useTimers";
import { useT } from "../../lib/useT";
import { TimerArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function TimerTile() {
  const { t } = useT("timers");
  const navigate = useNavigate();
  const { data: timers = [] } = useTimers();
  const { data: nextAlarm } = useNextAlarm();

  const running = timers.filter((ti) => ti.status === "running" || ti.status === "paused");
  const soonest = running
    .filter((ti) => ti.status === "running")
    .sort((a, b) => a.remainingSeconds - b.remainingSeconds)[0];

  const isUrgent = soonest && soonest.remainingSeconds <= 10;

  return (
    <Tile size="md" onClick={() => navigate("/timers")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-terracotta-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <TimerArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none opacity-90"
      />
      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("tileLabel")}
        </span>
        <div className="flex flex-col gap-0.5">
          {soonest ? (
            <>
              <span
                className="font-display text-5xl font-black tabular-nums leading-none text-text"
                style={
                  isUrgent ? { animation: "countdown-urgent 1s ease-in-out infinite" } : undefined
                }
              >
                {formatTime(soonest.remainingSeconds)}
              </span>
              {soonest.label ? (
                <p className="text-xs label-italic truncate text-text-muted">{soonest.label}</p>
              ) : running.length > 1 ? (
                <p className="text-xs font-medium text-text-muted">
                  {t("tile.running", { count: running.length })}
                </p>
              ) : null}
            </>
          ) : nextAlarm ? (
            <>
              <span className="font-display text-5xl font-black tabular-nums leading-none text-text">
                {pad2(nextAlarm.hour)}:{pad2(nextAlarm.minute)}
              </span>
              <span className="text-xs label-italic text-text-muted truncate">
                {nextAlarm.label}
              </span>
            </>
          ) : (
            <span className="font-display text-xl italic text-text-muted leading-tight">
              {t("tile.noTimers")}
            </span>
          )}
        </div>
      </div>
    </Tile>
  );
}
