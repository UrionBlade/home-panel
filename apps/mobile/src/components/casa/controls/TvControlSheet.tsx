import {
  MinusIcon,
  PlusIcon,
  PowerIcon,
  SpeakerSimpleHighIcon,
  SpeakerSimpleXIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { DeviceEntity } from "../../../lib/devices/model";
import {
  useTvApp,
  useTvMute,
  useTvPower,
  useTvPresets,
  useTvStatus,
  useTvVolume,
} from "../../../lib/hooks/useTv";
import { useT } from "../../../lib/useT";
import { BottomSheet } from "../BottomSheet";

interface TvControlSheetProps {
  open: boolean;
  device: DeviceEntity;
  onClose: () => void;
}

/**
 * Telecomando TV dentro un BottomSheet. Funzioni base senza dover
 * aprire una pagina dedicata: power, volume, mute, avvio app
 * (Netflix, YouTube, Prime, Disney+) e input switch.
 *
 * La logica dei presets e dei comandi è già centralizzata nei
 * hooks useTv*, qui ci limitiamo a cablarli.
 */
export function TvControlSheet({ open, device, onClose }: TvControlSheetProps) {
  const { t } = useT("casa");
  const status = useTvStatus();
  const presetsQ = useTvPresets();
  const power = useTvPower();
  const volume = useTvVolume();
  const mute = useTvMute();
  const launchApp = useTvApp();

  const isOn = status.data?.power === "on";
  const muted = status.data?.muted ?? false;
  const vol = status.data?.volume ?? null;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={device.name}
      subtitle={t("kinds.tv", { count: 1, defaultValue: "TV" })}
    >
      <div className="flex flex-col gap-5 py-3">
        {/* Power hero */}
        <button
          type="button"
          onClick={() => power.mutate({ on: !isOn })}
          disabled={power.isPending}
          className={`min-h-[4rem] rounded-md flex items-center justify-center gap-3 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            isOn
              ? "bg-accent text-accent-foreground hover:bg-accent-hover"
              : "bg-surface border border-border text-text hover:border-accent"
          }`}
        >
          <PowerIcon size={20} weight="fill" />
          {isOn
            ? t("status.on", { defaultValue: "Acceso" })
            : t("status.off", { defaultValue: "Spento" })}
        </button>

        {/* Volume */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-muted">Volume</span>
            <span className="text-sm tabular-nums text-text-muted">
              {vol != null ? `${vol}` : "—"}
              {muted && " · muto"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <VolumeButton
              ariaLabel="Diminuisci volume"
              onClick={() => volume.mutate({ delta: "down" })}
              disabled={!isOn || volume.isPending}
            >
              <MinusIcon size={22} weight="bold" />
            </VolumeButton>

            <div className="flex-1 relative h-3 rounded-full bg-surface-warm overflow-hidden">
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-full bg-accent/80"
                animate={{ width: `${vol ?? 0}%` }}
                transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              />
            </div>

            <VolumeButton
              ariaLabel="Aumenta volume"
              onClick={() => volume.mutate({ delta: "up" })}
              disabled={!isOn || volume.isPending}
            >
              <PlusIcon size={22} weight="bold" />
            </VolumeButton>

            <VolumeButton
              ariaLabel={muted ? "Togli muto" : "Silenzia"}
              onClick={() => mute.mutate({ muted: "toggle" })}
              disabled={!isOn || mute.isPending}
              pressed={muted}
            >
              {muted ? (
                <SpeakerSimpleXIcon size={20} weight="duotone" />
              ) : (
                <SpeakerSimpleHighIcon size={20} weight="duotone" />
              )}
            </VolumeButton>
          </div>
        </section>

        {/* App presets */}
        {presetsQ.data && presetsQ.data.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-muted">App</span>
            <div className="grid grid-cols-4 gap-2">
              {presetsQ.data.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => launchApp.mutate({ appId: p.appId })}
                  disabled={!isOn || launchApp.isPending}
                  aria-label={p.label}
                  className="flex flex-col items-center justify-center gap-1 rounded-md bg-surface border border-border py-3 hover:border-accent transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="text-lg font-display font-medium text-text truncate max-w-full px-2">
                    {p.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {!isOn && (
          <p className="label-italic text-sm text-text-subtle text-center">
            Accendi la TV per regolare volume e app.
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

function VolumeButton({
  onClick,
  disabled,
  ariaLabel,
  children,
  pressed,
}: {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  children: React.ReactNode;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={`w-12 h-12 rounded-md border flex items-center justify-center text-text transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        pressed
          ? "bg-accent/15 border-accent text-accent"
          : "bg-surface-elevated border-border hover:border-accent"
      }`}
    >
      {children}
    </button>
  );
}
