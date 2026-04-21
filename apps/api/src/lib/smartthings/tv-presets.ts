import type { TvAppPreset } from "@home-panel/shared";

/**
 * Tizen app presets exposed as shortcuts in the TV tile and voice intents.
 *
 * The exact appId varies by firmware year — the Samsung Smart Hub can accept
 * both reverse-DNS package names (org.tizen.netflix-app) and numeric IDs
 * (3201611010016). The values below are best-guess defaults and MUST be
 * validated against the user's actual TV during QA (task group 13).
 */
export const TV_APP_PRESETS: readonly TvAppPreset[] = [
  {
    key: "netflix",
    label: "Netflix",
    icon: "Play",
    appId: "org.tizen.netflix-app",
  },
  {
    key: "youtube",
    label: "YouTube",
    icon: "YoutubeLogo",
    appId: "111299001912",
  },
  {
    key: "prime",
    label: "Prime Video",
    icon: "FilmStrip",
    appId: "3201512006785",
  },
  {
    key: "disney",
    label: "Disney+",
    icon: "Sparkle",
    appId: "3201901017640",
  },
  {
    key: "raiplay",
    label: "RaiPlay",
    icon: "Television",
    appId: "3201611010011",
  },
];

export function getPresetByKey(key: string): TvAppPreset | undefined {
  return TV_APP_PRESETS.find((p) => p.key === key);
}
