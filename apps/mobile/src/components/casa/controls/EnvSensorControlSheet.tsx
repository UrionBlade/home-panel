/**
 * Detail sheet for ALPSTUGA / TIMMERFLÖTTE — opens on tap of a sensor
 * tile in CasaPage and shows the four readings (CO2, PM2.5, temp,
 * humidity) with severity bands matching the IKEA Home smart app, plus
 * a 7-day inline trend chart per metric.
 */

import type { EnvHistoryPoint, EnvSensor } from "@home-panel/shared";
import { DropIcon, SmileyIcon, ThermometerIcon, WindIcon } from "@phosphor-icons/react";
import { clsx } from "clsx";
import { useState } from "react";
import { useEnvSensorHistory } from "../../../lib/hooks/useEnvSensors";
import {
  type ClimateLabel,
  type HumidityLabel,
  labelForHumidity,
  labelForTemperature,
  SEVERITY_TEXT_CLASS,
  severityForCo2,
  severityForPm25,
} from "../../../lib/sensors/thresholds";
import { useT } from "../../../lib/useT";
import { BottomSheet } from "../BottomSheet";

type Range = "hours" | "day" | "week";
const RANGE_HOURS: Record<Range, number> = { hours: 6, day: 24, week: 168 };

/* Tailwind doesn't ship oklch arbitrary values reliably across versions
 * so we lean on the existing severity tokens for color. The chart line
 * just inherits currentColor from its wrapper. */
const CLIMATE_TEXT: Record<ClimateLabel, string> = {
  cold: "text-sky-600 dark:text-sky-300",
  mild: "text-success",
  warm: "text-warning",
  unknown: "text-text-muted",
};
const HUMIDITY_TEXT: Record<HumidityLabel, string> = {
  dry: "text-warning",
  comfort: "text-success",
  humid: "text-sky-600 dark:text-sky-300",
  unknown: "text-text-muted",
};

interface SparklineProps {
  values: Array<number | null>;
  className?: string;
}

/** Compact SVG sparkline over an array of nullable readings. We compute
 * min/max ourselves so a bucket without data simply leaves a gap. */
function Sparkline({ values, className }: SparklineProps) {
  const points = values
    .map((v, i) => ({ x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p.y != null);
  if (points.length < 2) {
    return (
      <div className={clsx("h-12 grid place-items-center text-xs text-text-muted", className)} />
    );
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const width = 100;
  const height = 32;
  const path = points
    .map((p, idx) => {
      const x = ((p.x - xMin) / xRange) * width;
      const y = height - ((p.y - yMin) / yRange) * height;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={clsx("h-12 w-full", className)}
      aria-hidden
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  severityLabel: string;
  severityClass: string;
  history: Array<number | null>;
}

function MetricCard({
  icon,
  label,
  value,
  severityLabel,
  severityClass,
  history,
}: MetricCardProps) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-text-muted">
        {icon}
        <span className="text-sm">{label}</span>
        <span className={clsx("ml-auto text-xs font-medium", severityClass)}>{severityLabel}</span>
      </div>
      <div className={clsx("font-display text-3xl leading-none", severityClass)}>{value}</div>
      <div className={severityClass}>
        <Sparkline values={history} />
      </div>
    </div>
  );
}

interface SheetProps {
  open: boolean;
  sensor: EnvSensor;
  onClose: () => void;
}

export function EnvSensorControlSheet({ open, sensor, onClose }: SheetProps) {
  const { t } = useT("sensors");
  const [range, setRange] = useState<Range>("week");
  const { data: history = [] } = useEnvSensorHistory(sensor.id, RANGE_HOURS[range]);

  const co2Series = history.map((p: EnvHistoryPoint) => p.co2Ppm);
  const pmSeries = history.map((p: EnvHistoryPoint) => p.pm25);
  const tempSeries = history.map((p: EnvHistoryPoint) => p.temperatureC);
  const humSeries = history.map((p: EnvHistoryPoint) => p.humidityPct);

  const co2Sev = severityForCo2(sensor.co2Ppm);
  const pmSev = severityForPm25(sensor.pm25);
  const tempLabel = labelForTemperature(sensor.temperatureC);
  const humLabel = labelForHumidity(sensor.humidityPct);

  const fmt = (n: number | null, digits = 0, suffix = ""): string =>
    n == null ? "—" : `${digits === 0 ? Math.round(n) : n.toFixed(digits)}${suffix}`;

  return (
    <BottomSheet open={open} onClose={onClose} title={sensor.friendlyName}>
      <div className="flex flex-col gap-4 pb-2">
        {/* Range selector — applies to all four sparklines at once */}
        <div className="inline-flex self-start rounded-lg bg-surface-muted p-1 gap-1">
          {(["hours", "day", "week"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={clsx(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                range === r ? "bg-bg shadow-sm text-text" : "text-text-muted hover:text-text",
              )}
            >
              {t(`ranges.${r}`)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sensor.co2Ppm != null && (
            <MetricCard
              icon={<WindIcon size={18} weight="fill" />}
              label={t("labels.co2")}
              value={fmt(sensor.co2Ppm, 0, ` ${t("units.ppm")}`)}
              severityLabel={t(`thresholds.co2.${co2Sev === "unknown" ? "good" : co2Sev}`)}
              severityClass={SEVERITY_TEXT_CLASS[co2Sev]}
              history={co2Series}
            />
          )}
          {sensor.pm25 != null && (
            <MetricCard
              icon={<SmileyIcon size={18} weight="fill" />}
              label={t("labels.pm25")}
              value={fmt(sensor.pm25, 0, ` ${t("units.ugm3")}`)}
              severityLabel={t(`thresholds.pm25.${pmSev === "unknown" ? "good" : pmSev}`)}
              severityClass={SEVERITY_TEXT_CLASS[pmSev]}
              history={pmSeries}
            />
          )}
          {sensor.temperatureC != null && (
            <MetricCard
              icon={<ThermometerIcon size={18} weight="fill" />}
              label={t("labels.temperature")}
              value={fmt(sensor.temperatureC, 1, t("units.celsius"))}
              severityLabel={t(
                `thresholds.temperature.${tempLabel === "unknown" ? "mild" : tempLabel}`,
              )}
              severityClass={CLIMATE_TEXT[tempLabel]}
              history={tempSeries}
            />
          )}
          {sensor.humidityPct != null && (
            <MetricCard
              icon={<DropIcon size={18} weight="fill" />}
              label={t("labels.humidity")}
              value={fmt(sensor.humidityPct, 0, t("units.percent"))}
              severityLabel={t(
                `thresholds.humidity.${humLabel === "unknown" ? "comfort" : humLabel}`,
              )}
              severityClass={HUMIDITY_TEXT[humLabel]}
              history={humSeries}
            />
          )}
        </div>

        {history.length === 0 && (
          <p className="text-sm text-text-muted text-center py-2">{t("noHistory")}</p>
        )}
      </div>
    </BottomSheet>
  );
}
