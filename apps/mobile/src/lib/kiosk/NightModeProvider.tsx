import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useKioskSettings } from "../hooks/useKioskSettings";
import { isInNightRange } from "./isInNightRange";

interface NightModeContextValue {
  isNight: boolean;
  /** Temporarily forces night mode (for testing). null = automatic. */
  setForceNight: (value: boolean | null) => void;
}

const NightModeContext = createContext<NightModeContextValue>({
  isNight: false,
  setForceNight: () => {},
});

/** Update aligned to the next whole minute to avoid drift. */
export function NightModeProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useKioskSettings();
  const [forceNight, setForceNight] = useState<boolean | null>(null);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

  // Tick every minute aligned to :00 to stay in sync with the clock
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => setCurrentHour(new Date().getHours());

    const now = new Date();
    const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60_000);
    }, msToNextMinute);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const isNight = useMemo(() => {
    if (forceNight !== null) return forceNight;
    if (!settings?.nightModeEnabled) return false;
    return isInNightRange(currentHour, settings.nightStartHour, settings.nightEndHour);
  }, [forceNight, settings, currentHour]);

  // Apply/remove data-night-mode on documentElement
  useEffect(() => {
    const root = document.documentElement;
    if (isNight) {
      root.setAttribute("data-night-mode", "true");
    } else {
      root.removeAttribute("data-night-mode");
    }
    return () => {
      root.removeAttribute("data-night-mode");
    };
  }, [isNight]);

  const handleSetForceNight = useCallback((value: boolean | null) => {
    setForceNight(value);
  }, []);

  const value = useMemo(
    () => ({ isNight, setForceNight: handleSetForceNight }),
    [isNight, handleSetForceNight],
  );

  return <NightModeContext.Provider value={value}>{children}</NightModeContext.Provider>;
}

export function useNightMode() {
  return useContext(NightModeContext);
}
