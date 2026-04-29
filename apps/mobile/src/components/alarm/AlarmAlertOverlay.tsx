/**
 * Always-mounted overlay that subscribes to alarm SSE events and shows
 * a fullscreen modal with a numeric keypad whenever the alarm fires.
 * The user must enter the configured disarm code to silence the
 * sirens — wrong codes shake the input but never lock anyone out.
 *
 * Mounted at the AppShell level so it intercepts the alarm regardless
 * of which page the user happens to be on.
 *
 * If no disarm code has been configured yet, the keypad is replaced by
 * a single "Disarma" button — better than blocking the user behind a
 * code that doesn't exist.
 */

import type { AlarmEvent } from "@home-panel/shared";
import { BackspaceIcon, ShieldWarningIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api-client";
import {
  useAlarmDisarm,
  useAlarmLiveSync,
  useAlarmSilence,
  useDisarmCodeStatus,
} from "../../lib/hooks/useAlarm";
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

const MAX_CODE_LEN = 8;

export function AlarmAlertOverlay() {
  const { t } = useT("alarm");
  const [activeEvent, setActiveEvent] = useState<AlarmEvent | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);

  const { data: codeStatus } = useDisarmCodeStatus();
  const silenceMutation = useAlarmSilence();
  const disarmMutation = useAlarmDisarm();

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

  const close = () => {
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    setActiveEvent(null);
  };

  return (
    <AnimatePresence>
      {activeEvent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[150] bg-rose-950/90 backdrop-blur-md flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal
          aria-label={t("modal.title")}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="w-full max-w-md flex flex-col items-center gap-5 rounded-2xl bg-bg shadow-2xl border border-rose-500/40 p-6"
          >
            <ShieldWarningIcon size={56} weight="fill" className="text-rose-500" />
            <div className="text-center">
              <h2 className="font-display text-2xl text-text">
                {t(`triggered.${activeEvent.kind}`, { defaultValue: t("triggered.contact_open") })}
              </h2>
              <p className="text-text-muted mt-1">{activeEvent.friendlyName}</p>
            </div>

            {codeStatus?.configured ? (
              <CodeKeypad
                onSubmit={async (code) => {
                  try {
                    await silenceMutation.mutateAsync({ code });
                    close();
                    return { ok: true };
                  } catch (err) {
                    if (err instanceof ApiError && err.status === 401) {
                      return { ok: false, reason: "wrong" };
                    }
                    return {
                      ok: false,
                      reason: err instanceof Error ? err.message : "unknown",
                    };
                  }
                }}
              />
            ) : (
              <div className="w-full flex flex-col gap-2">
                <p className="text-sm text-text-muted text-center px-2">{t("modal.codeMissing")}</p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await disarmMutation.mutateAsync();
                    } finally {
                      close();
                    }
                  }}
                  className="rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3"
                >
                  {t("disarmNow")}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/*  Numeric keypad                                                      */
/* ------------------------------------------------------------------ */

interface CodeKeypadProps {
  onSubmit: (code: string) => Promise<{ ok: boolean; reason?: string }>;
}

function CodeKeypad({ onSubmit }: CodeKeypadProps) {
  const { t } = useT("alarm");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useAnimationControls();

  const append = (digit: string) => {
    if (busy) return;
    setError(null);
    setCode((prev) => (prev.length >= MAX_CODE_LEN ? prev : prev + digit));
  };

  const backspace = () => {
    if (busy) return;
    setCode((prev) => prev.slice(0, -1));
  };

  const submit = useCallback(async () => {
    if (busy || code.length < 4) return;
    setBusy(true);
    const res = await onSubmit(code);
    if (!res.ok) {
      setBusy(false);
      setCode("");
      setError(res.reason === "wrong" ? t("modal.codeWrong") : t("modal.codeError"));
      void shake.start({
        x: [0, -10, 10, -8, 8, -4, 4, 0],
        transition: { duration: 0.45 },
      });
      vibrate([60, 40, 60]);
      return;
    }
    /* On success the SSE silenced event closes the overlay; we don't
     * touch local state here so the close animation can play. */
  }, [busy, code, onSubmit, shake, t]);

  /* Auto-submit when the user has entered enough digits. We pick 4 as
   * the floor and submit on every keystroke beyond that — one less tap
   * compared to a manual "Conferma" button, which a panicked user
   * shouldn't need to find. */
  useEffect(() => {
    if (code.length >= 4 && !busy) {
      const id = setTimeout(() => void submit(), 200);
      return () => clearTimeout(id);
    }
  }, [code, busy, submit]);

  return (
    <motion.div animate={shake} className="w-full flex flex-col gap-4">
      {/* Code dots — show one filled circle per entered digit, max 8. */}
      <div className="flex items-center justify-center gap-2 h-10">
        {Array.from({ length: Math.max(4, code.length || 4) }).map((_, i) => (
          <span
            key={i}
            className={[
              "block w-3 h-3 rounded-full transition-colors",
              i < code.length ? "bg-rose-500" : "bg-border",
            ].join(" ")}
          />
        ))}
      </div>

      {error && <p className="text-sm text-rose-500 text-center">{error}</p>}

      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <KeypadButton key={d} label={d} onPress={() => append(d)} disabled={busy} />
        ))}
        <KeypadButton label="" onPress={() => {}} disabled />
        <KeypadButton label="0" onPress={() => append("0")} disabled={busy} />
        <KeypadButton
          label={<BackspaceIcon size={22} weight="duotone" />}
          onPress={backspace}
          disabled={busy || code.length === 0}
          aria-label={t("modal.backspace")}
        />
      </div>
    </motion.div>
  );
}

function KeypadButton({
  label,
  onPress,
  disabled,
  ...rest
}: {
  label: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={[
        "h-14 rounded-lg text-2xl font-semibold transition-colors",
        "bg-surface border border-border text-text",
        "hover:bg-surface-warm active:bg-surface-muted",
        "disabled:opacity-30 disabled:cursor-default disabled:hover:bg-surface",
      ].join(" ")}
      {...rest}
    >
      {label}
    </button>
  );
}
