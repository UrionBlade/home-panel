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
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CameraArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
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
function LiveView({ camera, onClose }: { camera: BlinkCamera; onClose: () => void }) {
  const { t: tCommon } = useT("common");
  const snapshot = useRequestSnapshot();
  const qc = useQueryClient();
  const [refreshCount, setRefreshCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const imgRef = useRef<HTMLImageElement>(null);

  // Request initial snapshot and start refreshing every 5s
  const startRefresh = useCallback(() => {
    snapshot.mutate(camera.id);
    intervalRef.current = setInterval(() => {
      snapshot.mutate(camera.id);
      // After 3s from the snapshot request, invalidate cameras to get the new thumbnail
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["blink", "cameras"] });
        setRefreshCount((c) => c + 1);
      }, 3000);
    }, 5000);
  }, [camera.id, snapshot, qc]);

  useEffect(() => {
    startRefresh();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startRefresh]);

  const thumbUrl = proxyUrl(camera.thumbnailUrl);
  // Cache-bust to force the browser to reload the image
  const imgSrc = thumbUrl ? `${thumbUrl}&_t=${refreshCount}` : null;

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
            <img
              ref={imgRef}
              src={imgSrc}
              alt={camera.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <VideoCameraIcon size={48} weight="duotone" className="text-text-muted opacity-40" />
            </div>
          )}
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-danger/90 text-white text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
          {snapshot.isPending && (
            <div className="absolute bottom-4 right-4">
              <SpinnerIcon size={20} className="animate-spin text-white/70" />
            </div>
          )}
        </div>

        <div className="text-center">
          <h3 className="font-display text-xl text-text">{camera.name}</h3>
          <p className="text-sm text-text-muted mt-1">Aggiornamento ogni 5 secondi</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
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
  const isArmed = camera.status === "online";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        arm.mutate({ id: camera.id, arm: !isArmed });
      }}
      disabled={arm.isPending}
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
            return (
              <li key={clip.id}>
                <button
                  type="button"
                  onClick={() => setPlayingClip(clip)}
                  className="w-full text-left rounded-md bg-surface-elevated border border-border overflow-hidden hover:border-accent/50 hover:shadow-md transition-all"
                >
                  <div className="relative aspect-video bg-surface">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <VideoCameraIcon
                          size={32}
                          weight="duotone"
                          className="text-text-muted opacity-30"
                        />
                      </div>
                    )}
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
                </button>
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
