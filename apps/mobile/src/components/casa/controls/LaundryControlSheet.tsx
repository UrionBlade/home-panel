import type { LaundryAppliance } from "@home-panel/shared";
import { ArrowSquareOutIcon, PauseIcon, PlayIcon, StopIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DeviceEntity } from "../../../lib/devices/model";
import { useLaundryCommand, useLaundryStatus } from "../../../lib/hooks/useLaundry";
import { i18next } from "../../../lib/i18n";
import { useT } from "../../../lib/useT";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { BottomSheet } from "../BottomSheet";

interface LaundryControlSheetProps {
  open: boolean;
  device: DeviceEntity;
  onClose: () => void;
}

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

/**
 * Controlli compatti per lavatrice/asciugatrice dentro il BottomSheet.
 * Pescano dalla stessa sorgente di verità di LaundryPage (useLaundryStatus)
 * così lo stato è sempre coerente con la vista dedicata. I controlli
 * principali (start/pause/stop) sono qui, ma l'analisi dettagliata di
 * consumi e cicli vive ancora in `/laundry`.
 */
export function LaundryControlSheet({ open, device, onClose }: LaundryControlSheetProps) {
  const { t } = useT("laundry");
  const { t: tCasa } = useT("casa");
  const status = useLaundryStatus();
  const command = useLaundryCommand();
  const navigate = useNavigate();
  const [confirmStop, setConfirmStop] = useState(false);

  /* Preferiamo lo status globale (dati freschi, update dopo comando) ma
   * cadiamo sul raw proiettato nell'entity quando lo status non è
   * ancora arrivato o SmartThings è temporaneamente irraggiungibile.
   * Così lo sheet mostra comunque qualcosa di utile. */
  const rawAppliance = (device.raw as { appliance?: LaundryAppliance } | undefined)?.appliance;
  const appliance: LaundryAppliance | undefined =
    status.data?.appliances.find((a) => a.id === device.id) ?? rawAppliance;

  const [remaining, setRemaining] = useState(() =>
    appliance?.completionTime ? msUntil(appliance.completionTime) : 0,
  );
  useEffect(() => {
    if (!appliance?.completionTime) return;
    setRemaining(msUntil(appliance.completionTime));
    const id = window.setInterval(
      () => setRemaining(msUntil(appliance.completionTime as string)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [appliance?.completionTime]);

  const kindLabel = tCasa(`kinds.${device.kind}`, { count: 1, defaultValue: device.kind });

  if (!appliance) {
    return (
      <BottomSheet open={open} onClose={onClose} title={device.name} subtitle={kindLabel}>
        <p className="text-text-muted py-6">Sto raccogliendo lo stato più recente…</p>
      </BottomSheet>
    );
  }

  const isRunning = appliance.machineState === "run";
  const isPaused = appliance.machineState === "pause";
  const isFinished = appliance.jobState === "finish";

  const doCommand = (cmd: "start" | "pause" | "stop") => {
    command.mutate({ deviceId: appliance.id, command: cmd });
  };

  const modeLabel = humanizeMode(appliance.mode);

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title={appliance.name} subtitle={kindLabel}>
        <div className="flex flex-col gap-5 py-3">
          {/* Status hero */}
          <section
            className="rounded-lg p-5 flex items-center justify-between gap-4"
            style={{
              backgroundColor: isFinished
                ? "color-mix(in oklch, var(--color-success) 12%, var(--color-surface-elevated))"
                : isRunning
                  ? "color-mix(in oklch, var(--color-accent) 10%, var(--color-surface-elevated))"
                  : "var(--color-surface)",
            }}
          >
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-xs text-text-muted tracking-wide">Stato</span>
              <span className="font-display text-2xl sm:text-3xl leading-tight text-text truncate">
                {t(`state.${appliance.machineState}` as never)}
              </span>
              {modeLabel && <span className="text-sm text-text-muted">{modeLabel}</span>}
            </div>
            {appliance.completionTime && isRunning && (
              <div className="text-right shrink-0">
                <span className="text-xs text-text-muted block">{t("labels.remaining")}</span>
                <span className="font-display text-2xl sm:text-3xl font-medium tabular-nums text-accent">
                  {formatCountdown(remaining)}
                </span>
              </div>
            )}
          </section>

          {/* Finish banner */}
          {isFinished && (
            <div className="p-3 rounded-md bg-success/15 text-success text-center font-display text-lg">
              {t("job.finish")}
            </div>
          )}

          {/* Commands */}
          {appliance.remoteControlEnabled ? (
            <div className="grid grid-cols-3 gap-2">
              <CommandButton
                tone="primary"
                icon={<PlayIcon size={20} weight="fill" />}
                label={t("actions.start")}
                disabled={isRunning || command.isPending}
                onClick={() => doCommand("start")}
              />
              <CommandButton
                tone="ghost"
                icon={<PauseIcon size={20} weight="fill" />}
                label={t("actions.pause")}
                disabled={!isRunning || command.isPending}
                onClick={() => doCommand("pause")}
              />
              <CommandButton
                tone="danger"
                icon={<StopIcon size={20} weight="fill" />}
                label={t("actions.stop")}
                disabled={command.isPending || (!isRunning && !isPaused)}
                onClick={() => setConfirmStop(true)}
              />
            </div>
          ) : (
            <p className="label-italic text-sm text-text-subtle text-center">
              Attiva il controllo remoto dal cestello per comandare la macchina da qui.
            </p>
          )}

          {/* Link a vista completa */}
          <button
            type="button"
            onClick={() => {
              navigate("/laundry");
              onClose();
            }}
            className="mt-1 flex items-center justify-center gap-2 text-sm text-accent hover:underline py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-sm"
          >
            <ArrowSquareOutIcon size={16} weight="bold" />
            Dettagli del ciclo
          </button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmStop}
        title="Fermare il ciclo?"
        message="Il ciclo in corso verrà interrotto e dovrà essere riavviato manualmente."
        confirmLabel={t("actions.stop")}
        destructive
        isLoading={command.isPending}
        onConfirm={() => {
          doCommand("stop");
          setConfirmStop(false);
        }}
        onClose={() => setConfirmStop(false)}
      />
    </>
  );
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

function humanizeMode(raw: string | null): string | null {
  if (!raw) return null;
  if (MODE_KEYS.has(raw)) return i18next.t(`laundry:modes.${raw}` as never);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function CommandButton({
  tone,
  icon,
  label,
  onClick,
  disabled,
}: {
  tone: "primary" | "ghost" | "danger";
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-accent text-accent-foreground hover:bg-accent-hover"
      : tone === "danger"
        ? "bg-danger/10 text-danger border border-danger/40 hover:bg-danger/20"
        : "bg-surface border border-border text-text hover:border-accent";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-1.5 min-h-[3.25rem] rounded-md text-sm font-medium transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${toneClass}`}
    >
      {icon}
      {label}
    </button>
  );
}
