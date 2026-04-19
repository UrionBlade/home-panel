import { motion } from "framer-motion";
import { DURATION_DEFAULT, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useT } from "../../lib/useT";
import { Clock } from "../layout/Clock";
import { PhotoSlideshow } from "./PhotoSlideshow";

interface ScreensaverOverlayProps {
  photoUrls: string[];
  onDismiss: () => void;
}

export function ScreensaverOverlay({ photoUrls, onDismiss }: ScreensaverOverlayProps) {
  const { t } = useT("kiosk");
  const hasPhotos = photoUrls.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: DURATION_DEFAULT,
        ease: [...EASE_OUT_QUART],
      }}
      className="fixed inset-0 z-[9999] bg-black cursor-pointer"
      onClick={onDismiss}
      onTouchStart={onDismiss}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === " ") onDismiss();
      }}
      aria-label={t("aria.screensaver")}
    >
      {hasPhotos ? (
        <>
          <PhotoSlideshow photoUrls={photoUrls} />
          {/* Orologio compatto in basso a destra */}
          <div className="absolute bottom-8 right-8 z-10 text-white drop-shadow-lg">
            <Clock variant="compact" />
          </div>
        </>
      ) : (
        /* Fallback: orologio grande centrato */
        <div className="flex h-full w-full items-center justify-center text-white">
          <Clock variant="hero" />
        </div>
      )}
    </motion.div>
  );
}
