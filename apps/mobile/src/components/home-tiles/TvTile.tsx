import type { TvAppPreset } from "@home-panel/shared";
import { PowerIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api-client";
import {
  useTvApp,
  useTvChannel,
  useTvMute,
  useTvPower,
  useTvPresets,
  useTvStatus,
  useTvVolume,
} from "../../lib/hooks/useTv";
import { useT } from "../../lib/useT";
import { PresetIcon } from "../illustrations/StreamingLogos";
import { TvArt } from "../illustrations/TileArt";
import { PendingControl } from "../ui/PendingControl";
import { Tile } from "../ui/Tile";

export function TvTile() {
  const { t } = useT("tv");
  const navigate = useNavigate();
  const { data: status, error } = useTvStatus();
  const { data: presets = [] } = useTvPresets();
  const power = useTvPower();
  const volume = useTvVolume();
  const channel = useTvChannel();
  const mute = useTvMute();
  const app = useTvApp();

  const notConfigured = error instanceof ApiError && error.status === 404;

  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  /* ---- Not configured: tap opens settings anchor ---- */
  if (notConfigured) {
    return (
      <Tile size="md" onClick={() => navigate("/settings#tv")} ariaLabel={t("tile.notConfigured")}>
        <BackdropPaint />
        <span
          className="label-mono text-accent absolute top-5 left-6 z-10"
          style={{ fontWeight: 900 }}
        >
          {t("title")}
        </span>
        <div className="relative flex flex-col items-center justify-center h-full z-10 gap-4 px-4">
          <TvArt size={150} className="pointer-events-none select-none opacity-85" />
          <span className="font-display text-xl italic text-text-muted leading-tight text-center max-w-[20ch]">
            {t("tile.notConfiguredHint")}
          </span>
        </div>
      </Tile>
    );
  }

  /* ---- Off: single-tap powers on ---- */
  if (status?.power === "off") {
    return (
      <PendingControl
        isPending={power.isPending}
        isSuccess={power.isSuccess}
        isError={power.isError}
        className="w-full h-full"
      >
        <Tile size="md" onClick={() => power.mutate({ on: true })} ariaLabel={t("tile.powerOn")}>
          <BackdropPaint />
          <span
            className="label-mono text-accent absolute top-5 left-6 z-10"
            style={{ fontWeight: 900 }}
          >
            {t("title")}
          </span>
          <div className="relative flex flex-col items-center justify-center h-full z-10 gap-4 px-4">
            <TvArt size={160} className="pointer-events-none select-none anim-drift" />
            <span className="font-display text-2xl italic text-text-muted leading-tight">
              {t("tile.off")}
            </span>
          </div>
        </Tile>
      </PendingControl>
    );
  }

  /* ---- On: remote-control layout ---- */
  return (
    <Tile size="md" ariaLabel={t("title")}>
      <BackdropPaint variant="on" />
      <div className="relative flex flex-col h-full z-10 gap-4">
        {/* Header: title + current input label */}
        <div className="flex items-start justify-between gap-3">
          <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
            {t("title")}
          </span>
          {status?.input ? (
            <span className="text-sm font-medium text-text-muted truncate">{status.input}</span>
          ) : null}
        </div>

        {/* App preset grid — horizontal row of brand buttons */}
        <PresetRow
          presets={presets.slice(0, 4)}
          onLaunch={(p) => app.mutate({ appId: p.appId })}
          pendingAppId={app.isPending ? app.variables?.appId : undefined}
          isError={app.isError}
          isSuccess={app.isSuccess}
          lastLaunchedAppId={app.variables?.appId}
        />

        {/* Volume + Channel — two centered stacks side by side */}
        <div className="flex items-start justify-center gap-8">
          <StepperStack
            label={t("tile.volume")}
            readout={status?.volume ?? null}
            onUp={() => volume.mutate({ delta: "up" })}
            onDown={() => volume.mutate({ delta: "down" })}
            isPending={volume.isPending}
            isSuccess={volume.isSuccess}
            isError={volume.isError}
            ariaRoot={t("tile.volume")}
          />
          <StepperStack
            label={t("tile.channel")}
            readout={null}
            onUp={() => channel.mutate({ delta: "up" })}
            onDown={() => channel.mutate({ delta: "down" })}
            isPending={channel.isPending}
            isSuccess={channel.isSuccess}
            isError={channel.isError}
            ariaRoot={t("tile.channel")}
          />
        </div>

        {/* Bottom row: mute + power */}
        <div className="flex items-center justify-center gap-3 mt-auto">
          <PendingControl
            isPending={mute.isPending}
            isSuccess={mute.isSuccess}
            isError={mute.isError}
          >
            <IconButton
              label={status?.muted ? t("tile.unmuted") : t("tile.muted")}
              onClick={(e) => {
                stop(e);
                mute.mutate({ muted: "toggle" });
              }}
            >
              {status?.muted ? (
                <SpeakerSlashIcon size={22} weight="duotone" />
              ) : (
                <SpeakerHighIcon size={22} weight="duotone" />
              )}
            </IconButton>
          </PendingControl>
          <PendingControl
            isPending={power.isPending}
            isSuccess={power.isSuccess}
            isError={power.isError}
          >
            <IconButton
              label={t("tile.powerOff")}
              onClick={(e) => {
                stop(e);
                power.mutate({ on: false });
              }}
            >
              <PowerIcon size={22} weight="duotone" />
            </IconButton>
          </PendingControl>
        </div>
      </div>
    </Tile>
  );
}

/* ------------------------------------------------------------------------ */
/*  Small local helpers                                                      */
/* ------------------------------------------------------------------------ */

function BackdropPaint({ variant }: { variant?: "on" }) {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        background:
          variant === "on"
            ? "radial-gradient(circle at 100% 100%, var(--tile-mauve-b) 0%, transparent 55%)"
            : "radial-gradient(circle at 100% 100%, var(--tile-sky-b) 0%, transparent 55%)",
        opacity: 0.55,
      }}
    />
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="w-12 h-12 flex items-center justify-center rounded-full bg-surface border border-border text-text hover:border-accent transition-colors"
    >
      {children}
    </button>
  );
}

