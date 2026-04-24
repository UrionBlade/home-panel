import type { IpCamera } from "@home-panel/shared";
import { PlayCircleIcon, SpinnerIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ipCameraSnapshotUrl } from "../../lib/ipCameras/snapshotUrl";
import { startWhepSession, type WhepSession } from "../../lib/ipCameras/webrtc";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import { useT } from "../../lib/useT";

/**
 * Live view per IP camera — WebRTC con fallback snapshot.
 *
 * State machine:
 *   idle        — live off, show single thumbnail overlay
 *   connecting  — WHEP negotiation in flight
 *   webrtc      — streaming via WebRTC (primary path)
 *   snapshot    — WHEP failed, polling JPEG snapshots as fallback
 *   error       — both WebRTC and 3 consecutive snapshots failed
 */
interface IpCameraLiveFrameProps {
  camera: IpCamera;
  active: boolean;
  className?: string;
  showLiveBadge?: boolean;
  objectFit?: "cover" | "contain";
}

type Mode = "idle" | "connecting" | "webrtc" | "snapshot" | "error";

export function IpCameraLiveFrame({
  camera,
  active,
  className,
  showLiveBadge = true,
  objectFit = "cover",
}: IpCameraLiveFrameProps) {
  const { t } = useT("casa");
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>("idle");

  useEffect(() => {
    if (!active) {
      setMode("idle");
      return;
    }
    setMode("connecting");

    let session: WhepSession | null = null;
    let cancelled = false;

    (async () => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
      try {
        session = await startWhepSession({ cameraId: camera.id, videoEl });
        if (cancelled) {
          void session?.stop();
          return;
        }
        setMode("webrtc");
      } catch (err) {
        if (cancelled) return;
        console.warn("[ipcam] WebRTC failed, falling back to snapshot polling:", err);
        setMode("snapshot");
      }
    })();

    return () => {
      cancelled = true;
      if (session) {
        void session.stop();
      }
    };
  }, [active, camera.id]);

  return (
    <div
      className={`relative aspect-video rounded-lg overflow-hidden bg-black border border-border ${className ?? ""}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full ${objectFit === "contain" ? "object-contain" : "object-cover"} ${
          mode === "webrtc" ? "opacity-100" : "opacity-0"
        }`}
      />

      {mode !== "webrtc" && mode !== "error" && (
        <SnapshotLayer
          camera={camera}
          pollActive={mode === "snapshot"}
          objectFit={objectFit}
          onUnreachable={() => setMode("error")}
        />
      )}

      {active && showLiveBadge && mode === "webrtc" && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-danger/90 text-white text-xs font-bold">
          <span
            className={`w-2 h-2 rounded-full bg-white ${reducedMotion ? "" : "animate-pulse"}`}
          />
          LIVE
        </div>
      )}
      {active && showLiveBadge && mode === "snapshot" && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-warning/90 text-black text-xs font-bold">
          {t("sheet.camera.liveThumbnail")}
        </div>
      )}

      {mode === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
          <SpinnerIcon size={36} className={reducedMotion ? "" : "animate-spin"} />
          <span className="text-sm">{t("sheet.camera.connecting")}</span>
        </div>
      )}

      {mode === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white p-6 text-center">
          <VideoCameraIcon size={40} weight="duotone" className="opacity-60" />
          <p className="text-sm font-medium">{t("sheet.camera.notReachable")}</p>
          <p className="text-xs text-white/70 max-w-sm">
            {t("sheet.camera.checkHost", { host: camera.host })}
          </p>
        </div>
      )}

      {!active && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-white/90">
            <PlayCircleIcon size={48} weight="duotone" className="opacity-85" />
            <span className="text-xs font-medium uppercase tracking-wide opacity-80">
              {t("sheet.camera.thumbnail")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Snapshot fallback layer                                            */
/* ------------------------------------------------------------------ */

const POLL_DELAY_MS = 150;
const ERROR_THRESHOLD = 3;

function SnapshotLayer({
  camera,
  pollActive,
  objectFit,
  onUnreachable,
}: {
  camera: IpCamera;
  pollActive: boolean;
  objectFit: "cover" | "contain";
  onUnreachable: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const lastSrcRef = useRef<string | null>(null);
  const baseUrl = ipCameraSnapshotUrl(camera.id);

  useEffect(() => {
    if (!pollActive) setErrorCount(0);
  }, [pollActive]);

  useEffect(() => {
    if (pollActive && errorCount >= ERROR_THRESHOLD) {
      onUnreachable();
    }
  }, [pollActive, errorCount, onUnreachable]);

  const src = pollActive ? `${baseUrl}&_t=${tick}` : (lastSrcRef.current ?? `${baseUrl}&_t=0`);
  if (pollActive) lastSrcRef.current = src;

  const handleLoad = () => {
    if (!pollActive) return;
    setErrorCount(0);
    window.setTimeout(() => setTick((n) => n + 1), POLL_DELAY_MS);
  };

  const handleError = () => {
    if (!pollActive) return;
    setErrorCount((n) => n + 1);
    window.setTimeout(() => setTick((n) => n + 1), 1000);
  };

  return (
    <img
      src={src}
      alt={camera.name}
      onLoad={handleLoad}
      onError={handleError}
      className={`absolute inset-0 w-full h-full ${
        objectFit === "contain" ? "object-contain" : "object-cover"
      }`}
    />
  );
}
