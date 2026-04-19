import { WashingMachineIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useLaundryStatus } from "../../lib/hooks/useLaundry";
import { useT } from "../../lib/useT";
import { LaundryArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function LaundryTile() {
  const { t } = useT("laundry");
  const navigate = useNavigate();
  const { data: status } = useLaundryStatus();

  const appliances = status?.appliances ?? [];
  const running = appliances.filter((a) => a.machineState === "run");
  const finished = appliances.filter((a) => a.jobState === "finish");
  const activeCount = running.length + finished.length;

  const hasActivity = activeCount > 0;

  return (
    <Tile size="md" onClick={() => navigate("/laundry")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-mauve-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <div className="relative flex items-center gap-4 h-full z-10">
        <div className="flex flex-col justify-between h-full min-w-0 flex-1">
          <span className="label-mono text-text-muted">{t("title")}</span>
          {hasActivity ? (
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-black tabular-nums leading-none text-text">
                {activeCount}
              </span>
              <span className="text-sm font-medium text-text-muted truncate">
                {finished.length > 0
                  ? t("tile.finished")
                  : t("tile.running", { count: running.length })}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <WashingMachineIcon size={20} weight="duotone" className="text-text-subtle" />
              <span className="text-sm font-medium text-text-muted">{t("tile.idle")}</span>
            </div>
          )}
        </div>
        <LaundryArt size={110} className="shrink-0 pointer-events-none select-none anim-drift" />
      </div>
    </Tile>
  );
}
