import { useNavigate } from "react-router-dom";
import { useRoutines } from "../../lib/hooks/useRoutines";
import { useT } from "../../lib/useT";
import { LightningArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function RoutinesTile() {
  const { t } = useT("routines");
  const navigate = useNavigate();
  const { data: routines = [] } = useRoutines();

  const activeCount = routines.filter((r) => r.enabled).length;
  const hasRoutines = routines.length > 0;

  return (
    <Tile size="md" onClick={() => navigate("/routines")} ariaLabel={t("tile.title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 100% 0%, var(--tile-ochre-b) 0%, transparent 55%)",
          opacity: hasRoutines ? 0.65 : 0.35,
          transition: "opacity 280ms ease",
        }}
      />

      <LightningArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none anim-drift"
      />

      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("tile.title")}
        </span>

        {hasRoutines ? (
          <div className="flex items-baseline gap-2">
            <span
              className="font-display font-black tabular-nums leading-none text-text"
              style={{ fontSize: "clamp(3.5rem, 7vw, 5.75rem)" }}
            >
              {activeCount}
            </span>
            <span className="text-sm font-medium text-text-muted truncate">
              {t("tile.count", { count: activeCount })}
            </span>
          </div>
        ) : (
          <span className="font-display text-xl italic text-text-muted leading-tight">
            {t("tile.empty")}
          </span>
        )}
      </div>
    </Tile>
  );
}
