/**
 * Home dashboard tile that surfaces ALPSTUGA + TIMMERFLÖTTE readings.
 *
 * - Aggregates every env_sensor on a single tile, listed by room.
 * - Color-codes CO2 + PM2.5 against the public-health thresholds in
 *   `lib/sensors/thresholds.ts`.
 * - Renders nothing when no sensors are configured (skipping the tile
 *   altogether is less noisy than a "set me up" placeholder, and the
 *   user wires DIRIGERA via Settings anyway).
 */

import type { EnvSensor } from "@home-panel/shared";
import { DropIcon, SmileyIcon, ThermometerIcon, WindIcon } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { useNavigate } from "react-router-dom";
import { useEnvSensors } from "../../lib/hooks/useEnvSensors";
import { SEVERITY_TEXT_CLASS, severityForCo2, severityForPm25 } from "../../lib/sensors/thresholds";
import { useT } from "../../lib/useT";
import { Tile } from "../ui/Tile";

function formatNumber(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
}

interface SensorRowProps {
  sensor: EnvSensor;
}

function SensorRow({ sensor }: SensorRowProps) {
  const { t } = useT("sensors");
  const label = sensor.roomName ?? sensor.friendlyName;
  const co2Severity = severityForCo2(sensor.co2Ppm);
  const pm25Severity = severityForPm25(sensor.pm25);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-base text-text leading-tight truncate">{label}</span>
        {sensor.offline && <span className="text-xs text-text-muted italic">offline</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        {sensor.temperatureC != null && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <ThermometerIcon size={14} weight="fill" className="opacity-70" />
            <span className="text-text font-medium">
              {formatNumber(sensor.temperatureC, 1)}
              {t("units.celsius")}
            </span>
          </div>
        )}
        {sensor.humidityPct != null && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <DropIcon size={14} weight="fill" className="opacity-70" />
            <span className="text-text font-medium">
              {formatNumber(sensor.humidityPct)}
              {t("units.percent")}
            </span>
          </div>
        )}
        {sensor.co2Ppm != null && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <WindIcon size={14} weight="fill" className="opacity-70" />
            <span className={clsx("font-medium", SEVERITY_TEXT_CLASS[co2Severity])}>
              {formatNumber(sensor.co2Ppm)} {t("units.ppm")}
            </span>
          </div>
        )}
        {sensor.pm25 != null && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <SmileyIcon size={14} weight="fill" className="opacity-70" />
            <span className={clsx("font-medium", SEVERITY_TEXT_CLASS[pm25Severity])}>
              {formatNumber(sensor.pm25)} {t("units.ugm3")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AirQualityTile() {
  const { t } = useT("sensors");
  const navigate = useNavigate();
  const { data: sensors = [], isLoading } = useEnvSensors();

  /* Hide entirely when no sensor is paired — a "set me up" placeholder
   * would just be visual noise on a busy dashboard. */
  if (!isLoading && sensors.length === 0) return null;

  /* Pick the worst CO2 reading across sensors to drive the tile's
   * gradient hue: green when calm, ochre when borderline, blush when
   * actionable. Mirrors the per-row coloring at tile scale. */
  const worstCo2 = sensors.reduce<number | null>((max, s) => {
    if (s.co2Ppm == null) return max;
    return max == null ? s.co2Ppm : Math.max(max, s.co2Ppm);
  }, null);
  const tileTone =
    worstCo2 == null
      ? "var(--tile-sage-b)"
      : worstCo2 >= 1200
        ? "var(--tile-blush-b)"
        : worstCo2 >= 800
          ? "var(--tile-ochre-b)"
          : "var(--tile-sage-b)";

  return (
    <Tile size="md" onClick={() => navigate("/casa")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 100% 100%, ${tileTone} 0%, transparent 55%)`,
          opacity: 0.55,
        }}
      />
      <WindIcon
        size={68}
        weight="duotone"
        className="absolute top-3 right-3 pointer-events-none select-none text-text-muted opacity-30"
      />
      <div className="relative flex flex-col h-full z-10 gap-3 pr-16 md:pr-20">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("title")}
          {sensors.length > 0 ? (
            <span className="ml-2 text-text-muted font-normal">· {sensors.length}</span>
          ) : null}
        </span>
        {isLoading ? (
          <div className="flex-1 flex items-center">
            <div className="h-4 w-32 rounded bg-surface-muted animate-pulse" />
          </div>
        ) : (
          <div className="flex flex-col gap-3 overflow-y-auto min-w-0">
            {sensors.map((s) => (
              <SensorRow key={s.id} sensor={s} />
            ))}
          </div>
        )}
      </div>
    </Tile>
  );
}
