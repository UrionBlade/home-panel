/**
 * Air-quality severity thresholds.
 *
 * Anchored on commonly cited indoor-air guidelines:
 *   - CO2: WHO/REHVA — ambient ~400 ppm, comfortable < 800, drowsy
 *     above 1200, ventilate ASAP above 1500.
 *   - PM2.5: WHO 2021 24h guideline 15 µg/m³, action target 35.
 *
 * Buckets are intentionally coarse (good / medium / high) to keep the
 * UI legible without becoming alarmist. The `unknown` bucket covers
 * sensors that haven't yet reported a value.
 */

import type { SensorSeverity } from "@home-panel/shared";

/* Bands aligned with the IKEA Home smart app for KLIPPBOK / ALPSTUGA so
 * the panel doesn't disagree with the source the user already trusts.
 * Temperature + humidity get their own categorical labels (cold / mild
 * / warm and dry / comfort / humid) since "good/medium/high" doesn't
 * map cleanly to climate values. */
export const CO2_THRESHOLDS = { medium: 1000, high: 2000 } as const;
export const PM25_THRESHOLDS = { medium: 15, high: 85 } as const;
export const TEMP_THRESHOLDS = { mild: 18, warm: 23 } as const;
export const HUMIDITY_THRESHOLDS = { comfort: 40, humid: 60 } as const;

export type ClimateLabel = "cold" | "mild" | "warm" | "unknown";
export type HumidityLabel = "dry" | "comfort" | "humid" | "unknown";

export function severityForCo2(ppm: number | null): SensorSeverity {
  if (ppm == null) return "unknown";
  if (ppm >= CO2_THRESHOLDS.high) return "high";
  if (ppm >= CO2_THRESHOLDS.medium) return "medium";
  return "good";
}

export function severityForPm25(pm: number | null): SensorSeverity {
  if (pm == null) return "unknown";
  if (pm >= PM25_THRESHOLDS.high) return "high";
  if (pm >= PM25_THRESHOLDS.medium) return "medium";
  return "good";
}

export function labelForTemperature(c: number | null): ClimateLabel {
  if (c == null) return "unknown";
  if (c >= TEMP_THRESHOLDS.warm) return "warm";
  if (c >= TEMP_THRESHOLDS.mild) return "mild";
  return "cold";
}

export function labelForHumidity(pct: number | null): HumidityLabel {
  if (pct == null) return "unknown";
  if (pct >= HUMIDITY_THRESHOLDS.humid) return "humid";
  if (pct >= HUMIDITY_THRESHOLDS.comfort) return "comfort";
  return "dry";
}

/** Tailwind-style color mapping the AirQualityTile applies to badges
 * + values. Kept here so a future redesign / dark-mode tweak only
 * touches one file. */
export const SEVERITY_TEXT_CLASS: Record<SensorSeverity, string> = {
  good: "text-success",
  medium: "text-warning",
  high: "text-danger",
  unknown: "text-text-muted",
};

export const SEVERITY_BG_CLASS: Record<SensorSeverity, string> = {
  good: "bg-success/10",
  medium: "bg-warning/10",
  high: "bg-danger/10",
  unknown: "bg-surface-muted",
};
