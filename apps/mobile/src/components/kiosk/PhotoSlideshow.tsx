import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { DURATION_ORCHESTRATION, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

const SLIDE_DURATION_MS = 10_000;
const KEN_BURNS_SCALE = 1.08;

interface PhotoSlideshowProps {
  photoUrls: string[];
}

export function PhotoSlideshow({ photoUrls }: PhotoSlideshowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (photoUrls.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % photoUrls.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(interval);
  }, [photoUrls.length]);

  const url = photoUrls[currentIndex];
  if (!url) return null;

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence mode="popLayout">
        <motion.img
          key={`${url}-${currentIndex}`}
          src={url}
          alt=""
          initial={{ opacity: 0, scale: reduced ? 1 : 1 }}
          animate={{
            opacity: 1,
            scale: reduced ? 1 : KEN_BURNS_SCALE,
          }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: {
              duration: DURATION_ORCHESTRATION * 2,
              ease: [...EASE_OUT_QUART],
            },
            scale: {
              duration: SLIDE_DURATION_MS / 1000,
              ease: "linear",
            },
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </AnimatePresence>
    </div>
  );
}
