import type { LaundryAppliance } from "@home-panel/shared";
import {
  ArrowsClockwiseIcon,
  BatteryChargingIcon,
  DropIcon,
  GearIcon,
  MicrophoneIcon,
  PauseIcon,
  PlayIcon,
  SpinnerIcon,
  StopIcon,
  ThermometerIcon,
  WashingMachineIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LaundryArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { PendingControl } from "../components/ui/PendingControl";
import { useLaundryCommand, useLaundryStatus, useRefreshLaundry } from "../lib/hooks/useLaundry";
import { i18next } from "../lib/i18n";
import { useT } from "../lib/useT";

/* ---- Helpers ---- */

function msUntil(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return i18next.t("laundry:countdown.finished");
  const minutes = Math.ceil(ms / 60_000);
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return i18next.t("laundry:countdown.hoursAndMinutes", { hours: h, minutes: m });
  }
  return i18next.t("laundry:countdown.minutes", { count: minutes });
}

function formatHour(iso: string): string {
  const locale = i18next.language.startsWith("it") ? "it-IT" : "en-US";
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MODE_KEYS = new Set([
  "normal",
  "heavy",
  "delicate",
  "quick",
  "wool",
  "bedding",
  "rinse",
  "spin",
  "eco",
  "towel",
  "outdoor",
  "babyCare",
  "shirts",
  "dryCotton",
  "dryNormal",
  "dryDelicate",
  "dryHeavy",
  "timeDry",
  "airWash",
]);

/** Localizza valori grezzi SmartThings */
function humanizeMode(raw: string | null): string | null {
  if (!raw) return null;
  if (MODE_KEYS.has(raw)) return i18next.t(`laundry:modes.${raw}` as never);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function humanizeSpin(raw: string | null): string | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? i18next.t("laundry:units.rpm", { value: n }) : raw;
}

function humanizeTemp(raw: string | null): string | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? `${n}°C` : raw;
}

/* ---- Notification sound ---- */

let audioCtx: AudioContext | null = null;

function playDoneChime() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    // Three-note chime: C5 → E5 → G5
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.2);
      gain.gain.linearRampToValueAtTime(0.3, now + i * 0.2 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.2 + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.7);
    });
  } catch {
    // Audio not available — silent fallback
  }
}

/* ---- Components ---- */

function InfoRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-sm text-text-muted">
        {icon}
        {label}
      </span>
      <span className="text-sm font-medium text-text">{value}</span>
    </div>
  );
}

