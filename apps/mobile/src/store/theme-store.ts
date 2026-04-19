import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ThemeMode = "auto" | "light" | "dark";

interface ThemeState {
  mode: ThemeMode;
  /** Colore accent custom (hex). null = default terracotta */
  accentColor: string | null;
  setMode: (mode: ThemeMode) => void;
  setAccentColor: (color: string | null) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "auto",
      accentColor: null,
      setMode: (mode) => set({ mode }),
      setAccentColor: (accentColor) => set({ accentColor }),
    }),
    {
      name: "home-panel:theme",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
