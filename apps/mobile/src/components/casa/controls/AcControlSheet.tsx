import type { AcCommandInput, AcDevice, AcFanSpeed, AcMode, AcState } from "@home-panel/shared";
import {
  ArrowClockwiseIcon,
  DropIcon,
  FanIcon,
  MinusIcon,
  PlusIcon,
  PowerIcon,
  SnowflakeIcon,
  ThermometerHotIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { DeviceEntity } from "../../../lib/devices/model";
import { useAcCommand } from "../../../lib/hooks/useAc";
import { useT } from "../../../lib/useT";
import { BottomSheet } from "../BottomSheet";

const MIN_TEMP = 16;
const MAX_TEMP = 30;

interface AcControlSheetProps {
  open: boolean;
  device: DeviceEntity;
  onClose: () => void;
}

/**
 * Controlli completi per un condizionatore GE. Tap tile apre questo
 * sheet; gli interventi (power, temp, mode, fan, swing) vengono
 * dispatchati via useAcCommand con optimistic updates dai suoi hooks.
 *
 * Leggibile a ~2m: temperatura grande Fraunces, power visibile, mode
 * come segmented con icone, ventola come 4 pulsanti grandi. Niente
 * slider di precisione — i comandi sono discreti (interi gradi), il
 * target si regola con + / -.
 */
export function AcControlSheet({ open, device, onClose }: AcControlSheetProps) {
  const { t } = useT("ac");
  const { t: tCasa } = useT("casa");
  const command = useAcCommand();
  const row = device.raw as AcDevice;
  const s: AcState | null = row.state;

  const isOn = s?.power ?? false;
  const target = s?.targetTemp ?? 24;
  const current = s?.currentTemp ?? null;
  const mode: AcMode = s?.mode ?? "cool";
  const fan: AcFanSpeed = s?.fanSpeed ?? "auto";
  const swing = s?.swing ?? "off";

  const dispatch = (patch: AcCommandInput) => {
    command.mutate({ ...patch, id: device.id });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={device.name}
      subtitle={tCasa("kinds.ac", { count: 1, defaultValue: "Condizionatore" })}
    >
      <div className="flex flex-col gap-6 py-3">
        {/* Hero: current + target temperature */}
        <section
          className="rounded-lg p-6 flex items-center justify-between gap-6"
          style={{
            backgroundColor: isOn
              ? "color-mix(in oklch, var(--color-accent) 12%, var(--color-surface-elevated))"
              : "var(--color-surface)",
          }}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-text-muted tracking-wide">{t("tile.targetLabel")}</span>
            <div className="flex items-start gap-1">
              <motion.span
                key={target}
                initial={{ opacity: 0.4, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
                className="font-display text-6xl font-medium leading-none tabular-nums text-text"
                style={{ color: isOn ? "var(--color-accent)" : undefined }}
              >
                {Math.round(target)}
              </motion.span>
              <span className="font-display text-2xl text-text-muted mt-1">°</span>
            </div>
            {current != null && (
              <span className="text-sm text-text-muted mt-1">
                {t("tile.currentLabel")} {Math.round(current)}°
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-label={t("tile.increaseTemp")}
              onClick={() => dispatch({ targetTemp: Math.min(MAX_TEMP, Math.round(target) + 1) })}
              disabled={!isOn || command.isPending}
              className="w-14 h-14 rounded-md bg-surface-elevated border border-border flex items-center justify-center text-text hover:border-accent disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <PlusIcon size={22} weight="bold" />
            </button>
            <button
              type="button"
              aria-label={t("tile.decreaseTemp")}
              onClick={() => dispatch({ targetTemp: Math.max(MIN_TEMP, Math.round(target) - 1) })}
              disabled={!isOn || command.isPending}
              className="w-14 h-14 rounded-md bg-surface-elevated border border-border flex items-center justify-center text-text hover:border-accent disabled:opacity-40 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <MinusIcon size={22} weight="bold" />
            </button>
          </div>
        </section>

        {/* Power toggle — big and obvious */}
        <button
          type="button"
          onClick={() => dispatch({ power: !isOn })}
          disabled={command.isPending}
          className={`min-h-[4rem] rounded-md flex items-center justify-center gap-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            isOn
              ? "bg-accent text-accent-foreground hover:bg-accent-hover"
              : "bg-surface border border-border text-text hover:border-accent"
          }`}
        >
          <PowerIcon size={20} weight="fill" />
          {isOn
            ? t("tile.powerOff", { name: device.name })
            : t("tile.powerOn", { name: device.name })}
        </button>

        {/* Mode segmented */}
        <Segmented
          label={t("tile.modeLabel")}
          value={mode}
          onChange={(v) => dispatch({ mode: v as AcMode })}
          disabled={!isOn || command.isPending}
          options={[
            {
              value: "cool",
              label: t("mode.cool"),
              icon: <SnowflakeIcon size={18} weight="duotone" />,
            },
            {
              value: "heat",
              label: t("mode.heat"),
              icon: <ThermometerHotIcon size={18} weight="duotone" />,
            },
            { value: "dry", label: t("mode.dry"), icon: <DropIcon size={18} weight="duotone" /> },
            { value: "fan", label: t("mode.fan"), icon: <FanIcon size={18} weight="duotone" /> },
            {
              value: "auto",
              label: t("mode.auto"),
              icon: <ArrowClockwiseIcon size={18} weight="duotone" />,
            },
          ]}
        />

        {/* Fan speed */}
        <Segmented
          label={t("tile.fanLabel")}
          value={fan}
          onChange={(v) => dispatch({ fanSpeed: v as AcFanSpeed })}
          disabled={!isOn || command.isPending}
          options={[
            { value: "auto", label: t("fan.auto") },
            { value: "low", label: t("fan.low") },
            { value: "mid", label: t("fan.mid") },
            { value: "high", label: t("fan.high") },
          ]}
        />

        {/* Swing toggle */}
        <div className="flex items-center justify-between px-4 py-3 rounded-md bg-surface border border-border">
          <div className="flex items-center gap-2.5">
            <WindIcon size={20} weight="duotone" className="text-text-muted" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-text">{t("tile.swingLabel")}</span>
              <span className="text-xs text-text-subtle">
                {swing === "on" ? t("tile.swingOn") : t("tile.swingOff")}
              </span>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={swing === "on"}
            onClick={() => dispatch({ swing: swing === "on" ? "off" : "on" })}
            disabled={!isOn || command.isPending}
            className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              swing === "on" ? "bg-accent" : "bg-border-strong"
            }`}
          >
            <span
              aria-hidden
              className="absolute top-1 w-6 h-6 rounded-full bg-surface-elevated transition-[left] shadow-sm"
              style={{ left: swing === "on" ? "1.75rem" : "0.25rem" }}
            />
          </button>
        </div>

        {!isOn && (
          <p className="label-italic text-sm text-text-subtle text-center -mt-2">
            {t("tile.offLabel")} · {t("tile.powerOn", { name: device.name })}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Segmented control                                                  */
/* ------------------------------------------------------------------ */

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  disabled?: boolean;
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <div className="grid grid-cols-5 gap-1 p-1 rounded-md bg-surface border border-border">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              aria-pressed={active}
              className={`flex items-center justify-center gap-1 px-2 py-2.5 rounded-sm text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active
                  ? "bg-accent/15 text-accent"
                  : "text-text-muted hover:text-text hover:bg-surface-elevated"
              } ${disabled ? "opacity-50" : ""}`}
            >
              {opt.icon}
              <span className="truncate">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Re-export for future sheets (TV presets etc.) */
export { Segmented };
