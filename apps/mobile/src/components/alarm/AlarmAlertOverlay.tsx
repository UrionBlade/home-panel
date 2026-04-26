/**
 * Always-mounted overlay that subscribes to alarm SSE events and shows
 * a full-width banner whenever the system fires. The banner stays up
 * until the user taps "Tacita" — meanwhile a beeping siren plays via
 * Web Audio (no audio asset to ship) and the device vibrates if the
 * platform supports it.
 *
 * Mounted at the AppShell level so it's reachable from every page.
 */

import type { AlarmEvent } from "@home-panel/shared";
import { ShieldWarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAlarmAcknowledge, useAlarmLiveSync } from "../../lib/hooks/useAlarm";
import { useT } from "../../lib/useT";

let audioCtx: AudioContext | null = null;

/** Three-tone alarm beep loop. Web Audio so we don't have to ship an
 *  audio file — works on iOS WKWebView once the user has interacted
 *  with the app. */
function playAlarmBeep(): () => void {
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
    [880, 1200].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    timer = setTimeout(playOnce, 900);
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
      /* some browsers reject vibrate without prior user interaction. */
    }
  }
}

export function AlarmAlertOverlay() {
  const { t } = useT("alarm");
  const [activeEvent, setActiveEvent] = useState<AlarmEvent | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const ackMutation = useAlarmAcknowledge();

  const onTriggered = useCallback((event: AlarmEvent) => {
    setActiveEvent(event);
    stopAudioRef.current?.();
    stopAudioRef.current = playAlarmBeep();
    vibrate([400, 120, 400, 120, 400]);
  }, []);

  useAlarmLiveSync(onTriggered);

  useEffect(
    () => () => {
      stopAudioRef.current?.();
    },
    [],
  );

  const dismiss = async () => {
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    if (activeEvent) {
      try {
        await ackMutation.mutateAsync(activeEvent.id);
      } catch {
        /* The user acknowledged locally; backend retry on next render. */
      }
    }
    setActiveEvent(null);
  };

  return (
    <AnimatePresence>
      {activeEvent && (
        <motion.div
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 30 }}
          className="fixed top-4 inset-x-4 z-[120] mx-auto max-w-2xl rounded-2xl border border-rose-500/60 bg-rose-500/95 text-white shadow-2xl shadow-rose-900/40 px-4 py-3 flex items-center gap-3 backdrop-blur"
          role="alert"
        >
          <ShieldWarningIcon size={28} weight="fill" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">
              {t(`triggered.${activeEvent.kind}`, { defaultValue: t("triggered.contact_open") })}
            </p>
            <p className="text-sm text-white/85 truncate">{activeEvent.friendlyName}</p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/20 hover:bg-white/30 px-3 py-2 text-sm font-medium"
          >
            <XCircleIcon size={18} weight="fill" />
            {t("dismiss")}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
