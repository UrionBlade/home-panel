/**
 * Charts section embedded inside DeviceEditorSheet for environmental
 * sensors (DIRIGERA ALPSTUGA / TIMMERFLÖTTE).
 *
 * Layout: 4 selectable metric chips on top, one large line chart below
 * for the active metric. The chart draws threshold bands as dashed
 * horizontal guides (e.g. 1000/2000 ppm for CO2) and surfaces a
 * touch/hover tooltip with the timestamp + reading.
 *
 * The chart measures its container at runtime (ResizeObserver) and
 * draws in 1:1 pixel coordinates — no `preserveAspectRatio="none"`,
 * which would otherwise stretch text, dashed strokes, and hover dots
 * horizontally on wider screens (iPad).
 */

import type { EnvHistoryPoint, EnvSensor, SensorSeverity } from "@home-panel/shared";
import { DropIcon, SmileyIcon, ThermometerIcon, WindIcon } from "@phosphor-icons/react";
import { clsx } from "clsx";
import {
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useEnvSensorHistory } from "../../lib/hooks/useEnvSensors";
import {
  type ClimateLabel,
  CO2_THRESHOLDS,
  HUMIDITY_THRESHOLDS,
  type HumidityLabel,
  labelForHumidity,
  labelForTemperature,
  PM25_THRESHOLDS,
  SEVERITY_TEXT_CLASS,
  severityForCo2,
  severityForPm25,
  TEMP_THRESHOLDS,
} from "../../lib/sensors/thresholds";
import { useT } from "../../lib/useT";

type Range = "hours" | "day" | "week";
const RANGE_HOURS: Record<Range, number> = { hours: 6, day: 24, week: 168 };

type MetricKey = "co2" | "pm25" | "temperature" | "humidity";

interface ThresholdLine {
  value: number;
  /** Tone the dashed guide gets — keeps "warning" reads visually distinct. */
  tone: "warning" | "danger" | "info";
}

interface MetricSpec {
  key: MetricKey;
  label: string;
  unit: string;
  /** Decimals shown in the value (0 for whole-number metrics). */
  decimals: number;
  current: number | null;
  severityLabel: string;
  severityClass: string;
  thresholds: ThresholdLine[];
  icon: React.ReactNode;
}

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

interface Props {
  sensor: EnvSensor;
}

