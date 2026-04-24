import type { IpCamera } from "@home-panel/shared";
import {
  ArrowsOutIcon,
  BroadcastIcon,
  GlobeIcon,
  RecordIcon,
  StopCircleIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { DeviceEntity } from "../../../lib/devices/model";
import {
  ipCameraRecordingUrl,
  useDeleteIpCameraRecording,
  useIpCameraRecordings,
  useIpCameraRecordStatus,
  useStartIpCameraRecording,
  useStopIpCameraRecording,
} from "../../../lib/hooks/useIpCameras";
import { DURATION_DEFAULT, EASE_OUT_EXPO } from "../../../lib/motion/tokens";
import { useReducedMotion } from "../../../lib/motion/useReducedMotion";
import { useT } from "../../../lib/useT";
import { useUiStore } from "../../../store/ui-store";
import { IpCameraLiveFrame } from "../../cameras/IpCameraLiveFrame";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { BottomSheet } from "../BottomSheet";

interface IpCameraControlSheetProps {
  open: boolean;
  device: DeviceEntity;
  onClose: () => void;
}

/**
 * Controlli per una IP camera RTSP generica (CamHiPro / Anpviz / …).
 *
 * Compared to Blink: no arm/disarm (stream is always-on) but much lower
 * latency (~0.5s vs 3-5s). The main operative action when the live is
 * off is "Record" — it's promoted to primary placement in that state.
 */
export function IpCameraControlSheet({ open, device, onClose }: IpCameraControlSheetProps) {
  const { t } = useT("casa");
  const row = device.raw as IpCamera;

  const [liveActive, setLiveActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!open) {
      setLiveActive(false);
      setFullscreen(false);
    }
  }, [open]);

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={device.name}
        subtitle={t("kinds.camera", { count: 1, defaultValue: "Telecamera" })}
      >
        <div className="flex flex-col gap-4 py-3">
          <IpCameraLiveFrame camera={row} active={liveActive} />

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLiveActive((v) => !v)}
              aria-pressed={liveActive}
              className={`min-h-[3.5rem] rounded-md flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                liveActive
                  ? "bg-danger/15 border border-danger/50 text-danger"
                  : "bg-accent text-accent-foreground hover:bg-accent-hover"
              }`}
            >
              {liveActive ? (
                <>
                  <StopCircleIcon size={20} weight="fill" />
                  {t("sheet.camera.stopLive")}
                </>
              ) : (
                <>
                  <BroadcastIcon size={20} weight="duotone" />
                  {t("sheet.camera.startLive")}
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="min-h-[3.5rem] rounded-md bg-surface border border-border text-text flex items-center justify-center gap-2 hover:border-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowsOutIcon size={18} weight="bold" />
              {t("sheet.camera.fullscreen")}
            </button>
          </div>

          <RecordingControls cameraId={row.id} />

          <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-surface border border-border">
            <GlobeIcon size={18} weight="duotone" className="text-text-muted shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-text-subtle">{t("sheet.camera.address")}</span>
              <span className="text-sm text-text truncate font-mono">
                {row.host}:{row.port}
              </span>
            </div>
          </div>
        </div>
      </BottomSheet>

      <AnimatePresence>
        {fullscreen && <IpCameraFullscreen camera={row} onClose={() => setFullscreen(false)} />}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Recording controls + clip list                                     */
/* ------------------------------------------------------------------ */

function RecordingControls({ cameraId }: { cameraId: string }) {
  const { t } = useT("casa");
  const pushToast = useUiStore((s) => s.pushToast);
  const reducedMotion = useReducedMotion();

  const statusQ = useIpCameraRecordStatus(cameraId);
  const listQ = useIpCameraRecordings(cameraId);
  const start = useStartIpCameraRecording();
  const stop = useStopIpCameraRecording();
  const del = useDeleteIpCameraRecording();

  const isRecording = !!statusQ.data?.recordingId;

  const [pendingDelete, setPendingDelete] = useState<{ id: string; when: string } | null>(null);

  const handleToggle = () => {
    if (isRecording) {
      stop.mutate(cameraId, {
        onError: () => pushToast({ tone: "danger", text: t("sheet.camera.stopFailed") }),
      });
    } else {
      start.mutate(
        { cameraId },
        {
          onError: () => pushToast({ tone: "danger", text: t("sheet.camera.startFailed") }),
        },
      );
    }
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    del.mutate(
      { cameraId, recId: pendingDelete.id },
      {
        onError: () => pushToast({ tone: "danger", text: t("sheet.camera.deleteFailed") }),
        onSettled: () => setPendingDelete(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleToggle}
        disabled={start.isPending || stop.isPending}
        aria-pressed={isRecording}
        className={`min-h-[3.5rem] rounded-md flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
          isRecording
            ? "bg-danger text-white"
            : "bg-surface border border-border text-text hover:border-danger hover:text-danger"
        }`}
      >
        <RecordIcon
          size={20}
          weight={isRecording ? "fill" : "duotone"}
          className={isRecording && !reducedMotion ? "animate-pulse" : ""}
        />
        {isRecording ? t("sheet.camera.recording") : t("sheet.camera.record")}
      </button>

      {(listQ.data ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-text-muted">{t("sheet.camera.recordingsTitle")}</span>
          <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {listQ.data?.map((rec) => {
              const when = new Date(rec.startedAt).toLocaleString("it-IT", {
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li
                  key={rec.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border"
                >
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-sm text-text truncate">{when}</span>
                    <span className="text-xs text-text-subtle">
                      {rec.durationSeconds != null ? `${rec.durationSeconds}s` : "…"}
                      {rec.sizeBytes != null
                        ? ` · ${(rec.sizeBytes / 1024 / 1024).toFixed(1)} MB`
                        : ""}
                    </span>
                  </div>
                  <a
                    href={ipCameraRecordingUrl(rec.id)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("sheet.camera.openRecordingAria", { when })}
                    className="shrink-0 min-w-11 min-h-11 px-2 inline-flex items-center justify-center text-xs text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-md"
                  >
                    {t("sheet.camera.openRecording")}
                  </a>
                  <button
                    type="button"
                    onClick={() => setPendingDelete({ id: rec.id, when })}
                    aria-label={t("sheet.camera.deleteRecordingAria", { when })}
                    className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center rounded-md text-text-subtle hover:text-danger hover:bg-danger/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent transition-colors"
                  >
                    <TrashIcon size={18} weight="duotone" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title={t("sheet.camera.confirmDeleteTitle")}
        message={t("sheet.camera.confirmDeleteBody", { when: pendingDelete?.when ?? "" })}
        confirmLabel={t("sheet.camera.confirmDeleteAction")}
        destructive
        isLoading={del.isPending}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* Fullscreen overlay edge-to-edge per la IP camera. */
function IpCameraFullscreen({ camera, onClose }: { camera: IpCamera; onClose: () => void }) {
  const { t } = useT("casa");
  const { t: tCommon } = useT("common");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION_DEFAULT, ease: [...EASE_OUT_EXPO] }}
      className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
    >
      <IpCameraLiveFrame
        camera={camera}
        active
        objectFit="contain"
        className="!rounded-none !border-0 w-screen h-screen !aspect-auto"
      />
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-6 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <h3 className="font-display text-2xl text-white drop-shadow">{camera.name}</h3>
          <p className="text-xs text-white/70 mt-0.5">
            {t("sheet.camera.fullscreenSubtitleRtsp", { host: camera.host })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon("actions.close")}
          className="pointer-events-auto text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <XIcon size={28} weight="bold" />
        </button>
      </div>
    </motion.div>
  );
}
