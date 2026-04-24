import { MicrophoneIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { EASE_OUT_EXPO } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import { useT } from "../../lib/useT";
import { useVoiceContext } from "../../lib/voice/VoiceProvider";
import { VoiceCommandsModal } from "./VoiceCommandsModal";

/**
 * Always-visible voice affordance in the AppHeader.
 *
 * - Rotates through example commands every ROTATION_MS (cross-fade).
 * - Short tap opens the full commands modal ("cosa puoi dire").
 * - Long press (>= LONG_PRESS_MS) triggers an immediate tap-to-speak session
 *   via `voice.pushToTalk()`, skipping the wake word.
 * - When voice is unsupported or disabled, the pill is hidden so the user's
 *   privacy preference is respected.
 */

const ROTATION_MS = 6000;
const LONG_PRESS_MS = 500;

export function VoiceInvitePill() {
  const { t } = useT("voice");
  const reduced = useReducedMotion();
  const voice = useVoiceContext();
  const [modalOpen, setModalOpen] = useState(false);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [isListening, setIsListening] = useState(false);

  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const examples = t("pill.examples", { returnObjects: true }) as unknown as string[];
  const safeExamples = Array.isArray(examples) && examples.length > 0 ? examples : [""];

  /* Rotate the shown example on a slow interval; pause while listening. */
  useEffect(() => {
    if (isListening || reduced) return;
    const id = window.setInterval(() => {
      setExampleIndex((i) => (i + 1) % safeExamples.length);
    }, ROTATION_MS);
    return () => window.clearInterval(id);
  }, [safeExamples.length, isListening, reduced]);

  /* Mirror the voice context state into our local listening flag so the
   * pill can render a transient "ascolto…" caption. */
  useEffect(() => {
    setIsListening(voice.status === "listening" || voice.status === "processing");
  }, [voice.status]);

  function clearLongPressTimer() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handlePointerDown(e: PointerEvent<HTMLButtonElement>) {
    longPressFired.current = false;
    clearLongPressTimer();
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      voice.pushToTalk();
    }, LONG_PRESS_MS);
    /* Prevent the browser's text selection on long-press. */
    e.preventDefault();
  }

  function handlePointerUp() {
    clearLongPressTimer();
    if (!longPressFired.current) {
      setModalOpen(true);
    }
  }

  function handlePointerCancel() {
    clearLongPressTimer();
  }

  if (!voice.supported) return null;
  if (voice.status === "disabled") return null;

  const currentExample = safeExamples[exampleIndex] ?? "";

  return (
    <>
      <button
        type="button"
        aria-label={t("pill.open")}
        title={t("pill.longPressHint")}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerCancel}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        className="group flex items-center gap-2.5 max-w-[18rem] md:max-w-[22rem] pl-2 pr-3 py-1.5 rounded-full bg-surface border border-border/70 hover:border-accent/60 transition-colors select-none"
      >
        {/* Mic dot — meditative breath when idle, solid when listening. */}
        <span className="relative inline-flex items-center justify-center w-7 h-7 shrink-0">
          {!reduced && !isListening && (
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "var(--color-accent)",
                opacity: 0.15,
                animation: "voice-breath 3.4s ease-in-out infinite",
              }}
            />
          )}
          {isListening && (
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: "var(--color-accent)",
                opacity: 0.35,
                animation: reduced ? undefined : "voice-pulse 1.2s ease-in-out infinite",
              }}
            />
          )}
          <MicrophoneIcon
            size={16}
            weight="fill"
            className={isListening ? "text-accent" : "text-accent/80"}
          />
        </span>

        {/* Rotating caption. */}
        <span className="flex items-center gap-1.5 min-w-0 leading-none">
          {/* Prefix: no uppercase, normal weight, muted — less intrusive than label-mono. */}
          <span className="font-mono text-[0.6875rem] font-normal text-text-muted tracking-wide shrink-0 translate-y-[0.05em]">
            {isListening ? t("pill.listening") : t("pill.prefix")}
          </span>
          {!isListening && (
            <span className="relative inline-flex items-center min-w-0">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={currentExample}
                  initial={reduced ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                  className="font-display italic text-text truncate inline-block max-w-[14rem] md:max-w-[18rem] leading-tight"
                >
                  {currentExample}
                </motion.span>
              </AnimatePresence>
            </span>
          )}
        </span>
      </button>

      <VoiceCommandsModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
