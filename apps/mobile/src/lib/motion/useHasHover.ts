import { useEffect, useState } from "react";

/**
 * Returns true only on pointer devices that support true hover (mouse/trackpad).
 * On touch-only screens (iPad without mouse) this returns false, so hover
 * animations are suppressed and do not fire spuriously on long-press.
 *
 * Reacts to runtime changes (e.g. attaching a Bluetooth mouse to an iPad).
 */
export function useHasHover(): boolean {
  const [hasHover, setHasHover] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(hover: hover)").matches;
  });

  useEffect(() => {
    const mql = window.matchMedia("(hover: hover)");
    const handler = (e: MediaQueryListEvent) => setHasHover(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return hasHover;
}
