import type { IpCamera } from "@home-panel/shared";
import { PlayCircleIcon, SpinnerIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { ipCameraSnapshotUrl } from "../../lib/ipCameras/snapshotUrl";

/**
 * Live view per IP camera RTSP (CamHiPro / Anpviz / Reolink / etc).
 *
 * Strategia: polling dell'endpoint snapshot del backend. Il backend
 * gira ffmpeg on-demand e ritorna un JPEG. Latenza ~400-800ms a
 * risoluzione substream. Quando `active=true` appendi un cache-buster
 * `_t` e rifai richiesta dopo onLoad.
 *
 * Quando `active=false` mostriamo l'ultimo frame caricato (miniatura)
 * con overlay "MINIATURA" uniformando l'esperienza con la Blink.
 */
interface IpCameraLiveFrameProps {
  camera: IpCamera;
  active: boolean;
  className?: string;
  showLiveBadge?: boolean;
  /** Come nel CameraLiveFrame Blink — "contain" in fullscreen per non
   * tagliare la scena quando il wrapper è 4:3 ma lo stream è 16:9. */
  objectFit?: "cover" | "contain";
}

const POLL_DELAY_MS = 150;

export function IpCameraLiveFrame({
  camera,
  active,
  className,
  showLiveBadge = true,
  objectFit = "cover",
}: IpCameraLiveFrameProps) {
  const [tick, setTick] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const lastSrcRef = useRef<string | null>(null);

  /* Quando active passa a false, resettiamo tick così la prossima
   * accensione ricomincia dal primo frame. */
  useEffect(() => {
    if (!active) {
      setErrorCount(0);
    }
  }, [active]);

  const baseUrl = ipCameraSnapshotUrl(camera.id);
  /* In live usiamo il tick per bustare cache e forzare un nuovo frame
   * a ogni onLoad. In pausa tiene il tick fermo → stessa URL → l'img
   * resta stabile. */
  const src = active ? `${baseUrl}&_t=${tick}` : (lastSrcRef.current ?? `${baseUrl}&_t=0`);

  if (active) lastSrcRef.current = src;

  const handleLoad = () => {
    setLoaded(true);
    if (!active) return;
    setErrorCount(0);
    /* piccolo delay per lasciare respirare la CPU e non hammerare il
     * backend quando la camera è su LAN veloce. */
    window.setTimeout(() => setTick((n) => n + 1), POLL_DELAY_MS);
  };

  const handleError = () => {
    setLoaded(false);
    if (!active) return;
    setErrorCount((n) => n + 1);
    /* Backoff semplice: 1s tra errori, capped. */
    window.setTimeout(() => setTick((n) => n + 1), 1000);
  };

  const isFirstFrame = active && !loaded && errorCount === 0;
  const isError = active && errorCount >= 3;

  return (
    <div
      className={`relative aspect-video rounded-lg overflow-hidden bg-black border border-border ${className ?? ""}`}
    >
      {/* Hidden-ish img: quando NON attivo mantiene ultimo frame */}
      <img
        src={src}
        alt={camera.name}
        onLoad={handleLoad}
        onError={handleError}
        className={`w-full h-full ${objectFit === "contain" ? "object-contain" : "object-cover"}`}
      />

      {active && showLiveBadge && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-danger/90 text-white text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          LIVE
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

      {isFirstFrame && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
          <SpinnerIcon size={36} className="animate-spin" />
          <span className="text-sm">Sto prendendo un fotogramma…</span>
        </div>
      )}

      {isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 text-white p-6 text-center">
          <VideoCameraIcon size={40} weight="duotone" className="opacity-60" />
          <p className="text-sm font-medium">Camera non raggiungibile</p>
          <p className="text-xs text-white/70 max-w-sm">
            Controlla che {camera.host} risponda e che le credenziali RTSP siano corrette.
          </p>
        </div>
      )}
    </div>
  );
}
