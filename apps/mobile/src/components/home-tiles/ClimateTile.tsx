import type { AcDevice, AcFanSpeed, AcMode } from "@home-panel/shared";
import {
  ArrowsOutLineHorizontalIcon,
  DropIcon,
  FanIcon,
  PowerIcon,
  SnowflakeIcon,
  SunIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { type MouseEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api-client";
import { useAcCommand, useAcConfig, useAcDevices } from "../../lib/hooks/useAc";
import { useT } from "../../lib/useT";
import { PendingControl } from "../ui/PendingControl";
import { Tile } from "../ui/Tile";

const MIN_TEMP = 16;
const MAX_TEMP = 30;

export function ClimateTile() {
  const { t } = useT("ac");
  const navigate = useNavigate();
  const config = useAcConfig();
  const devicesQuery = useAcDevices(config.data?.configured ?? false);
  const command = useAcCommand();

  const devices = devicesQuery.data ?? [];
  const notConfigured =
    config.data?.configured === false ||
    (devicesQuery.error instanceof ApiError && devicesQuery.error.status === 400);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Initialise or repair the active selection whenever the device list changes.
  useEffect(() => {
    if (devices.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (!activeId || !devices.some((d) => d.id === activeId)) {
      setActiveId(devices[0]?.id ?? null);
    }
  }, [devices, activeId]);

  const active = devices.find((d) => d.id === activeId) ?? devices[0];

  /* ---- Not configured: tap opens settings anchor. ---- */
  if (notConfigured) {
    return (
      <Tile size="md" onClick={() => navigate("/settings#ac")} ariaLabel={t("tile.notConfigured")}>
        <BackdropPaint />
        <span
          className="label-mono text-accent absolute top-5 left-6 z-10"
          style={{ fontWeight: 900 }}
        >
          {t("title")}
        </span>
        <div className="relative flex flex-col items-center justify-center h-full z-10 gap-4 px-4">
          <SnowflakeIcon size={84} weight="duotone" className="text-text-muted opacity-80" />
          <span className="font-display text-xl italic text-text-muted leading-tight text-center max-w-[22ch]">
            {t("tile.notConfiguredHint")}
          </span>
        </div>
      </Tile>
    );
  }

  /* ---- Connected but no discovered devices yet ---- */
  if (!active) {
    return (
      <Tile size="md" onClick={() => navigate("/settings#ac")} ariaLabel={t("tile.noDevices")}>
        <BackdropPaint />
        <span
          className="label-mono text-accent absolute top-5 left-6 z-10"
          style={{ fontWeight: 900 }}
        >
          {t("title")}
        </span>
        <div className="relative flex flex-col items-center justify-center h-full z-10 gap-3 px-4">
          <SnowflakeIcon size={72} weight="duotone" className="text-text-muted opacity-70" />
          <span className="font-display text-lg italic text-text-muted text-center">
            {t("tile.noDevices")}
          </span>
          <span className="label-mono text-xs text-text-muted opacity-75">
            {t("tile.noDevicesHint")}
          </span>
        </div>
      </Tile>
    );
  }

  const state = active.state;
  const powerOn = state?.power ?? false;
  const targetTemp = state?.targetTemp ?? 24;
  const currentTemp = state?.currentTemp ?? null;
  const mode: AcMode = state?.mode ?? "cool";
  const fan: AcFanSpeed = state?.fanSpeed ?? "auto";
  const swingOn = state?.swing === "on";

  const activeName = active.nickname?.trim() || active.model?.trim() || t("tile.unnamed");

  const run = (patch: Parameters<typeof command.mutate>[0]) => command.mutate(patch);

  return (
    <Tile size="md" ariaLabel={`${t("title")} — ${activeName}`}>
      <BackdropPaint variant={powerOn ? "on" : "off"} />

      <div className="relative flex flex-col h-full z-10 gap-3">
        {/* Header: title + tab switcher */}
        <div className="flex items-start justify-between gap-3">
          <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
            {t("title")}
          </span>
          {devices.length > 1 ? (
            <DeviceTabs
              devices={devices}
              activeId={active.id}
              onSwitch={setActiveId}
              switchLabel={(name) => t("tile.switchTo", { name })}
            />
          ) : (
            <span className="text-sm font-medium text-text-muted truncate max-w-[55%]">
              {activeName}
            </span>
          )}
        </div>

        {/* Hero row: power + big target temp + ambient readout */}
        <div className="flex items-center gap-4">
          <PendingControl
            isPending={command.isPending && command.variables?.power !== undefined}
            isSuccess={false}
            isError={false}
          >
            <button
              type="button"
              aria-label={
                powerOn
                  ? t("tile.powerOff", { name: activeName })
                  : t("tile.powerOn", { name: activeName })
              }
              onClick={(e) => {
                stop(e);
                run({ id: active.id, power: !powerOn });
              }}
              className={`w-14 h-14 flex items-center justify-center rounded-full border transition-colors ${
                powerOn
                  ? "bg-accent border-accent text-white"
                  : "bg-surface border-border text-text-muted hover:border-accent"
              }`}
            >
              <PowerIcon size={26} weight="duotone" />
            </button>
          </PendingControl>

          <div className="flex items-baseline gap-2 flex-1 min-w-0">
            <span
              className="font-display font-black tabular-nums leading-none text-text"
              style={{ fontSize: "clamp(2.75rem, 6vw, 4.25rem)" }}
            >
              {powerOn ? Math.round(targetTemp) : "—"}
            </span>
            <span className="label-mono text-text-muted">{t("tile.tempUnit")}</span>
          </div>

          <div className="flex flex-col items-end text-right">
            <span className="label-mono text-text-muted tracking-widest">
              {t("tile.currentLabel")}
            </span>
            <span className="font-display font-bold tabular-nums text-text text-lg leading-none">
              {currentTemp !== null ? `${Math.round(currentTemp)}°` : "—"}
            </span>
          </div>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <ModeChip
            active={mode === "cool"}
            onClick={() => run({ id: active.id, mode: "cool" })}
            label={t("mode.cool")}
          >
            <SnowflakeIcon size={16} weight="duotone" />
          </ModeChip>
          <ModeChip
            active={mode === "heat"}
            onClick={() => run({ id: active.id, mode: "heat" })}
            label={t("mode.heat")}
          >
            <SunIcon size={16} weight="duotone" />
          </ModeChip>
          <ModeChip
            active={mode === "dry"}
            onClick={() => run({ id: active.id, mode: "dry" })}
            label={t("mode.dry")}
          >
            <DropIcon size={16} weight="duotone" />
          </ModeChip>
          <ModeChip
            active={mode === "fan"}
            onClick={() => run({ id: active.id, mode: "fan" })}
            label={t("mode.fan")}
          >
            <FanIcon size={16} weight="duotone" />
          </ModeChip>
          <ModeChip
            active={mode === "auto"}
            onClick={() => run({ id: active.id, mode: "auto" })}
            label={t("mode.auto")}
          >
            <WindIcon size={16} weight="duotone" />
          </ModeChip>
        </div>

        {/* Temperature stepper + fan */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-surface border border-border rounded-full px-1 py-1">
            <StepButton
              label={t("tile.decreaseTemp")}
              onClick={() =>
                run({
                  id: active.id,
                  targetTemp: Math.max(MIN_TEMP, Math.round(targetTemp) - 1),
                })
              }
            >
              −
            </StepButton>
            <span className="font-display font-bold text-text tabular-nums min-w-[3ch] text-center">
              {Math.round(targetTemp)}°
            </span>
            <StepButton
              label={t("tile.increaseTemp")}
              onClick={() =>
                run({
                  id: active.id,
                  targetTemp: Math.min(MAX_TEMP, Math.round(targetTemp) + 1),
                })
              }
            >
              +
            </StepButton>
          </div>

          <div className="flex items-center gap-1 flex-1 justify-end">
            <FanChip
              active={fan === "auto"}
              onClick={() => run({ id: active.id, fanSpeed: "auto" })}
              label={t("fan.auto")}
            >
              A
            </FanChip>
            <FanChip
              active={fan === "low"}
              onClick={() => run({ id: active.id, fanSpeed: "low" })}
              label={t("fan.low")}
            >
              <FanBars level={1} active={fan === "low"} />
            </FanChip>
            <FanChip
              active={fan === "mid"}
              onClick={() => run({ id: active.id, fanSpeed: "mid" })}
              label={t("fan.mid")}
            >
              <FanBars level={2} active={fan === "mid"} />
            </FanChip>
            <FanChip
              active={fan === "high"}
              onClick={() => run({ id: active.id, fanSpeed: "high" })}
              label={t("fan.high")}
            >
              <FanBars level={3} active={fan === "high"} />
            </FanChip>
          </div>
        </div>

        {/* Swing toggle — only rendered if the appliance supports it.
         * Detection is best-effort: we show it by default and rely on the
         * backend to silently ignore writes the unit doesn't honour. */}
        <button
          type="button"
          aria-label={swingOn ? t("tile.swingOff") : t("tile.swingOn")}
          onClick={(e) => {
            stop(e);
            run({ id: active.id, swing: swingOn ? "off" : "on" });
          }}
          className={`mt-auto self-start flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            swingOn
              ? "bg-accent/10 border-accent text-accent"
              : "bg-surface border-border text-text-muted hover:border-accent"
          }`}
        >
          <ArrowsOutLineHorizontalIcon size={16} weight="duotone" />
          <span>{t("tile.swingLabel")}</span>
          <span className="label-mono opacity-75">{swingOn ? "ON" : "OFF"}</span>
        </button>
      </div>
    </Tile>
  );
}

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function stop(e: MouseEvent) {
  e.stopPropagation();
}

function BackdropPaint({ variant }: { variant?: "on" | "off" }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          variant === "on"
            ? "radial-gradient(circle at 100% 100%, var(--tile-sky-b) 0%, transparent 55%)"
            : "radial-gradient(circle at 100% 100%, var(--tile-ochre-b) 0%, transparent 55%)",
        opacity: 0.45,
        transition: "opacity 280ms ease",
      }}
    />
  );
}

function DeviceTabs({
  devices,
  activeId,
  onSwitch,
  switchLabel,
}: {
  devices: AcDevice[];
  activeId: string;
  onSwitch: (id: string) => void;
  switchLabel: (name: string) => string;
}) {
  return (
    <div className="flex items-center gap-1 bg-surface border border-border rounded-full p-0.5 max-w-[60%] overflow-x-auto no-scrollbar">
      {devices.map((d) => {
        const name = d.nickname?.trim() || d.model?.trim() || d.id.slice(0, 6);
        const isActive = d.id === activeId;
        return (
          <button
            key={d.id}
            type="button"
            aria-label={switchLabel(name)}
            aria-pressed={isActive}
            onClick={(e) => {
              stop(e);
              onSwitch(d.id);
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
              isActive ? "bg-accent text-white" : "text-text-muted hover:text-text"
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onClick();
      }}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap transition-colors ${
        active
          ? "bg-accent border-accent text-white"
          : "bg-surface border-border text-text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function FanChip({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onClick();
      }}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold border transition-colors ${
        active
          ? "bg-accent border-accent text-white"
          : "bg-surface border-border text-text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Three rising bars à la signal-strength icon. `level` is how many bars
 * are "lit" (1/2/3); the remaining bars are dimmed so the scale still
 * reads visually even on the inactive chips.
 */
function FanBars({ level, active }: { level: 1 | 2 | 3; active: boolean }) {
  const heights = ["4px", "7px", "10px"] as const;
  return (
    <span aria-hidden className="flex items-end gap-[2px] h-2.5">
      {heights.map((h, i) => {
        const lit = i < level;
        const opacity = lit ? 1 : 0.35;
        const bg = active ? "#FFFFFF" : "currentColor";
        return (
          <span
            key={h}
            className="w-[3px] rounded-[1px]"
            style={{ height: h, background: bg, opacity }}
          />
        );
      })}
    </span>
  );
}

function StepButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onClick();
      }}
      aria-label={label}
      className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-elevated border border-border text-lg font-medium leading-none hover:border-accent hover:text-accent transition-colors"
    >
      {children}
    </button>
  );
}
