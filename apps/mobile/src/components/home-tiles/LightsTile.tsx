import { useNavigate } from "react-router-dom";
import { useLights } from "../../lib/hooks/useLights";
import { useT } from "../../lib/useT";
import { LightbulbArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function LightsTile() {
  const { t } = useT("lights");
  const navigate = useNavigate();
  const { data: lights = [] } = useLights();

  const onCount = lights.filter((l) => l.state === "on").length;
  const hasLights = lights.length > 0;
  const anyOn = onCount > 0;

  return (
    <Tile size="md" onClick={() => navigate("/lights")} ariaLabel={t("tile.title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-ochre-b) 0%, transparent 55%)",
          opacity: anyOn ? 0.7 : 0.4,
          transition: "opacity 280ms ease",
        }}
      />

      <LightbulbArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none anim-drift"
        /* Dim the bulb when nothing is on so the tile reads "all off" at a glance. */
      />
      {!anyOn && (
        <div
          aria-hidden
          className="absolute top-2 right-2 w-[74px] h-[74px] pointer-events-none rounded-full bg-surface/55"
        />
      )}

      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("tile.title")}
        </span>

        {hasLights ? (
          <div className="flex items-baseline gap-2">
            <span
              className="font-display font-black tabular-nums leading-none text-text"
              style={{ fontSize: "clamp(3.5rem, 7vw, 5.75rem)" }}
            >
              {onCount}
            </span>
            <span className="text-sm font-medium text-text-muted truncate">
              {anyOn ? t("tile.on", { count: onCount }) : t("tile.allOff")}
            </span>
          </div>
        ) : (
          <span className="font-display text-xl italic text-text-muted leading-tight">
            {t("tile.noDevices")}
          </span>
        )}
      </div>
    </Tile>
  );
}
