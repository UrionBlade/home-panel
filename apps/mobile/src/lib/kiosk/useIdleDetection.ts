import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_EVENTS: Array<keyof WindowEventMap> = [
  "mousemove",
  "mousedown",
  "touchstart",
  "touchmove",
  "keydown",
];

/**
 * Hook che rileva l'inattivita dell'utente.
 * Dopo `timeoutMs` millisecondi senza interazione, `isIdle` diventa true.
 */
export function useIdleDetection(timeoutMs: number): {
  isIdle: boolean;
  resetIdle: () => void;
} {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    setIsIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsIdle(true), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    // Start the initial idle timer
    timerRef.current = setTimeout(() => setIsIdle(true), timeoutMs);

    const handler = () => reset();

    for (const event of IDLE_EVENTS) {
      window.addEventListener(event, handler, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of IDLE_EVENTS) {
        window.removeEventListener(event, handler);
      }
    };
  }, [timeoutMs, reset]);

  return { isIdle, resetIdle: reset };
}
