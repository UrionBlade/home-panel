import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";
import { useT } from "../../lib/useT";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

interface ClockProps {
  variant?: "compact" | "hero";
}

/** Digit con flip animation verticale quando cambia. */
function FlipDigit({ value, className }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduced ? false : { y: "-55%", opacity: 0, rotateX: -60 }}
          animate={{ y: 0, opacity: 1, rotateX: 0 }}
          exit={reduced ? undefined : { y: "55%", opacity: 0, rotateX: 60 }}
          transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
          className="inline-block"
          style={{ transformOrigin: "center", transformStyle: "preserve-3d" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function Clock({ variant = "compact" }: ClockProps) {
  const { t } = useT("common");
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (variant === "hero") {
      // Hero shows animated digits — update every second.
      const id = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(id);
    }

    // Compact only shows HH:MM — align first tick to the next full minute,
    // then switch to a steady 60-second interval to avoid drift.
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    const timeoutId = setTimeout(() => {
      setNow(new Date());
      intervalId = setInterval(() => setNow(new Date()), 60_000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [variant]);

  const locale = i18n.language.startsWith("it") ? "it-IT" : "en-US";
  const dateLine = now.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());

  if (variant === "hero") {
    const greeting =
      now.getHours() < 12
        ? t("greeting.morning")
        : now.getHours() < 18
          ? t("greeting.afternoon")
          : t("greeting.evening");

    return (
      <div className="flex flex-col items-start">
        <motion.p
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0, 0, 1] }}
          className="label-italic text-text-muted"
          style={{ fontSize: "clamp(0.95rem, 1.6vw, 1.5rem)" }}
        >
          {greeting}
        </motion.p>
        <div
          className="font-display tabular-nums tracking-[-0.04em] leading-[0.82] text-text flex items-baseline"
          style={{
            fontSize: "clamp(3.5rem, 10vw, 9rem)",
            fontWeight: 900,
            perspective: "800px",
          }}
        >
          <FlipDigit value={hh.charAt(0)} />
          <FlipDigit value={hh.charAt(1)} />
          {/* Two-tone colon: bottom dot in muted grey, top dot painted accent.
           * Same glyph drawn twice; the second copy is clipped to its upper
           * half so the dots split neatly between accent and muted. */}
          <span className="relative inline-block mx-[0.04em]" aria-hidden>
            <span className="opacity-60">:</span>
            <span className="absolute inset-0 text-accent" style={{ clipPath: "inset(0 0 38% 0)" }}>
              :
            </span>
          </span>
          <FlipDigit value={mm.charAt(0)} />
          <FlipDigit value={mm.charAt(1)} />
        </div>
        <p
          className="font-display text-text-muted capitalize mt-2 tracking-tight"
          style={{ fontSize: "clamp(0.95rem, 1.6vw, 1.625rem)" }}
        >
          {dateLine}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col leading-tight">
      <span className="text-text-muted text-sm capitalize">{dateLine}</span>
      <span className="font-display text-xl tabular-nums tracking-tight text-text font-bold">
        {hh}:{mm}
      </span>
    </div>
  );
}
