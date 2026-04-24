import type { IpCamera } from "@home-panel/shared";
import {
  ArrowsOutIcon,
  BroadcastIcon,
  GlobeIcon,
  RecordIcon,
  StopCircleIcon,
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
import { useT } from "../../../lib/useT";
import { IpCameraLiveFrame } from "../../cameras/IpCameraLiveFrame";
import { BottomSheet } from "../BottomSheet";

interface IpCameraControlSheetProps {
  open: boolean;
  device: DeviceEntity;
  onClose: () => void;
}

/**
 * Controlli per una IP camera RTSP generica (CamHiPro / Anpviz / …).
 *
 * Rispetto alla Blink l'esperienza è diversa: niente arma/disarma
 * (stream always-on), ma in compenso latenza molto minore (~0.5s vs
 * 3-5s Blink). I controlli sono ridotti: Avvia/Ferma live, Ingrandisci,
 * informazioni di rete. Il rename avviene dal ⋯ come per ogni altro
 * device.
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

          {/* Controlli: Live toggle + Ingrandisci */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLiveActive((v) => !v)}
              aria-pressed={liveActive}
              className={`min-h-[3.25rem] rounded-md flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                liveActive
                  ? "bg-danger/15 border border-danger/50 text-danger"
                  : "bg-accent text-accent-foreground hover:bg-accent-hover"
              }`}
            >
              {liveActive ? (
                <>
                  <StopCircleIcon size={20} weight="fill" />
                  Ferma live
                </>
              ) : (
                <>
                  <BroadcastIcon size={20} weight="duotone" />
                  Avvia live
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="min-h-[3.25rem] rounded-md bg-surface border border-border text-text flex items-center justify-center gap-2 hover:border-accent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowsOutIcon size={18} weight="bold" />
              Ingrandisci
            </button>
          </div>

          {/* Recording */}
          <RecordingControls cameraId={row.id} />

          {/* Info rete */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-md bg-surface border border-border">
            <GlobeIcon size={18} weight="duotone" className="text-text-muted shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs text-text-subtle">Indirizzo</span>
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
  const statusQ = useIpCameraRecordStatus(cameraId);
  const listQ = useIpCameraRecordings(cameraId);
  const start = useStartIpCameraRecording();
  const stop = useStopIpCameraRecording();
  const del = useDeleteIpCameraRecording();

  const isRecording = !!statusQ.data?.recordingId;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => {
          if (isRecording) stop.mutate(cameraId);
          else start.mutate({ cameraId });
        }}
        disabled={start.isPending || stop.isPending}
        className={`min-h-[3.25rem] rounded-md flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 ${
          isRecording
            ? "bg-danger text-white animate-pulse"
            : "bg-surface border border-border text-text hover:border-danger hover:text-danger"
        }`}
      >
        <RecordIcon size={20} weight="fill" />
        {isRecording ? "Registrazione in corso · tocca per fermare" : "Registra"}
      </button>

      {(listQ.data ?? []).length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs text-text-muted">Registrazioni</span>
          <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
            {listQ.data?.map((rec) => (
              <li
                key={rec.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface border border-border"
              >
                <div className="flex-1 min-w-0 flex flex-col">
                  <span className="text-sm text-text truncate">
                    {new Date(rec.startedAt).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
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
                  className="text-xs text-accent hover:underline"
                >
                  apri
                </a>
                <button
                  type="button"
                  onClick={() => del.mutate({ cameraId, recId: rec.id })}
                  className="text-xs text-text-subtle hover:text-danger"
                  aria-label="Elimina"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* Fullscreen overlay edge-to-edge per la IP camera. */
function IpCameraFullscreen({ camera, onClose }: { camera: IpCamera; onClose: () => void }) {
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
      transition={{ duration: 0.18 }}
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
          <p className="text-xs text-white/70 mt-0.5">Flusso RTSP · {camera.host}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="pointer-events-auto text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>
    </motion.div>
  );
}
