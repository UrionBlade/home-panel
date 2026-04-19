import { PauseIcon, PlayIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  useAddTime,
  useDismissTimer,
  usePauseTimer,
  useResumeTimer,
  useTimers,
} from "../../lib/hooks/useTimers";
import { DURATION_DEFAULT, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function progressPercent(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (remaining / total) * 100));
}

export function ActiveTimers() {
  const { t } = useT("timers");
  const { data: timers = [] } = useTimers();
  const pauseMut = usePauseTimer();
  const resumeMut = useResumeTimer();
  const addTimeMut = useAddTime();
  const dismissMut = useDismissTimer();

  const active = timers.filter((t) => t.status !== "finished");

  if (active.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">{t("timers.title")}</h2>
        <p className="text-text-muted">{t("timers.empty")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-2xl">{t("timers.title")}</h2>
      <AnimatePresence mode="popLayout">
        {active.map((timer) => {
          const progress = progressPercent(timer.remainingSeconds, timer.durationSeconds);
          return (
            <motion.div
              key={timer.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{
                duration: DURATION_DEFAULT,
                ease: [...EASE_OUT_QUART],
              }}
              className="relative rounded-md border border-border bg-surface-elevated p-6 overflow-hidden"
            >
              {/* Progress bar background */}
              <div
                className="absolute inset-0 bg-accent/10 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />

              <div className="relative flex items-center gap-6">
                {/* Countdown */}
                <div className="flex flex-col items-center gap-1 min-w-[8rem]">
                  <span className="font-display text-5xl tabular-nums leading-none">
                    {formatTime(timer.remainingSeconds)}
                  </span>
                  {timer.label && (
                    <span className="text-sm text-text-muted truncate max-w-[10rem]">
                      {timer.label}
                    </span>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 ml-auto">
                  {timer.status === "running" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => pauseMut.mutate(timer.id)}
                      iconLeft={<PauseIcon size={18} weight="duotone" />}
                    >
                      {t("timers.pause")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resumeMut.mutate(timer.id)}
                      iconLeft={<PlayIcon size={18} weight="duotone" />}
                    >
                      {t("timers.resume")}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addTimeMut.mutate(timer.id)}
                    iconLeft={<PlusIcon size={18} weight="duotone" />}
                  >
                    {t("timers.addMinute")}
                  </Button>

                  <Button
                    variant="icon"
                    size="sm"
                    onClick={() => dismissMut.mutate(timer.id)}
                    aria-label={t("timers.dismiss")}
                  >
                    <XIcon size={20} weight="bold" />
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </section>
  );
}
