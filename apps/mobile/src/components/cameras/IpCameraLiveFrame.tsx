import type { IpCamera } from "@home-panel/shared";
import { PlayCircleIcon, SpinnerIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ipCameraSnapshotUrl } from "../../lib/ipCameras/snapshotUrl";
import { startWhepSession, type WhepSession } from "../../lib/ipCameras/webrtc";

/**
 * Live view per IP camera — WebRTC con fallback snapshot.
 *
 * Attivo (active=true):
 *   1. Apre una sessione WHEP contro MediaMTX via il proxy dell'API.
 *   2. Se WebRTC fallisce (ICE timeout, codec non supportato, ecc.)
 *      cadiamo sul polling snapshot JPEG come la v1.
 * Non attivo:
 *   Mostriamo un singolo snapshot come miniatura + overlay "Miniatura".
 *
 * Lo snapshot URL include `?token=` come query (l'<img> non può
 * mandare header Authorization).
 */
interface IpCameraLiveFrameProps {
  camera: IpCamera;
  active: boolean;
  className?: string;
  showLiveBadge?: boolean;
  objectFit?: "cover" | "contain";
}

export function IpCameraLiveFrame({
  camera,
  active,
  className,
  showLiveBadge = true,
  objectFit = "cover",
}: IpCameraLiveFrameProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"idle" | "connecting" | "webrtc" | "snapshot" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!active) {
      setMode("idle");
      return;
    }
    setMode("connecting");
    setErrorMessage(null);

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
        console.warn("[ipcam] WebRTC non riuscito, fallback snapshot:", err);
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
      {/* VIDEO element per WebRTC. Resta sempre nel DOM così il srcObject
       * può essere appeso quando la sessione si apre. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full ${objectFit === "contain" ? "object-contain" : "object-cover"} ${
          mode === "webrtc" ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Fallback snapshot quando WebRTC ha fallito o la live è off. */}
      {mode !== "webrtc" && (
        <SnapshotLayer camera={camera} active={active} mode={mode} objectFit={objectFit} />
      )}

      {active && showLiveBadge && mode === "webrtc" && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-danger/90 text-white text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          LIVE
        </div>
      )}
      {active && showLiveBadge && mode === "snapshot" && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-warning/90 text-white text-xs font-bold">
          LIVE (miniature)
        </div>
      )}

      {mode === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
          <SpinnerIcon size={36} className="animate-spin" />
          <span className="text-sm">Connessione in corso…</span>
        </div>
      )}

      {mode === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white p-6 text-center">
          <VideoCameraIcon size={40} weight="duotone" className="opacity-60" />
          <p className="text-sm font-medium">Camera non raggiungibile</p>
          <p className="text-xs text-white/70 max-w-sm">
            {errorMessage ?? `Controlla che ${camera.host} risponda.`}
          </p>
        </div>
      )}

      {!active && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-white/90">
            <PlayCircleIcon size={48} weight="duotone" className="opacity-85" />
            <span className="text-xs font-medium uppercase tracking-wide opacity-80">
              Miniatura
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

function SnapshotLayer({
  camera,
  active,
  mode,
  objectFit,
}: {
  camera: IpCamera;
  active: boolean;
  mode: "idle" | "connecting" | "webrtc" | "snapshot" | "error";
  objectFit: "cover" | "contain";
}) {
  const [tick, setTick] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const lastSrcRef = useRef<string | null>(null);
  const baseUrl = ipCameraSnapshotUrl(camera.id);

  /* Polling attivo solo in modalità `snapshot` (fallback) — non quando
   * stiamo connettendo (altrimenti bruciamo due strade in parallelo). */
  const pollActive = mode === "snapshot";

  useEffect(() => {
    if (!pollActive) setErrorCount(0);
  }, [pollActive]);

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

  if (errorCount >= 3 && pollActive) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white p-6 text-center">
        <VideoCameraIcon size={40} weight="duotone" className="opacity-60" />
        <p className="text-sm font-medium">Camera non raggiungibile</p>
        <p className="text-xs text-white/70 max-w-sm">Controlla che {camera.host} risponda.</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={camera.name}
      onLoad={handleLoad}
      onError={handleError}
      className={`absolute inset-0 w-full h-full ${
        objectFit === "contain" ? "object-contain" : "object-cover"
      } ${active || !lastSrcRef.current ? "opacity-100" : "opacity-80"}`}
    />
  );
}
