import type { VoiceStatus } from "@home-panel/shared";
import { motion } from "framer-motion";
import { EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import { useT } from "../../lib/useT";

interface VoiceWaveIndicatorProps {
  status: VoiceStatus;
}

const BAR_COUNT = 5;

function getBarConfig(status: VoiceStatus) {
  switch (status) {
    case "listening":
      return {
        color: "bg-accent",
        duration: 0.5,
        minH: 4,
        maxH: 16,
      };
    case "processing":
      return {
        color: "bg-accent",
        duration: 1.2,
        minH: 6,
        maxH: 12,
      };
    case "speaking":
      return {
        color: "bg-accent",
        duration: 0.7,
        minH: 4,
        maxH: 14,
      };
    default:
      return {
        color: "bg-text-muted",
        duration: 2.0,
        minH: 4,
        maxH: 8,
      };
  }
}

export function VoiceWaveIndicator({ status }: VoiceWaveIndicatorProps) {
  const reduced = useReducedMotion();
  const { t } = useT("voice");
  const config = getBarConfig(status);

  if (status === "disabled") return null;

  // Reduced motion: static dot
  if (reduced) {
    return (
      <span
        role="img"
        className={`inline-flex w-2 h-2 rounded-full ${config.color}`}
        aria-label={t("aria.active")}
      />
    );
  }

  return (
    <div
      className="inline-flex items-center gap-[2px] h-5"
      role="status"
      aria-label={t("aria.indicator")}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <motion.span
          key={i}
          className={`w-[3px] rounded-full ${config.color}`}
          animate={{
            height: [config.minH, config.maxH, config.minH],
          }}
          transition={{
            duration: config.duration,
            repeat: Infinity,
            ease: [...EASE_OUT_QUART],
            delay: i * (config.duration / BAR_COUNT),
          }}
          style={{ height: config.minH }}
        />
      ))}
    </div>
  );
}
