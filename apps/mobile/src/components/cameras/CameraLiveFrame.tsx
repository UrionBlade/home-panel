import type { BlinkCamera } from "@home-panel/shared";
import { PlayCircleIcon, SpinnerIcon, VideoCameraIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api-client";
import { proxyUrl } from "../../lib/blink/proxyUrl";
import { useRequestSnapshot } from "../../lib/hooks/useBlink";

/**
 * Live view per Blink — polling di snapshot controllato.
 *
 * Blink non espone un RTSPS che sopravviva al mangled Request-URI dei
 * client generici (ffmpeg, gortsplib): la strada comune in HA-land è il
 * polling di snapshot. Ogni iterazione:
 *   POST /cameras/:id/snapshot  → Blink sveglia la camera
 *   attesa ~3-5s del backend    → risposta contiene il nuovo thumbnailUrl
 *   <img src=…?_t=tick>         → browser carica il frame fresco
 *
 * Il prop `active` controlla se il polling gira. Quando false mostriamo
 * la miniatura cached (se c'è) con un overlay "Attiva diretta" così
 * l'utente non consuma risorse Blink senza averlo chiesto. Passa a
 * `active=true` per avviare; `active=false` ferma subito il loop.
 */
interface CameraLiveFrameProps {
  camera: BlinkCamera;
  /** True = polling attivo. False = miniatura statica + placeholder. */
  active: boolean;
  /** Classi aggiuntive per il wrapper. */
  className?: string;
  /** Se true, mostra il badge LIVE rosso quando attivo. Default true. */
  showLiveBadge?: boolean;
}

const SNAPSHOT_POLL_INTERVAL_MS = 250;

export function CameraLiveFrame({
  camera,
  active,
  className,
  showLiveBadge = true,
}: CameraLiveFrameProps) {
  const snapshot = useRequestSnapshot();
  const [tick, setTick] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: mutation ref stable
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const cameraId = camera.id;
    async function loop() {
      while (!cancelled) {
        try {
          await snapshot.mutateAsync(cameraId);
          if (!cancelled) {
            setErrorMessage(null);
            setTick((n) => n + 1);
          }
        } catch (err: unknown) {
          if (cancelled) return;
          let msg = "Errore snapshot";
          if (err instanceof ApiError) {
            const body = err.body as { error?: string } | null;
            msg = body?.error ?? err.message;
          } else if (err instanceof Error) {
            msg = err.message;
          }
          setErrorMessage(msg);
        }
        if (!cancelled) await new Promise((r) => setTimeout(r, SNAPSHOT_POLL_INTERVAL_MS));
      }
    }
    void loop();
    return () => {
      cancelled = true;
    };
  }, [active, camera.id]);

  const thumbUrl = proxyUrl(camera.thumbnailUrl);
  /* Quando la live è attiva bustiamo la cache col tick per ogni giro.
   * Da spenta mostriamo il thumbnailUrl "pulito" — sarà l'ultimo frame
   * che Blink ha sincronizzato, non un flash bianco. */
  const imgSrc = thumbUrl ? (active ? `${thumbUrl}&_t=${tick}` : thumbUrl) : null;
  const isWaitingFirstFrame = active && tick === 0 && !errorMessage;

  return (
    <div
      className={`relative aspect-video rounded-lg overflow-hidden bg-surface border border-border ${className ?? ""}`}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={camera.name} className="w-full h-full object-cover bg-black" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-black">
          <VideoCameraIcon size={48} weight="duotone" className="text-text-muted opacity-40" />
        </div>
      )}

      {/* Badge LIVE solo quando il polling è attivo */}
      {active && showLiveBadge && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-danger/90 text-white text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          LIVE
        </div>
      )}

      {/* Overlay "ferma" quando live è off: la miniatura resta visibile
       * ma un velo + glifo segnala che non stiamo aggiornando. */}
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

      {active && snapshot.isPending && !isWaitingFirstFrame && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/55 text-white/80 text-xs">
          <SpinnerIcon size={14} className="animate-spin" />
          aggiorno…
        </div>
      )}

      {isWaitingFirstFrame && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
          <SpinnerIcon size={36} className="animate-spin" />
          <span className="text-sm">Risveglio camera…</span>
        </div>
      )}

      {active && errorMessage && tick === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white p-6 text-center">
          <VideoCameraIcon size={40} weight="duotone" className="opacity-60" />
          <p className="text-sm font-medium">Impossibile contattare Blink</p>
          <p className="text-xs text-white/70 max-w-sm">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}
