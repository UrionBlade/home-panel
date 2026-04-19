import { type ReactNode, useEffect } from "react";
import { useThemeStore } from "../../store/theme-store";
import { contrastFg, hexToRgb } from "../color";

interface ThemeProviderProps {
  children: ReactNode;
}

const STYLE_ID = "home-panel-accent-override";

export function ThemeProvider({ children }: ThemeProviderProps) {
  const mode = useThemeStore((state) => state.mode);
  const accentColor = useThemeStore((state) => state.accentColor);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "auto") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", mode);
    }
  }, [mode]);

  useEffect(() => {
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

    if (!accentColor) {
      styleEl?.remove();
      return;
    }

    const [r, g, b] = hexToRgb(accentColor);
    const fgColor = contrastFg(accentColor);

    const darken = (v: number) => Math.max(0, Math.round(v * 0.85 * 255));
    const hoverHex = `#${darken(r).toString(16).padStart(2, "0")}${darken(g).toString(16).padStart(2, "0")}${darken(b).toString(16).padStart(2, "0")}`;

    const vars = `--color-accent: ${accentColor} !important; --color-accent-hover: ${hoverHex} !important; --color-accent-foreground: ${fgColor} !important;`;
    const css = `
:root { ${vars} }
:root[data-theme="light"] { ${vars} }
:root[data-theme="dark"] { ${vars} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${vars} } }
`;

    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
  }, [accentColor]);

  return children;
}
