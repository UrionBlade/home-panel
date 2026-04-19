import type { Alarm, Timer } from "@home-panel/shared";
import { BellRingingIcon, TimerIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { useAddTime, useDismissTimer } from "../../lib/hooks/useTimers";
import { DURATION_DEFAULT, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { sseClient } from "../../lib/sse-client";
import { primeAudio, startAlertSound, stopAlertSound } from "../../lib/timers/alertSound";
import { registerActiveAlert, unregisterActiveAlert } from "../../lib/timers/alertStore";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";

interface OverlayState {
  type: "timer" | "alarm";
  id: string;
  label: string;
}

export function TimerOverlay() {
  const { t } = useT("timers");
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const dismissMut = useDismissTimer();
  const addTimeMut = useAddTime();

  const handleDismiss = useCallback(() => {
    stopAlertSound();
    unregisterActiveAlert();
    setOverlay((current) => {
      if (current?.type === "timer") {
        dismissMut.mutate(current.id);
      }
      return null;
    });
  }, [dismissMut]);

  const handleAddMinute = useCallback(() => {
    stopAlertSound();
    unregisterActiveAlert();
    setOverlay((current) => {
      if (current?.type === "timer") {
        addTimeMut.mutate(current.id);
      }
      return null;
    });
  }, [addTimeMut]);

  // SSE subscription
  useEffect(() => {
    const unsubTimer = sseClient.subscribe("timer:finished", (data) => {
      const timer = data as Timer;
      setOverlay({
        type: "timer",
        id: timer.id,
        label: timer.label ?? "",
      });
    });
    const unsubAlarm = sseClient.subscribe("alarm:fired", (data) => {
      const alarm = data as Alarm;
      setOverlay({
        type: "alarm",
        id: alarm.id,
        label: alarm.label,
      });
    });
    return () => {
      unsubTimer();
      unsubAlarm();
    };
  }, []);

  // Audio + registrazione store quando overlay attivo
  useEffect(() => {
    if (!overlay) return;
    primeAudio();
    startAlertSound();
    registerActiveAlert(handleDismiss);
    return () => {
      stopAlertSound();
      unregisterActiveAlert();
    };
  }, [overlay, handleDismiss]);

  return (
    <AnimatePresence>
      {overlay && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION_DEFAULT, ease: [...EASE_OUT_QUART] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-bg/90 backdrop-blur-lg"
        >
          <motion.div
            className="absolute inset-0 bg-accent/15"
            animate={{ opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative flex flex-col items-center gap-8 p-8">
            <motion.div
              animate={{
                scale: [1, 1.15, 1],
                rotate: overlay.type === "alarm" ? [0, -10, 10, -10, 0] : [0, 0, 0],
              }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
            >
              {overlay.type === "alarm" ? (
                <BellRingingIcon size={96} weight="duotone" className="text-accent" />
              ) : (
                <TimerIcon size={96} weight="duotone" className="text-accent" />
              )}
            </motion.div>

            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="font-display text-5xl">
                {overlay.type === "timer" ? t("timers.finished") : t("alarms.fired")}
              </h2>
              {overlay.label && <p className="text-2xl text-text-muted">{overlay.label}</p>}
              <p className="text-sm text-text-muted mt-2">
                Di' "Ok casa, ferma" o tocca per fermare
              </p>
            </div>

            <div className="flex gap-4">
              <Button size="lg" onClick={handleDismiss}>
                {t("timers.dismiss")}
              </Button>
              {overlay.type === "timer" && (
                <Button variant="ghost" size="lg" onClick={handleAddMinute}>
                  {t("timers.addMinute")}
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
