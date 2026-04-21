/**
 * PendingControl — wraps any interactive control to show mutation state:
 *
 * - isPending  → subtle opacity breath pulse (0.7 opacity, 900ms loop)
 * - isSuccess  → confirm beat: accent ring expands + fades (200ms)
 * - isError    → micro-shake horizontal (3px × 180ms, 2 cycles)
 *
 * Respects prefers-reduced-motion: all effects become a 120ms fade instead.
 *
 * Usage:
 *   <PendingControl isPending={mute.isPending} isError={mute.isError} isSuccess={mute.isSuccess}>
 *     <button ...>Mute</button>
 *   </PendingControl>
 */

import { AnimatePresence, motion, useAnimation } from "framer-motion";
import { type ReactNode, useEffect, useRef } from "react";
import { EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

interface PendingControlProps {
  /** Children: the actual interactive element(s) */
  children: ReactNode;
  /** Mutation is in-flight */
  isPending: boolean;
  /** Mutation completed successfully — triggers confirm beat */
  isSuccess: boolean;
  /** Mutation failed — triggers shake */
  isError: boolean;
  /** Optional class forwarded to the wrapper div */
  className?: string;
}

export function PendingControl({
  children,
  isPending,
  isSuccess,
  isError,
  className,
}: PendingControlProps) {
  const reduced = useReducedMotion();
  const shakeControls = useAnimation();
  const beatControls = useAnimation();
  // Track previous values to detect transitions
  const prevSuccess = useRef(false);
  const prevError = useRef(false);

  // Confirm beat: fire once on success transition
  useEffect(() => {
    if (isSuccess && !prevSuccess.current && !reduced) {
      void beatControls.start({
        scale: [1, 1.45],
        opacity: [0.6, 0],
        transition: { duration: 0.2, ease: [...EASE_OUT_QUART] },
      });
    }
    prevSuccess.current = isSuccess;
  }, [isSuccess, reduced, beatControls]);

  // Shake: fire once on error transition
  useEffect(() => {
    if (isError && !prevError.current) {
      if (reduced) {
        // Reduced motion: simple opacity flash
        void shakeControls.start({
          opacity: [1, 0.4, 1],
          transition: { duration: 0.12 },
        });
      } else {
        void shakeControls.start({
          x: [0, -3, 3, -3, 3, 0],
          transition: { duration: 0.18, ease: "linear" },
        });
      }
    }
    prevError.current = isError;
  }, [isError, reduced, shakeControls]);

  // Breath: CSS animation via className, no JS needed for the loop
  // We use inline style for opacity so it composes with framer-motion animate
  const pendingOpacity = isPending ? (reduced ? 0.6 : undefined) : 1;

  return (
    <div className={`relative inline-flex ${className ?? ""}`} style={{ isolation: "isolate" }}>
      {/* Confirm beat ring — absolutely positioned, pointer-events-none */}
      <AnimatePresence>
        {isSuccess && (
          <motion.span
            key="beat"
            aria-hidden
            initial={{ scale: 1, opacity: 0.6 }}
            animate={beatControls}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-[inherit] pointer-events-none"
            style={{
              border: "1.5px solid var(--color-accent)",
              borderRadius: "inherit",
            }}
          />
        )}
      </AnimatePresence>

      {/* Shake + pending opacity wrapper */}
      <motion.div
        animate={shakeControls}
        className={`inline-flex ${isPending && !reduced ? "animate-breath" : ""}`}
        style={{ opacity: pendingOpacity }}
      >
        {/* Pointer-events blocked during pending to prevent double-tap */}
        <div style={{ pointerEvents: isPending ? "none" : undefined }}>{children}</div>
      </motion.div>
    </div>
  );
}
