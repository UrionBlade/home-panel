/**
 * Always-mounted overlay that subscribes to `sensors:leak-trigger`
 * SSE events and shows a blocking modal whenever a water-leak sensor
 * fires. Web Audio drives the alarm tone so we don't need to ship an
 * audio asset (consistent with `AlarmAlertOverlay`).
 *
 * The modal closes when the user acknowledges (POST /sensors/leak/:id/ack)
 * or when the upstream sensor returns to dry — `sensors:leak-ack`.
 */

import type { LeakAlertPayload } from "@home-panel/shared";
import { DropIcon, XCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAckLeak } from "../../lib/hooks/useLeakSensors";
import { sseClient } from "../../lib/sse-client";
import { useT } from "../../lib/useT";
import { useUiStore } from "../../store/ui-store";

let audioCtx: AudioContext | null = null;

/* Continuous siren-style sweep — distinct from the security alarm beep
 * so the user knows immediately which alert this is. */
function playLeakSiren(): () => void {
  if (typeof AudioContext === "undefined") return () => {};
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return () => {};
    }
  }
  const ctx = audioCtx;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const playOnce = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.linearRampToValueAtTime(820, now + 0.4);
    osc.frequency.linearRampToValueAtTime(520, now + 0.8);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
    timer = setTimeout(playOnce, 850);
  };

  playOnce();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

function vibrate(pattern: number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* iOS Safari rejects vibrate without a prior user gesture. */
    }
  }
}

export function LeakAlertOverlay() {
  const { t } = useT("sensors");
  const [active, setActive] = useState<LeakAlertPayload | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const ackMutation = useAckLeak();
  const pushToast = useUiStore((s) => s.pushToast);

  const onTriggered = useCallback((event: LeakAlertPayload) => {
    setActive(event);
    stopAudioRef.current?.();
    stopAudioRef.current = playLeakSiren();
    vibrate([300, 100, 300, 100, 300, 100, 600]);
  }, []);

  const onAck = useCallback((sensorId: string) => {
    setActive((current) => {
      if (current && current.sensorId === sensorId) {
        stopAudioRef.current?.();
        stopAudioRef.current = null;
        return null;
      }
      return current;
    });
  }, []);

  useEffect(() => {
    const off1 = sseClient.subscribe("sensors:leak-trigger", (raw) => {
      const evt = raw as LeakAlertPayload | null;
      if (!evt || typeof evt.sensorId !== "string") return;
      onTriggered(evt);
    });
    const off2 = sseClient.subscribe("sensors:leak-ack", (raw) => {
      const data = raw as { sensorId?: string } | null;
      if (data?.sensorId) onAck(data.sensorId);
    });
    return () => {
      off1();
      off2();
    };
  }, [onTriggered, onAck]);

  useEffect(
    () => () => {
      stopAudioRef.current?.();
    },
    [],
  );

  const dismiss = async () => {
    if (!active) return;
    const sensorId = active.sensorId;
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    setActive(null);
    try {
      await ackMutation.mutateAsync(sensorId);
      pushToast({ tone: "success", text: t("leak.ackToast") });
    } catch {
      /* User intent honoured locally; backend may retry on reload. */
    }
  };

  const bodyText = active
    ? active.roomName
      ? t("leak.modalBody", { sensor: active.friendlyName, room: active.roomName })
      : t("leak.modalBodyNoRoom", { sensor: active.friendlyName })
    : "";

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leak-alert-title"
        >
          <motion.div
            initial={{ scale: 0.85, y: 30 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="w-full max-w-md rounded-3xl bg-rose-600 text-white shadow-2xl p-6 flex flex-col gap-5"
          >
            <div className="flex items-start gap-3">
              <DropIcon size={36} weight="fill" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 id="leak-alert-title" className="text-xl font-bold leading-tight">
                  {t("leak.modalTitle")}
                </h2>
                <p className="text-base text-white/90 mt-1">{bodyText}</p>
                <p className="text-sm text-white/75 mt-3">{t("leak.tryReachable")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/20 hover:bg-white/30 active:bg-white/40 px-4 py-3 text-base font-semibold transition-colors"
            >
              <XCircleIcon size={20} weight="fill" />
              {t("leak.ack")}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
