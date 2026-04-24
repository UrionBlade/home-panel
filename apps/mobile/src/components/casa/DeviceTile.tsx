import { DotsThreeIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { type CSSProperties, type KeyboardEvent, useRef } from "react";
import type { DeviceKind } from "../../lib/devices/icons";
import { resolveDeviceIcon } from "../../lib/devices/icons";
import type { DeviceEntity, DeviceStatus } from "../../lib/devices/model";
import { ipCameraSnapshotUrl } from "../../lib/ipCameras/snapshotUrl";
import { useT } from "../../lib/useT";

interface DeviceTileProps {
  device: DeviceEntity;
  onPrimary: () => void;
  onMenu: () => void;
  disabled?: boolean;
  /** Layout variant: "grid" (default square card) or "stripe" (wide horizontal band). */
  variant?: "grid" | "stripe";
}

/**
 * Universal tile used on CasaPage for every device kind.
 *
 * Interaction model:
 * - Tap on the tile body → primary action (toggle for lights/AC/TV).
 *   Devices without a primary action still respond to tap by opening
 *   the menu sheet — never silent feedback.
 * - Long-press (~520 ms) OR tap on the ⋯ affordance → menu sheet
 *   (rename / move / details).
 * - Shift+Enter → menu sheet (keyboard analogue of long-press).
 *
 * Visual language:
 * - Each device kind has a dedicated tint (tile-* tokens) applied as a
 *   diagonal gradient — warm ochre for lights, cool sky for AC, mauve
 *   for cameras, sage for laundry, terracotta for TV.
 * - Active state (on, running, armed) adds a radial glow behind the icon.
 * - Offline uses a dashed border and warning badge.
 * - Camera tiles show a live snapshot thumbnail when available.
 */
export function DeviceTile({
  device,
  onPrimary,
  onMenu,
  disabled,
  variant = "grid",
}: DeviceTileProps) {
  const { t } = useT("casa");
  const Ico = resolveDeviceIcon(device.kind);
  const statusPalette = paletteFor(device.status);
  const kindTint = tintForKind(device.kind);
  const longPressRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  const startLongPress = () => {
    longPressTriggeredRef.current = false;
    longPressRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onMenu();
    }, 520);
  };
  const cancelLongPress = () => {
    if (longPressRef.current != null) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const handleClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    onPrimary();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      onMenu();
    }
  };

  const ariaLabel = `${device.name} — ${t(`status.${device.status}`, {
    defaultValue: device.status,
  })}`;

  const isCamera = device.kind === "camera" || device.kind === "ip_camera";
  const isIpCamera = device.kind === "ip_camera";

  // Gradient background from tile tokens; neutral kinds fall back to surface
  const tileBackground = kindTint.neutral
    ? undefined
    : `linear-gradient(135deg, var(--tile-${kindTint.name}-a) 0%, var(--tile-${kindTint.name}-b) 100%)`;

  const stripeLayout = variant === "stripe";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
      className="relative group"
    >
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-pressed={device.supportsToggle ? device.status === "on" : undefined}
        style={{
          ...(tileBackground ? { background: tileBackground } : {}),
          ...(statusPalette.bodyStyle ?? {}),
        }}
        className={[
          "relative w-full text-left overflow-hidden",
          stripeLayout
            ? "min-h-[10rem] p-5 rounded-xl flex flex-row items-center gap-5"
            : "min-h-[9.5rem] p-4 rounded-xl flex flex-col gap-3 justify-between",
          "transition-[background,border-color,box-shadow] duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:opacity-60",
          kindTint.neutral
            ? "bg-surface-elevated border border-border hover:border-accent/40 shadow-sm hover:shadow-md"
            : "border border-transparent shadow-sm",
          statusPalette.bodyClass,
        ].join(" ")}
      >
        {/* Radial glow for active state — sits behind everything */}
        {statusPalette.glow && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-xl opacity-60"
            style={{
              background:
                "radial-gradient(circle at 22% 18%, color-mix(in oklch, var(--color-accent) 22%, transparent), transparent 62%)",
            }}
          />
        )}

        {/* Camera tile: snapshot as background with gradient overlay */}
        {isIpCamera && <CameraSnapshotBackground cameraId={(device.raw as { id: string }).id} />}

        {stripeLayout ? (
          /* ── Stripe layout (1 device per room) ────────────────────── */
          <>
            <div className="relative shrink-0">
              {isCamera && !isIpCamera ? (
                <CameraInitialBadge name={device.name} size="lg" />
              ) : (
                <span
                  className="flex items-center justify-center w-16 h-16 rounded-xl shrink-0"
                  style={{
                    backgroundColor: "oklch(from currentColor l c h / 0.12)",
                    color: "var(--color-text)",
                  }}
                >
                  <Ico size={32} weight={statusPalette.iconWeight} />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <p className="font-display text-2xl font-medium text-text line-clamp-2 leading-tight">
                {device.name}
              </p>
              {device.subtitle && <p className="text-sm text-text-muted">{device.subtitle}</p>}
              <StatusBadge status={device.status} />
            </div>
            {/* Large decorative initial for stripe cameras */}
            {isCamera && !isIpCamera && (
              <span
                aria-hidden
                className="absolute right-6 bottom-0 font-display font-black text-[8rem] leading-none text-text opacity-[0.06] select-none pointer-events-none"
              >
                {device.name.charAt(0).toUpperCase()}
              </span>
            )}
          </>
        ) : (
          /* ── Grid layout (default square card) ─────────────────────── */
          <>
            <div className="relative">
              {isCamera && !isIpCamera ? (
                <CameraInitialBadge name={device.name} size="sm" />
              ) : (
                <span
                  className="flex items-center justify-center w-12 h-12 shrink-0 rounded-lg"
                  style={{
                    backgroundColor: "oklch(from currentColor l c h / 0.10)",
                    color: "var(--color-text)",
                  }}
                >
                  <Ico size={24} weight={statusPalette.iconWeight} />
                </span>
              )}
            </div>

            {/* Large decorative initial for Blink cameras (behind content) */}
            {isCamera && !isIpCamera && (
              <span
                aria-hidden
                className="absolute bottom-0 right-2 font-display font-black text-[6rem] leading-none text-text opacity-[0.07] select-none pointer-events-none"
              >
                {device.name.charAt(0).toUpperCase()}
              </span>
            )}

            <div className="relative min-w-0 flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-medium text-text line-clamp-2 leading-tight">
                  {device.name}
                </p>
                {device.subtitle && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{device.subtitle}</p>
                )}
              </div>
              <StatusBadge status={device.status} />
            </div>
          </>
        )}
      </button>

      <button
        type="button"
        aria-label={t("tile.menu", { name: device.name })}
        onClick={(e) => {
          e.stopPropagation();
          onMenu();
        }}
        className={[
          "absolute top-2 right-2 w-10 h-10 rounded-md",
          "flex items-center justify-center",
          "text-text-subtle hover:text-text",
          "opacity-60 group-hover:opacity-100 focus-visible:opacity-100",
          "transition-opacity duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        ].join(" ")}
      >
        <DotsThreeIcon size={22} weight="bold" />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera snapshot background (IP cameras only)                      */
/* ------------------------------------------------------------------ */

function CameraSnapshotBackground({ cameraId }: { cameraId: string }) {
  const snapshotUrl = ipCameraSnapshotUrl(cameraId);
  return (
    <>
      <img
        src={snapshotUrl}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      {/* Bottom gradient for text legibility */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to top, oklch(0% 0 0 / 0.55) 0%, transparent 60%)",
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera initial badge (Blink cameras — no live snapshot)           */
/* ------------------------------------------------------------------ */

function CameraInitialBadge({ name, size }: { name: string; size: "sm" | "lg" }) {
  const letter = name.trim().charAt(0).toUpperCase() || "C";
  const sizeClass = size === "lg" ? "w-16 h-16 text-2xl" : "w-12 h-12 text-lg";
  return (
    <span
      className={`flex items-center justify-center rounded-lg font-display font-black text-text shrink-0 ${sizeClass}`}
      style={{ backgroundColor: "oklch(from currentColor l c h / 0.12)" }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Status badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: DeviceStatus }) {
  const { t } = useT("casa");
  if (status === "unknown") return null;
  const classes: Record<DeviceStatus, string> = {
    on: "bg-accent/15 text-accent",
    off: "bg-surface text-text-subtle",
    running: "bg-sage/20 text-sage",
    paused: "bg-ochre/25 text-ochre-fg",
    armed: "bg-accent/15 text-accent",
    disarmed: "bg-surface text-text-subtle",
    offline: "bg-danger/10 text-danger",
    unknown: "",
  };
  return (
    <span
      className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${classes[status]}`}
    >
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Kind tint mapping                                                  */
/* ------------------------------------------------------------------ */

interface KindTint {
  /** CSS token name fragment: "terracotta" | "sage" | "ochre" | "mauve" | "sky" */
  name: "terracotta" | "sage" | "ochre" | "mauve" | "sky";
  neutral: false;
}

interface NeutralTint {
  neutral: true;
}

type TintResult = KindTint | NeutralTint;

/**
 * Maps a device kind to the tile gradient token pair.
 * Neutral kinds (sensor, plug) use the default surface background.
 */
function tintForKind(kind: DeviceKind): TintResult {
  switch (kind) {
    case "light":
      return { name: "ochre", neutral: false };
    case "ac":
      return { name: "sky", neutral: false };
    case "camera":
    case "ip_camera":
      return { name: "mauve", neutral: false };
    case "washer":
    case "dryer":
      return { name: "sage", neutral: false };
    case "tv":
      return { name: "terracotta", neutral: false };
    default:
      return { neutral: true };
  }
}

/* ------------------------------------------------------------------ */
/*  Status palette (active / running / paused / offline overlay)      */
/* ------------------------------------------------------------------ */

interface TilePalette {
  bodyClass: string;
  bodyStyle?: CSSProperties;
  iconWeight: "duotone" | "fill" | "regular";
  glow: boolean;
}

/**
 * Status-driven overlay on top of the kind tint.
 * Only changes border, shadow intensity, and glow — not the base background.
 */
function paletteFor(status: DeviceStatus): TilePalette {
  switch (status) {
    case "on":
    case "armed":
      return {
        bodyClass: "border-accent/30 shadow-md",
        iconWeight: "fill",
        glow: true,
      };
    case "running":
      return {
        bodyClass: "border-sage/30 shadow-sm",
        iconWeight: "fill",
        glow: false,
      };
    case "paused":
      return {
        bodyClass: "border-ochre/30 shadow-sm",
        iconWeight: "duotone",
        glow: false,
      };
    case "offline":
      return {
        bodyClass: "border border-dashed border-danger/40 opacity-85",
        iconWeight: "duotone",
        glow: false,
      };
    default:
      return {
        bodyClass: "",
        iconWeight: "duotone",
        glow: false,
      };
  }
}
