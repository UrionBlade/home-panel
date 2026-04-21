import type { BlinkCamera, BlinkMotionClip } from "@home-panel/shared";
import {
  ArrowsClockwiseIcon,
  CircleIcon,
  EyeIcon,
  FilmStripIcon,
  GearIcon,
  LockIcon,
  LockOpenIcon,
  PlayIcon,
  SpinnerIcon,
  TrashIcon,
  VideoCameraIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CameraArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { ApiError } from "../lib/api-client";
import {
  useArmCamera,
  useBlinkStatus,
  useCameras,
  useClips,
  useDeleteClip,
  useRequestSnapshot,
  useSyncCameras,
} from "../lib/hooks/useBlink";
import { useT } from "../lib/useT";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function proxyUrl(blinkUrl: string | null | undefined): string | null {
  if (!blinkUrl) return null;
  return `${API_BASE}/api/v1/blink/proxy?url=${encodeURIComponent(blinkUrl)}`;
}

/* ------------------------------------------------------------------ */
/*  Video player overlay                                               */
/* ------------------------------------------------------------------ */
function ClipPlayer({ clip, onClose }: { clip: BlinkMotionClip; onClose: () => void }) {
  const { t } = useT("cameras");
  const { t: tCommon } = useT("common");
  const videoUrl = proxyUrl(clip.clipPath);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-bg/95 backdrop-blur-md flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 text-text-muted hover:text-text p-2"
        aria-label={tCommon("actions.close")}
      >
        <XIcon size={32} weight="bold" />
      </button>
      <div className="w-full max-w-3xl px-4">
        {videoUrl ? (
          <video src={videoUrl} controls autoPlay className="w-full rounded-lg bg-black">
            <track kind="captions" />
          </video>
        ) : (
          <p className="text-text text-center">{t("videoUnavailable")}</p>
        )}
        <p className="text-text-muted text-sm text-center mt-3">
          {new Date(clip.recordedAt).toLocaleString("it-IT", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera card                                                        */
/* ------------------------------------------------------------------ */
/*  Live View (quasi-live via thumbnail refresh)                        */
/* ------------------------------------------------------------------ */
/**
 * Live view for Blink cameras.
 *
 * Blink's RTSPS stream includes a query-string token in the Request-URI that
 * no generic RTSP client (ffmpeg, MediaMTX's gortsplib) preserves, so the
 * server closes the connection right after TLS. The community path
 * (Home Assistant included) is snapshot polling: wake the camera, re-sync
 * the thumbnail URL, refresh the <img>.
 *
 * Each tick drives a single backend call chain:
 *   POST /cameras/:id/snapshot  → Blink wakes the camera
 *   (wait ~7s for the JPEG to land)
 *   POST /cameras/sync          → DB gets the new thumbnailUrl
 *   <img src=…?_t=tick>         → browser loads the fresh frame
 */
const SNAPSHOT_POLL_INTERVAL_MS = 250;

function LiveView({ camera, onClose }: { camera: BlinkCamera; onClose: () => void }) {
  const { t: tCommon } = useT("common");
  const snapshot = useRequestSnapshot();
  const [tick, setTick] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* Chain snapshots back-to-back. Each `mutateAsync` already waits for
   * Blink to produce the new thumbnail + backend sync, so the natural
   * cadence is "as fast as Blink allows" (~7-10s per frame). The short
   * setTimeout between iterations prevents a tight loop if the API starts
   * failing fast. `snapshot` comes from useMutation and is stable. */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mutation ref stable
  useEffect(() => {
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
  }, [camera.id]);

  const thumbUrl = proxyUrl(camera.thumbnailUrl);
  const imgSrc = thumbUrl ? `${thumbUrl}&_t=${tick}` : null;
  const isWaitingFirstFrame = tick === 0 && !errorMessage;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-bg/95 backdrop-blur-md flex flex-col items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 text-text-muted hover:text-text p-2 transition-colors"
        aria-label={tCommon("actions.close")}
      >
        <XIcon size={32} weight="bold" />
      </button>

      <div className="w-full max-w-4xl px-6 flex flex-col items-center gap-4">
        <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-surface border border-border">
          {imgSrc ? (
            <img src={imgSrc} alt={camera.name} className="w-full h-full object-cover bg-black" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black">
              <VideoCameraIcon size={48} weight="duotone" className="text-text-muted opacity-40" />
            </div>
          )}

          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-danger/90 text-white text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            LIVE
          </div>

          {snapshot.isPending && !isWaitingFirstFrame ? (
            <div className="absolute bottom-4 right-4 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/55 text-white/80 text-xs">
              <SpinnerIcon size={14} className="animate-spin" />
              aggiorno…
            </div>
          ) : null}

          {isWaitingFirstFrame ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
              <SpinnerIcon size={36} className="animate-spin" />
              <span className="text-sm">Risveglio camera…</span>
            </div>
          ) : null}

          {errorMessage && tick === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white p-8 text-center">
              <VideoCameraIcon size={48} weight="duotone" className="opacity-60" />
              <p className="text-base font-medium">Impossibile contattare Blink</p>
              <p className="text-xs text-white/70 max-w-sm">{errorMessage}</p>
            </div>
          ) : null}
        </div>

        <div className="text-center">
          <h3 className="font-display text-xl text-text">{camera.name}</h3>
          <p className="text-sm text-text-muted mt-1">Aggiornamento automatico (3-5s per frame)</p>
        </div>
      </div>
    </motion.div>
  );
}

function CameraCard({
  camera,
  selected,
  onSelect,
}: {
  camera: BlinkCamera;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useT("cameras");
  const isOnline = camera.status === "online";
  const thumb = proxyUrl(camera.thumbnailUrl);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative text-left rounded-md border bg-surface-elevated p-5 flex flex-col gap-3 transition-all duration-200 ${
        selected
          ? "border-accent shadow-lg"
          : "border-border hover:border-accent/50 hover:shadow-md"
      }`}
    >
      {thumb ? (
        <img
          src={thumb}
          alt={camera.name}
          className="w-full aspect-video rounded-sm object-cover bg-surface"
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="w-full aspect-video rounded-sm bg-surface flex items-center justify-center">
          <VideoCameraIcon size={40} weight="duotone" className="text-text-muted opacity-40" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="font-medium truncate">{camera.name}</span>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium ${
            isOnline ? "text-success" : "text-text-muted"
          }`}
        >
          <CircleIcon size={8} weight="fill" />
          {isOnline ? t("status.online") : t("status.offline")}
        </span>
      </div>

      {camera.lastMotionAt && (
        <span className="text-xs text-text-muted">
          {new Date(camera.lastMotionAt).toLocaleString("it-IT", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </button>
  );
}

function ArmToggle({ camera }: { camera: BlinkCamera }) {
  const arm = useArmCamera();
  /* Real Blink state: motion detection is enabled per-camera. "Armed" used
   * to mix this up with "online" (Wi-Fi presence), which made the toggle a
   * lie. */
  const isArmed = camera.armed;
  const isOffline = camera.status !== "online";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        arm.mutate({ id: camera.id, arm: !isArmed });
      }}
      disabled={arm.isPending || isOffline}
      title={isOffline ? "Telecamera offline" : undefined}
      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
        isArmed
          ? "bg-success/15 text-success hover:bg-success/25"
          : "bg-surface text-text-muted border border-border hover:border-accent"
      } disabled:opacity-50`}
    >
      {isArmed ? <LockIcon size={16} weight="fill" /> : <LockOpenIcon size={16} weight="duotone" />}
      {arm.isPending ? "..." : isArmed ? "Armata" : "Disarmata"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Clips section                                                      */
/* ------------------------------------------------------------------ */
/**
 * Skeleton → image → fallback. Blink thumbnails sometimes 404 or stall; without
 * a proper state machine the `<img>` falls back to its container (black) and
 * looks broken. This component keeps the area legible regardless of outcome.
 */
function ClipThumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

  if (state === "error" || !src) {
    return (
      <div
        aria-hidden
        className="w-full h-full flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
        }}
      >
        <VideoCameraIcon size={28} weight="duotone" className="text-text-muted opacity-40" />
      </div>
    );
  }

  return (
    <>
      <div
        aria-hidden
        className={`absolute inset-0 ${state === "loading" ? "animate-pulse" : "opacity-0"} transition-opacity`}
        style={{
          background:
            "linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-elevated) 100%)",
        }}
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={`w-full h-full object-cover transition-opacity duration-300 ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}

function ClipsSection({ cameraId }: { cameraId?: string }) {
  const { t } = useT("cameras");
  const { data: clips = [] } = useClips(cameraId);
  const deleteClip = useDeleteClip();
  const [playingClip, setPlayingClip] = useState<BlinkMotionClip | null>(null);

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    // window.confirm may not work on WKWebView/Tauri iOS
    // Delete directly — the action is already intentional (tap on trash icon)
    deleteClip.mutate(id);
  }

  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-display text-2xl flex items-center gap-2">
        <FilmStripIcon size={22} weight="duotone" className="opacity-70" />
        {t("clips.title")}{" "}
        {clips.length > 0 && (
          <span className="text-base text-text-muted font-normal">({clips.length})</span>
        )}
      </h3>

      {clips.length === 0 ? (
        <p className="text-text-muted text-sm py-6 text-center">{t("clips.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clips.map((clip) => {
            const thumb = proxyUrl(clip.thumbnailPath);
            /* Outer element is a `div` (not a button) so the nested delete
             * button is valid HTML. Role + keyboard handlers preserve the
             * "the whole card opens the clip" affordance. */
            return (
              <li key={clip.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setPlayingClip(clip)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPlayingClip(clip);
                    }
                  }}
                  className="w-full text-left rounded-md bg-surface-elevated border border-border overflow-hidden hover:border-accent/50 hover:shadow-md transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="relative aspect-video overflow-hidden">
                    <ClipThumbnail src={thumb} alt="" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                      <PlayIcon size={40} weight="fill" className="text-white drop-shadow-lg" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-text">
                      {new Date(clip.recordedAt).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, clip.id)}
                      className="p-1.5 rounded-sm text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                      aria-label={t("actions.deleteClip")}
                    >
                      <TrashIcon size={16} weight="duotone" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence>
        {playingClip && <ClipPlayer clip={playingClip} onClose={() => setPlayingClip(null)} />}
      </AnimatePresence>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main CamerasPage                                                   */
/* ------------------------------------------------------------------ */
export function CamerasPage() {
  const { t } = useT("cameras");
  const navigate = useNavigate();
  const { data: status, isLoading: statusLoading } = useBlinkStatus();
  const { data: cameras = [] } = useCameras();
  const syncCameras = useSyncCameras();
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [liveCameraId, setLiveCameraId] = useState<string | null>(null);
  const liveCamera = cameras.find((c) => c.id === liveCameraId) ?? null;

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">...</span>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <PageContainer>
        <PageHeader title={t("title")} subtitle={t("subtitle")} artwork={<CameraArt size={96} />} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto mt-16 flex flex-col items-center gap-5 text-center"
        >
          <VideoCameraIcon size={56} weight="duotone" className="text-text-muted opacity-50" />
          <p className="text-text-muted">{t("notConfigured.message")}</p>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90"
          >
            <GearIcon size={18} weight="bold" />
            {t("notConfigured.goToSettings")}
          </button>
        </motion.div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        artwork={<CameraArt size={96} />}
        actions={
          <button
            type="button"
            onClick={() => syncCameras.mutate()}
            disabled={syncCameras.isPending}
            className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent disabled:opacity-50 min-h-[2.75rem]"
          >
            <ArrowsClockwiseIcon
              size={16}
              weight="bold"
              className={syncCameras.isPending ? "animate-spin" : ""}
            />
            {t("actions.sync")}
          </button>
        }
      />

      {cameras.length === 0 ? (
        <p className="text-text-muted text-center py-12">{t("status.notConfigured")}</p>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cameras.map((cam) => (
            <div key={cam.id} className="flex flex-col gap-2">
              <CameraCard
                camera={cam}
                selected={selectedCameraId === cam.id}
                onSelect={() => setSelectedCameraId((prev) => (prev === cam.id ? null : cam.id))}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLiveCameraId(cam.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-surface border border-border hover:border-accent transition-colors flex-1 justify-center"
                >
                  <EyeIcon size={16} weight="duotone" />
                  Live
                </button>
                <ArmToggle camera={cam} />
              </div>
            </div>
          ))}
        </section>
      )}

      <ClipsSection cameraId={selectedCameraId ?? undefined} />

      <AnimatePresence>
        {liveCamera && <LiveView camera={liveCamera} onClose={() => setLiveCameraId(null)} />}
      </AnimatePresence>
    </PageContainer>
  );
}