export function EnvSensorChartsSection({ sensor }: Props) {
  const { t } = useT("sensors");
  const [range, setRange] = useState<Range>("day");
  const { data: history = [] } = useEnvSensorHistory(sensor.id, RANGE_HOURS[range]);

  const co2Sev = severityForCo2(sensor.co2Ppm);
  const pmSev = severityForPm25(sensor.pm25);
  const tempLabel = labelForTemperature(sensor.temperatureC);
  const humLabel = labelForHumidity(sensor.humidityPct);

  const metrics: MetricSpec[] = useMemo(() => {
    const out: MetricSpec[] = [];
    if (sensor.co2Ppm != null) {
      out.push({
        key: "co2",
        label: t("labels.co2"),
        unit: t("units.ppm"),
        decimals: 0,
        current: sensor.co2Ppm,
        severityLabel: t(
          `thresholds.co2.${(co2Sev === "unknown" ? "good" : co2Sev) as Exclude<SensorSeverity, "unknown">}`,
        ),
        severityClass: SEVERITY_TEXT_CLASS[co2Sev],
        thresholds: [
          { value: CO2_THRESHOLDS.medium, tone: "warning" },
          { value: CO2_THRESHOLDS.high, tone: "danger" },
        ],
        icon: <WindIcon size={16} weight="fill" />,
      });
    }
    if (sensor.pm25 != null) {
      out.push({
        key: "pm25",
        label: t("labels.pm25"),
        unit: t("units.ugm3"),
        decimals: 0,
        current: sensor.pm25,
        severityLabel: t(
          `thresholds.pm25.${(pmSev === "unknown" ? "good" : pmSev) as Exclude<SensorSeverity, "unknown">}`,
        ),
        severityClass: SEVERITY_TEXT_CLASS[pmSev],
        thresholds: [
          { value: PM25_THRESHOLDS.medium, tone: "warning" },
          { value: PM25_THRESHOLDS.high, tone: "danger" },
        ],
        icon: <SmileyIcon size={16} weight="fill" />,
      });
    }
    if (sensor.temperatureC != null) {
      out.push({
        key: "temperature",
        label: t("labels.temperature"),
        unit: t("units.celsius"),
        decimals: 1,
        current: sensor.temperatureC,
        severityLabel: t(`thresholds.temperature.${tempLabel === "unknown" ? "mild" : tempLabel}`),
        severityClass: CLIMATE_TEXT[tempLabel],
        thresholds: [
          { value: TEMP_THRESHOLDS.mild, tone: "info" },
          { value: TEMP_THRESHOLDS.warm, tone: "warning" },
        ],
        icon: <ThermometerIcon size={16} weight="fill" />,
      });
    }
    if (sensor.humidityPct != null) {
      out.push({
        key: "humidity",
        label: t("labels.humidity"),
        unit: t("units.percent"),
        decimals: 0,
        current: sensor.humidityPct,
        severityLabel: t(`thresholds.humidity.${humLabel === "unknown" ? "comfort" : humLabel}`),
        severityClass: HUMIDITY_TEXT[humLabel],
        thresholds: [
          { value: HUMIDITY_THRESHOLDS.comfort, tone: "info" },
          { value: HUMIDITY_THRESHOLDS.humid, tone: "warning" },
        ],
        icon: <DropIcon size={16} weight="fill" />,
      });
    }
    return out;
  }, [sensor, co2Sev, pmSev, tempLabel, humLabel, t]);

  const [activeKey, setActiveKey] = useState<MetricKey | null>(null);
  const active = metrics.find((m) => m.key === activeKey) ?? metrics[0];

  if (metrics.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-muted">{t("title")}</span>
        <div className="inline-flex rounded-md bg-surface-muted p-0.5 gap-0.5">
          {(["hours", "day", "week"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={clsx(
                "px-2.5 py-1 rounded-sm text-xs font-medium transition-colors",
                range === r ? "bg-bg shadow-sm text-text" : "text-text-muted hover:text-text",
              )}
            >
              {t(`ranges.${r}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {metrics.map((m) => {
          const selected = active?.key === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setActiveKey(m.key)}
              aria-pressed={selected}
              className={clsx(
                "flex flex-col items-start gap-1 rounded-md border bg-surface px-3 py-2.5 text-left transition-colors",
                selected
                  ? "border-accent ring-1 ring-accent/40"
                  : "border-border hover:border-text-muted/40",
              )}
            >
              <div className="flex items-center gap-1.5 text-text-muted">
                <span aria-hidden>{m.icon}</span>
                <span className="text-xs">{m.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={clsx("text-2xl font-semibold leading-none", m.severityClass)}>
                  {formatValue(m.current, m.decimals)}
                </span>
                <span className="text-xs text-text-muted">{m.unit}</span>
              </div>
              <span className="text-xs text-text-muted">{m.severityLabel}</span>
            </button>
          );
        })}
      </div>

      {active && (
        /* keyed on metric so switching metrics remounts the chart with
         * fresh hover/measurement state — no stale dot from a previous
         * series sitting at coordinates that no longer mean anything. */
        <MetricChart
          key={active.key}
          history={history}
          metric={active}
          emptyLabel={t("noHistory")}
        />
      )}
    </div>
  );
}

interface MetricChartProps {
  history: EnvHistoryPoint[];
  metric: MetricSpec;
  emptyLabel: string;
}

interface ChartPoint {
  i: number;
  /** Reading value (already known non-null at this point). */
  v: number;
  /** Original timestamp string (ISO-8601). */
  ts: string;
}

const CHART_H = 180;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 26;
const AXIS_FONT = 11;

function MetricChart({ history, metric, emptyLabel }: MetricChartProps) {
  const points: ChartPoint[] = useMemo(() => {
    return history
      .map((p, i): ChartPoint | null => {
        const v = pickValue(p, metric.key);
        return v == null ? null : { i, v, ts: p.recordedAt };
      })
      .filter((p): p is ChartPoint => p !== null);
  }, [history, metric.key]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(0);
  const [hover, setHover] = useState<ChartPoint | null>(null);

  /* Measure synchronously before paint to avoid a 1-frame flash where
   * the SVG renders at 0px wide. ResizeObserver covers later size
   * changes (orientation, sheet resize). React bails out on identical
   * setState values, so we don't need to compare against the previous
   * width — that lets the effect stay truly mount-only. */
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) {
    return (
      <div className="rounded-md border border-border bg-surface px-4 py-10 text-center text-sm text-text-muted">
        {emptyLabel}
      </div>
    );
  }

  /* Domain padded to include all threshold lines so they are always
   * visible in the plot area, even when current readings sit far from
   * them. A small visual margin keeps the line off the edges. */
  const valuesForDomain = [...points.map((p) => p.v), ...metric.thresholds.map((th) => th.value)];
  const yMinRaw = Math.min(...valuesForDomain);
  const yMaxRaw = Math.max(...valuesForDomain);
  const yPad = (yMaxRaw - yMinRaw) * 0.08 || 1;
  const yMin = yMinRaw - yPad;
  const yMax = yMaxRaw + yPad;

  const xMin = points[0].i;
  const xMax = points[points.length - 1].i;
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const W = Math.max(width, 1);
  const innerW = Math.max(W - PAD_L - PAD_R, 1);
  const innerH = CHART_H - PAD_T - PAD_B;

  const xFor = (i: number): number => PAD_L + ((i - xMin) / xRange) * innerW;
  const yFor = (v: number): number => PAD_T + innerH - ((v - yMin) / yRange) * innerH;

  const path = points
    .map((p, idx) => `${idx === 0 ? "M" : "L"}${xFor(p.i).toFixed(1)},${yFor(p.v).toFixed(1)}`)
    .join(" ");

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    /* Pointer is in CSS pixels — viewBox is 1:1 with the rendered size,
     * so no scaling needed. Snap to the nearest known point. */
    const px = e.clientX - rect.left;
    const i = xMin + ((px - PAD_L) / innerW) * xRange;
    let nearest: ChartPoint = points[0];
    let bestDist = Math.abs(points[0].i - i);
    for (let k = 1; k < points.length; k++) {
      const d = Math.abs(points[k].i - i);
      if (d < bestDist) {
        bestDist = d;
        nearest = points[k];
      }
    }
    setHover(nearest);
  };

  const onLeave = () => setHover(null);

  /* Y-axis ticks: min, max, plus thresholds (deduped, sorted). */
  const yTicks = uniqueSorted([yMinRaw, yMaxRaw, ...metric.thresholds.map((th) => th.value)]);
  const xTickIdxs = [
    points[0].i,
    points[Math.floor((points.length - 1) / 2)].i,
    points[points.length - 1].i,
  ];

  const firstTs = points[0].ts;
  const lastTs = points[points.length - 1].ts;
  const spanHours = differenceInHours(lastTs, firstTs);

  return (
    <div ref={containerRef} className="rounded-md border border-border bg-surface p-3">
      {width > 0 && (
        <svg
          width={W}
          height={CHART_H}
          viewBox={`0 0 ${W} ${CHART_H}`}
          className="block touch-none select-none"
          onPointerDown={onMove}
          onPointerMove={onMove}
          onPointerLeave={onLeave}
          onPointerUp={onLeave}
          role="img"
          aria-label={`${metric.label} chart`}
        >
          {/* Grid + threshold lines */}
          {yTicks.map((tick) => {
            const th = metric.thresholds.find((x) => x.value === tick);
            const stroke =
              th?.tone === "danger"
                ? "var(--color-danger)"
                : th?.tone === "warning"
                  ? "var(--color-warning)"
                  : th?.tone === "info"
                    ? "var(--color-text-muted)"
                    : "var(--color-border)";
            const dash = th ? "4 4" : undefined;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={yFor(tick)}
                  y2={yFor(tick)}
                  stroke={stroke}
                  strokeOpacity={th ? 0.7 : 0.3}
                  strokeWidth={1}
                  strokeDasharray={dash}
                />
                <text
                  x={PAD_L - 8}
                  y={yFor(tick) + AXIS_FONT / 3}
                  textAnchor="end"
                  fontSize={AXIS_FONT}
                  fill="var(--color-text-muted)"
                >
                  {formatValue(tick, metric.decimals)}
                </text>
              </g>
            );
          })}

          {/* X-axis tick labels (start / mid / end) */}
          {xTickIdxs.map((idx, k) => {
            const p = history[idx];
            if (!p) return null;
            return (
              <text
                key={`x-${idx}-${k}`}
                x={xFor(idx)}
                y={CHART_H - 8}
                textAnchor={k === 0 ? "start" : k === xTickIdxs.length - 1 ? "end" : "middle"}
                fontSize={AXIS_FONT}
                fill="var(--color-text-muted)"
              >
                {formatTimeLabel(p.recordedAt, spanHours)}
              </text>
            );
          })}

          {/* Series line */}
          <path
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinejoin="round"
            className={metric.severityClass}
          />

          {/* Hover crosshair + dot */}
          {hover && (
            <g>
              <line
                x1={xFor(hover.i)}
                x2={xFor(hover.i)}
                y1={PAD_T}
                y2={PAD_T + innerH}
                stroke="var(--color-text-muted)"
                strokeOpacity={0.5}
                strokeWidth={1}
              />
              <circle
                cx={xFor(hover.i)}
                cy={yFor(hover.v)}
                r={4}
                fill="var(--color-bg)"
                stroke="currentColor"
                strokeWidth={1.75}
                className={metric.severityClass}
              />
            </g>
          )}
        </svg>
      )}

      <div className="mt-2 flex items-center justify-between text-xs text-text-muted min-h-[1.25rem]">
        {hover ? (
          <>
            <span>{formatTooltipTime(hover.ts)}</span>
            <span className={clsx("font-medium", metric.severityClass)}>
              {formatValue(hover.v, metric.decimals)} {metric.unit}
            </span>
          </>
        ) : (
          <>
            <span>{formatTooltipTime(firstTs)}</span>
            <span>{formatTooltipTime(lastTs)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function pickValue(p: EnvHistoryPoint, key: MetricKey): number | null {
  switch (key) {
    case "co2":
      return p.co2Ppm;
    case "pm25":
      return p.pm25;
    case "temperature":
      return p.temperatureC;
    case "humidity":
      return p.humidityPct;
  }
}

function formatValue(v: number | null, decimals: number): string {
  if (v == null) return "—";
  return decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals);
}

function uniqueSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function differenceInHours(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 3_600_000;
}

/* For ranges <= 24h show hour:minute, otherwise short day + hour. The
 * exact format follows the user's locale via Intl. */
function formatTimeLabel(iso: string, spanHours: number): string {
  const d = new Date(iso);
  if (spanHours <= 26) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit" });
}

function formatTooltipTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
