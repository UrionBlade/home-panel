import { AnimatePresence, motion } from "framer-motion";
import { DURATION_DEFAULT, DURATION_MICRO, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import { useT } from "../../lib/useT";
import { useVoiceContext } from "../../lib/voice/VoiceProvider";
import { Button } from "../ui/Button";

const WAVE_BAR_COUNT = 9;

export function VoiceListeningOverlay() {
  const reduced = useReducedMotion();
  const { t } = useT("voice");
  const { t: tCommon } = useT("common");
  const { status, transcript, response, toggle } = useVoiceContext();

  const isVisible = status === "listening" || status === "processing" || status === "speaking";

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_MICRO }}
            className="fixed inset-0 z-[9998] bg-bg/70 backdrop-blur-sm"
            onClick={toggle}
            aria-hidden
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{
              duration: DURATION_DEFAULT,
              ease: [...EASE_OUT_QUART],
            }}
            className="fixed inset-0 z-[9998] flex flex-col items-center justify-center p-8 pointer-events-none"
          >
            {/* Onda */}
            <div className="flex items-center gap-1 h-24 mb-8">
              {!reduced &&
                Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
                  const delay = i < WAVE_BAR_COUNT / 2 ? i * 0.08 : (WAVE_BAR_COUNT - 1 - i) * 0.08;
                  return (
                    <motion.span
                      key={i}
                      className="w-1.5 rounded-full bg-accent"
                      animate={{
                        height:
                          status === "listening"
                            ? [12, 80, 12]
                            : status === "speaking"
                              ? [20, 50, 20]
                              : [20, 40, 20],
                      }}
                      transition={{
                        duration: status === "listening" ? 0.8 : 1.4,
                        repeat: Infinity,
                        ease: [...EASE_OUT_QUART],
                        delay,
                      }}
                      style={{ height: 12 }}
                    />
                  );
                })}
              {reduced && (
                <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-accent" />
                </div>
              )}
            </div>

            {/* Stato */}
            <p className="text-text-muted text-lg mb-4">
              {status === "listening"
                ? t("status.listening")
                : status === "processing"
                  ? t("status.processing")
                  : t("status.speaking")}
            </p>

            {/* Trascrizione */}
            {transcript && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-text text-2xl font-display text-center max-w-lg mb-4"
              >
                &ldquo;{transcript}&rdquo;
              </motion.p>
            )}

            {/* Risposta */}
            {response && status === "speaking" && (
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-accent text-lg text-center max-w-lg mb-8"
              >
                {response}
              </motion.p>
            )}

            {/* Annulla */}
            <div className="pointer-events-auto">
              <Button variant="ghost" size="md" onClick={toggle}>
                {tCommon("actions.cancel")}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