/**
 * Stacked +/- stepper used for Volume and Channel.
 *
 * Layout:
 *   [ +  −  ]    ← round buttons
 *   ─────────    ← horizontal rule
 *     LABEL      ← caption (mono, uppercase)
 *     42         ← optional readout (only Volume reports a value)
 */
function StepperStack({
  label,
  readout,
  onUp,
  onDown,
  isPending,
  isSuccess,
  isError,
  ariaRoot,
}: {
  label: string;
  readout: number | null;
  onUp: () => void;
  onDown: () => void;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  ariaRoot: string;
}) {
  return (
    <PendingControl isPending={isPending} isSuccess={isSuccess} isError={isError}>
      <div className="flex flex-col items-center gap-1.5 w-[112px]">
        <div className="flex items-center justify-center gap-2">
          <StepButton label={`${ariaRoot} +`} onClick={onUp}>
            +
          </StepButton>
          <StepButton label={`${ariaRoot} −`} onClick={onDown}>
            −
          </StepButton>
        </div>
        <span className="w-full h-px bg-border" aria-hidden />
        <span className="label-mono text-text-muted tracking-widest">{label}</span>
        {readout !== null ? (
          <span className="font-display font-bold text-text tabular-nums text-base leading-none -mt-0.5">
            {readout}
          </span>
        ) : null}
      </div>
    </PendingControl>
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
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className="w-11 h-11 flex items-center justify-center rounded-full bg-surface border border-border text-2xl font-medium leading-none hover:border-accent hover:text-accent transition-colors"
    >
      {children}
    </button>
  );
}

function PresetRow({
  presets,
  onLaunch,
  pendingAppId,
  isError,
  isSuccess,
  lastLaunchedAppId,
}: {
  presets: TvAppPreset[];
  onLaunch: (preset: TvAppPreset) => void;
  pendingAppId: string | undefined;
  isError: boolean;
  isSuccess: boolean;
  lastLaunchedAppId: string | undefined;
}) {
  if (presets.length === 0) return null;
  /* Horizontal row of icon-only brand buttons, centered. The brand marks carry
   * the meaning — no label needed next to each. */
  return (
    <div className="flex items-center justify-center gap-3 w-full">
      {presets.slice(0, 4).map((p) => {
        const thisIsPending = pendingAppId === p.appId;
        const thisIsError = isError && lastLaunchedAppId === p.appId;
        const thisIsSuccess = isSuccess && lastLaunchedAppId === p.appId;
        return (
          <PendingControl
            key={p.key}
            isPending={thisIsPending}
            isSuccess={thisIsSuccess}
            isError={thisIsError}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLaunch(p);
              }}
              className="rounded-md hover:scale-105 transition-transform"
              aria-label={p.label}
              title={p.label}
            >
              <PresetIcon presetKey={p.key} size={48} />
            </button>
          </PendingControl>
        );
      })}
    </div>
  );
}
