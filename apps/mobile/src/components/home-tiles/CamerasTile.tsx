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

      <CameraArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none opacity-90"
      />
      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("title")}
        </span>
        {!status?.configured ? (
          <span className="font-display text-xl italic text-text-muted leading-tight">
            {t("tile.notConfigured")}
          </span>
        ) : (
          <div className="flex flex-col gap-1">
            <span
              className="font-display font-black tabular-nums leading-none text-text"
              style={{ fontSize: "clamp(3.5rem, 7vw, 5.75rem)" }}
            >
              {cameras.length}
            </span>
            {onlineCount > 0 && (
              <span className="text-xs font-medium text-text-muted flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sage animate-pulse" />
                {onlineCount} {String(t("status.online")).toLowerCase()}
              </span>
            )}
          </div>
        )}
      </div>
    </Tile>
  );
}
