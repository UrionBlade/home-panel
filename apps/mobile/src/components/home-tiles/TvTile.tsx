import type { TvAppPreset, TvStatus } from "@home-panel/shared";
import {
  FilmStripIcon,
  PlayIcon,
  PowerIcon,
  SparkleIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TelevisionSimpleIcon,
  YoutubeLogoIcon,
} from "@phosphor-icons/react";
import type { MouseEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../lib/api-client";
import {
  useTvApp,
  useTvMute,
  useTvPower,
  useTvPresets,
  useTvStatus,
  useTvVolume,
} from "../../lib/hooks/useTv";
import { useT } from "../../lib/useT";
import { TvArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

/** Maps preset icon names to actual Phosphor components. */
function PresetIcon({ name, size = 18 }: { name: string; size?: number }): ReactNode {
  const common = { size, weight: "duotone" as const };
  switch (name) {
    case "YoutubeLogo":
      return <YoutubeLogoIcon {...common} />;
    case "FilmStrip":
      return <FilmStripIcon {...common} />;
    case "Sparkle":
      return <SparkleIcon {...common} />;
    case "Television":
      return <TelevisionSimpleIcon {...common} />;
    default:
      return <PlayIcon {...common} />;
  }
}

export function TvTile() {
  const { t } = useT("tv");
  const navigate = useNavigate();
  const { data: status, error } = useTvStatus();
  const { data: presets = [] } = useTvPresets();
  const power = useTvPower();
  const volume = useTvVolume();
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
        <div className="relative flex items-center gap-4 h-full z-10">
          <div className="flex flex-col justify-between h-full min-w-0 flex-1">
            <span className="label-mono text-text-muted">{t("title")}</span>
            <span className="text-sm font-medium text-text-muted">
              {t("tile.notConfiguredHint")}
            </span>
          </div>
          <TvArt size={110} className="shrink-0 pointer-events-none select-none opacity-80" />
        </div>
      </Tile>
    );
  }

  /* ---- Off: single-tap powers on ---- */
  if (status?.power === "off") {
    return (
      <Tile size="md" onClick={() => power.mutate({ on: true })} ariaLabel={t("tile.powerOn")}>
        <BackdropPaint />
        <div className="relative flex items-center gap-4 h-full z-10">
          <div className="flex flex-col justify-between h-full min-w-0 flex-1">
            <span className="label-mono text-text-muted">{t("title")}</span>
            <span className="text-sm font-medium text-text-muted">{t("tile.off")}</span>
          </div>
          <TvArt size={110} className="shrink-0 pointer-events-none select-none anim-drift" />
        </div>
      </Tile>
    );
  }

  /* ---- On: expanded controls ---- */
  return (
    <Tile size="md" ariaLabel={t("title")}>
      <BackdropPaint variant="on" />
      <div className="relative flex flex-col justify-between h-full z-10 gap-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col min-w-0">
            <span className="label-mono text-text-muted">{t("title")}</span>
            {status?.input ? (
              <span className="text-sm font-medium text-text truncate">{status.input}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton
              label={status?.muted ? t("tile.unmuted") : t("tile.muted")}
              onClick={(e) => {
                stop(e);
                mute.mutate({ muted: "toggle" });
              }}
            >
              {status?.muted ? (
                <SpeakerSlashIcon size={18} weight="duotone" />
              ) : (
                <SpeakerHighIcon size={18} weight="duotone" />
              )}
            </IconButton>
            <IconButton
              label={t("tile.powerOff")}
              onClick={(e) => {
                stop(e);
                power.mutate({ on: false });
              }}
            >
              <PowerIcon size={18} weight="duotone" />
            </IconButton>
          </div>
        </div>

        <VolumeRow
          status={status}
          onUp={() => volume.mutate({ delta: "up" })}
          onDown={() => volume.mutate({ delta: "down" })}
        />

        <PresetRow presets={presets.slice(0, 4)} onLaunch={(p) => app.mutate({ appId: p.appId })} />
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
      className="w-9 h-9 flex items-center justify-center rounded-full bg-surface border border-border text-text hover:border-accent transition-colors"
    >
      {children}
    </button>
  );
}

function VolumeRow({
  status,
  onUp,
  onDown,
}: {
  status: TvStatus | undefined;
  onUp: () => void;
  onDown: () => void;
}) {
  const { t } = useT("tv");
  const level = status?.volume ?? null;
  return (
    <div className="flex items-center gap-2">
      <span className="label-mono text-text-muted shrink-0">{t("tile.volume")}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDown();
        }}
        aria-label={`${t("tile.volume")} −`}
        className="px-2 py-0.5 rounded-md bg-surface border border-border text-sm font-medium hover:border-accent transition-colors"
      >
        −
      </button>
      <div
        className="relative flex-1 h-1.5 rounded-full overflow-hidden bg-surface border border-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={level ?? 0}
      >
        {level !== null ? (
          <div
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, level))}%` }}
          />
        ) : null}
      </div>
      <span className="label-mono text-text-muted tabular-nums w-7 text-right">{level ?? "—"}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUp();
        }}
        aria-label={`${t("tile.volume")} +`}
        className="px-2 py-0.5 rounded-md bg-surface border border-border text-sm font-medium hover:border-accent transition-colors"
      >
        +
      </button>
    </div>
  );
}

function PresetRow({
  presets,
  onLaunch,
}: {
  presets: TvAppPreset[];
  onLaunch: (preset: TvAppPreset) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onLaunch(p);
          }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface border border-border hover:border-accent transition-colors shrink-0"
          aria-label={p.label}
          title={p.label}
        >
          <PresetIcon name={p.icon} size={16} />
          <span className="text-xs font-medium truncate max-w-[5.5rem]">{p.label}</span>
        </button>
      ))}
    </div>
  );
}
