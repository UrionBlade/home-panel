import { useNavigate } from "react-router-dom";
import { useBlinkStatus, useCameras } from "../../lib/hooks/useBlink";
import { useT } from "../../lib/useT";
import { CameraArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function CamerasTile() {
  const { t } = useT("cameras");
  const navigate = useNavigate();
  const { data: status } = useBlinkStatus();
  const { data: cameras = [] } = useCameras();

  const onlineCount = cameras.filter((c) => c.status === "online").length;

  return (
    <Tile size="md" onClick={() => navigate("/cameras")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 100% 100%, var(--tile-sky-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <div className="relative flex items-center gap-4 h-full z-10">
        <div className="flex flex-col justify-between h-full min-w-0 flex-1">
          <span className="label-mono text-text-muted">{t("title")}</span>
          {status?.configured ? (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-5xl font-black tabular-nums leading-none text-text">
                  {cameras.length}
                </span>
                <span className="text-sm font-medium text-text-muted">
                  {t("tile.count", { count: cameras.length })}
                </span>
              </div>
              {onlineCount > 0 && (
                <span className="text-xs font-medium text-text-muted flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
                  {onlineCount} {String(t("status.online")).toLowerCase()}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-text-muted">{t("tile.notConfigured")}</span>
          )}
        </div>
        <CameraArt size={110} className="shrink-0 pointer-events-none select-none" />
      </div>
    </Tile>
  );
}
