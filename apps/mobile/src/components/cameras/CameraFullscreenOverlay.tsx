import type { BlinkCamera } from "@home-panel/shared";
import { XIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { useT } from "../../lib/useT";
import { CameraLiveFrame } from "./CameraLiveFrame";

interface CameraFullscreenOverlayProps {
  camera: BlinkCamera;
  onClose: () => void;
}

/**
 * Overlay a tutto schermo che incornicia la live view di una Blink.
 * Wrapper ricavato dall'ex `LiveView` di CamerasPage: lo condividiamo
 * con il CameraControlSheet nella pagina Casa.
 *
 * Quando montato parte automaticamente il polling degli snapshot
 * (active=true); alla chiusura lo smonto ferma il loop.
 */
export function CameraFullscreenOverlay({ camera, onClose }: CameraFullscreenOverlayProps) {
  const { t: tCommon } = useT("common");

  /* Chiusura con tasto Escape — UX da "modal grande". */
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
        className="absolute top-6 right-6 text-text-muted hover:text-text p-2 transition-colors"
        aria-label={tCommon("actions.close")}
      >
        <XIcon size={32} weight="bold" />
      </button>

      <div className="w-full max-w-5xl px-6 flex flex-col items-center gap-4">
        <CameraLiveFrame camera={camera} active className="w-full" />
        <div className="text-center">
          <h3 className="font-display text-2xl text-text">{camera.name}</h3>
          <p className="text-sm text-text-muted mt-1">Aggiornamento automatico (3-5s per frame)</p>
        </div>
      </div>
    </motion.div>
  );
}
