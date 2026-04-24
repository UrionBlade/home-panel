import type { IpCamera } from "@home-panel/shared";
import { ArrowsOutIcon, BroadcastIcon, GlobeIcon, StopCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { DeviceEntity } from "../../../lib/devices/model";
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

/* Fullscreen overlay inline — riusa lo stesso IpCameraLiveFrame con
 * larghezza maggiore. Quando montato parte automaticamente la live. */
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
      className="fixed inset-0 z-[9999] bg-bg/95 backdrop-blur-md flex flex-col items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Chiudi"
        className="absolute top-6 right-6 text-text-muted hover:text-text p-2 transition-colors text-3xl"
      >
        ×
      </button>
      <div className="w-full max-w-5xl px-6 flex flex-col items-center gap-4">
        <IpCameraLiveFrame camera={camera} active className="w-full" />
        <div className="text-center">
          <h3 className="font-display text-2xl text-text">{camera.name}</h3>
          <p className="text-sm text-text-muted mt-1">Flusso RTSP in diretta ({camera.host})</p>
        </div>
      </div>
    </motion.div>
  );
}
