import type { BlinkCamera } from "@home-panel/shared";
import { XIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect } from "react";
import { DURATION_DEFAULT, EASE_OUT_EXPO } from "../../lib/motion/tokens";
import { useT } from "../../lib/useT";
import { CameraLiveFrame } from "./CameraLiveFrame";

interface CameraFullscreenOverlayProps {
  camera: BlinkCamera;
  onClose: () => void;
}

/**
 * Overlay edge-to-edge della live Blink. Il frame occupa tutto il
 * viewport (bg nero); nome camera e tasto chiudi sono in un HUD
 * a sfumatura sopra l'immagine. Escape / click su X per chiudere.
 */
export function CameraFullscreenOverlay({ camera, onClose }: CameraFullscreenOverlayProps) {
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
      <CameraLiveFrame
        camera={camera}
        active
        objectFit="contain"
        className="!rounded-none !border-0 w-screen h-screen !aspect-auto"
      />

      <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-6 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none">
        <div className="pointer-events-auto">
          <h3 className="font-display text-2xl text-white drop-shadow">{camera.name}</h3>
          <p className="text-xs text-white/70 mt-0.5">Aggiornamento 3-5s per frame</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto text-white/80 hover:text-white p-2 rounded-full bg-black/40 hover:bg-black/60 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label={tCommon("actions.close")}
        >
          <XIcon size={28} weight="bold" />
        </button>
      </div>
    </motion.div>
  );
}