/** Live countdown that ticks every second */
function LiveCountdown({ completionTime }: { completionTime: string }) {
  const { t } = useT("laundry");
  const [remaining, setRemaining] = useState(() => msUntil(completionTime));

  useEffect(() => {
    setRemaining(msUntil(completionTime));
    const id = setInterval(() => setRemaining(msUntil(completionTime)), 1000);
    return () => clearInterval(id);
  }, [completionTime]);

  return (
    <div className="p-3 rounded-sm bg-surface flex items-center justify-between">
      <span className="text-sm text-text-muted">
        {t("labels.endAt", { time: formatHour(completionTime) })}
      </span>
      <span className="font-display text-lg font-bold tabular-nums text-accent">
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}

function ApplianceCard({ appliance }: { appliance: LaundryAppliance }) {
  const { t } = useT("laundry");
  const { t: tCommon } = useT("common");
  const command = useLaundryCommand();
  const isRunning = appliance.machineState === "run";
  const isPaused = appliance.machineState === "pause";
  const isFinished = appliance.jobState === "finish";
  const isActive = isRunning || isPaused || isFinished;
  const prevJobRef = useRef(appliance.jobState);
  const [confirmStop, setConfirmStop] = useState(false);

  // Sound notification when the cycle finishes
  useEffect(() => {
    if (appliance.jobState === "finish" && prevJobRef.current !== "finish") {
      playDoneChime();
    }
    prevJobRef.current = appliance.jobState;
  }, [appliance.jobState]);

  const Icon = appliance.type === "washer" ? WashingMachineIcon : WindIcon;

  function handleStop() {
    setConfirmStop(true);
  }

  function doStop() {
    command.mutate(
      { deviceId: appliance.id, command: "stop" },
      { onSettled: () => setConfirmStop(false) },
    );
  }

  // Compact card: off or stopped
  if (!appliance.power || (!isActive && appliance.machineState === "stop")) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-md border border-border bg-surface-elevated p-4 flex items-center gap-3"
      >
        <Icon size={22} weight="duotone" className="text-text-muted shrink-0" />
        <span className="font-medium text-text">{appliance.name}</span>
        <span className="text-sm text-text-subtle ml-auto">
          {appliance.power ? t("state.stop") : t("power.off")}
        </span>
      </motion.div>
    );
  }

  // Expanded card: running / paused / finished
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-md border p-6 flex flex-col gap-4 transition-colors ${
        isFinished ? "bg-success/8 border-success/40" : "bg-accent/8 border-accent/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-md ${
              isFinished ? "bg-success/15 text-success" : "bg-accent/15 text-accent"
            }`}
          >
            <Icon size={28} weight="fill" />
          </div>
          <div>
            <h3 className="font-display text-xl">{appliance.name}</h3>
            <p className="text-sm text-text-muted">
              {t(appliance.type === "washer" ? "washer" : "dryer")}
            </p>
          </div>
        </div>

        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            isFinished
              ? "bg-success/15 text-success"
              : isPaused
                ? "bg-warning/15 text-warning"
                : "bg-accent/15 text-accent"
          }`}
        >
          {t(`state.${appliance.machineState}` as never)}
        </span>
      </div>

      {/* Info rows — only available data */}
      <div className="flex flex-col divide-y divide-border/50">
        <InfoRow label={t("labels.phase")} value={t(`job.${appliance.jobState}` as never)} />

        {appliance.mode && (
          <InfoRow
            label={t("labels.mode")}
            value={humanizeMode(appliance.mode) ?? appliance.mode}
            icon={<GearIcon size={14} weight="duotone" />}
          />
        )}

        {appliance.type === "washer" && appliance.waterTemperature && (
          <InfoRow
            label={t("labels.waterTemp")}
            value={humanizeTemp(appliance.waterTemperature) ?? appliance.waterTemperature}
            icon={<ThermometerIcon size={14} weight="duotone" />}
          />
        )}
        {appliance.type === "washer" && appliance.spinLevel && (
          <InfoRow
            label={t("labels.spinLevel")}
            value={humanizeSpin(appliance.spinLevel) ?? appliance.spinLevel}
            icon={<DropIcon size={14} weight="duotone" />}
          />
        )}

        {appliance.energyWh != null && appliance.energyWh > 0 && (
          <InfoRow
            label={t("labels.energy")}
            value={
              appliance.energyWh >= 1000
                ? `${(appliance.energyWh / 1000).toFixed(1)} kWh`
                : `${Math.round(appliance.energyWh)} Wh`
            }
            icon={<BatteryChargingIcon size={14} weight="duotone" />}
          />
        )}
      </div>

      {/* Remaining time countdown */}
      {appliance.completionTime && isRunning && (
        <LiveCountdown completionTime={appliance.completionTime} />
      )}

      {/* Done banner */}
      {isFinished && (
        <div className="p-3 rounded-sm bg-success/15 text-success text-center font-display text-lg font-medium">
          {t("job.finish")}
        </div>
      )}

      {/* Controls */}
      {appliance.remoteControlEnabled && (
        <div className="flex gap-2 pt-1">
          {(isPaused || (!isRunning && !isFinished)) && (
            <PendingControl
              isPending={command.isPending}
              isSuccess={command.isSuccess}
              isError={command.isError}
            >
              <button
                type="button"
                onClick={() => command.mutate({ deviceId: appliance.id, command: "start" })}
                disabled={command.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                <PlayIcon size={16} weight="fill" />
                {t("actions.start")}
              </button>
            </PendingControl>
          )}
          {isRunning && (
            <>
              <PendingControl
                isPending={command.isPending}
                isSuccess={command.isSuccess}
                isError={command.isError}
              >
                <button
                  type="button"
                  onClick={() => command.mutate({ deviceId: appliance.id, command: "pause" })}
                  disabled={command.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-surface border border-border text-text hover:border-accent transition-colors disabled:opacity-50"
                >
                  <PauseIcon size={16} weight="fill" />
                  {t("actions.pause")}
                </button>
              </PendingControl>
              <PendingControl
                isPending={command.isPending}
                isSuccess={command.isSuccess}
                isError={command.isError}
              >
                <button
                  type="button"
                  onClick={handleStop}
                  disabled={command.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                >
                  <StopIcon size={16} weight="fill" />
                  {t("actions.stop")}
                </button>
              </PendingControl>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmStop}
        title={tCommon("actions.confirm")}
        message={t("confirm.stop")}
        confirmLabel={t("actions.stop")}
        destructive
        isLoading={command.isPending}
        onConfirm={doStop}
        onClose={() => setConfirmStop(false)}
      />
    </motion.div>
  );
}

export function LaundryPage() {
  const { t } = useT("laundry");
  const navigate = useNavigate();
  const { data: status, isLoading } = useLaundryStatus();
  const refresh = useRefreshLaundry();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <SpinnerIcon size={32} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <PageContainer>
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          artwork={<LaundryArt size={96} />}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto mt-16 flex flex-col items-center gap-5 text-center"
        >
          <WashingMachineIcon size={56} weight="duotone" className="text-text-muted opacity-50" />
          <p className="text-text-muted">{t("notConfigured.message")}</p>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base transition-opacity hover:opacity-90"
          >
            <GearIcon size={18} weight="bold" />
            {t("notConfigured.goToSettings")}
          </button>
        </motion.div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        artwork={<LaundryArt size={96} />}
        actions={
          <button
            type="button"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-4 py-2 text-sm font-medium transition-colors hover:border-accent disabled:opacity-50 min-h-[2.75rem]"
          >
            <ArrowsClockwiseIcon
              size={16}
              weight="bold"
              className={refresh.isPending ? "animate-spin" : ""}
            />
            {t("actions.refresh")}
          </button>
        }
      />

      {status.appliances.length === 0 ? (
        <p className="text-text-muted text-center py-12">{t("empty.message")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {status.appliances.map((appliance) => (
            <ApplianceCard key={appliance.id} appliance={appliance} />
          ))}
          <LaundryIdleHint appliances={status.appliances} />
        </div>
      )}
    </PageContainer>
  );
}

/**
 * Calm "rest state" panel shown below the appliance list when every machine
 * is off or stopped. The dedicated page would otherwise be a header + a thin
 * row, which reads as "something missing". Instead, we lean into the quiet
 * and promote the voice-first affordance.
 */
function LaundryIdleHint({ appliances }: { appliances: LaundryAppliance[] }) {
  const { t } = useT("laundry");
  const allIdle = appliances.every(
    (a) => !a.power || (a.machineState === "stop" && a.jobState !== "finish"),
  );
  if (!allIdle) return null;
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.32, ease: [0.2, 0, 0, 1] }}
      className="mt-6 flex flex-col items-center text-center gap-4 py-10 px-6 rounded-md border border-border/50 bg-surface/40"
    >
      <LaundryArt size={120} className="pointer-events-none select-none opacity-70 anim-drift" />
      <div className="flex flex-col gap-1 max-w-md">
        <h2 className="font-display text-2xl text-text">{t("idleState.headline")}</h2>
        <p className="text-sm text-text-muted leading-relaxed">{t("idleState.body")}</p>
      </div>
      <span className="inline-flex items-center gap-2 text-xs text-text-muted border border-border/60 rounded-full px-3 py-1.5">
        <MicrophoneIcon size={14} weight="duotone" className="text-accent" />
        {t("idleState.voiceHint")}
      </span>
    </motion.section>
  );
}
