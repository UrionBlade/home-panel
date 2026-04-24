import { DotsThreeIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { type CSSProperties, type KeyboardEvent, useRef } from "react";
import { resolveDeviceIcon } from "../../lib/devices/icons";
import type { DeviceEntity, DeviceStatus } from "../../lib/devices/model";
import { useT } from "../../lib/useT";

interface DeviceTileProps {
  device: DeviceEntity;
  onPrimary: () => void;
  onMenu: () => void;
  disabled?: boolean;
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
 * - Live state (on, running, armed) makes the tile radiate warmth via a
 *   warm-tinted background and a soft radial glow behind the icon.
 *   Readable at ~3 meters without squinting.
 * - Off/idle uses the neutral surface — quiet by default.
 * - Offline uses a dashed border and a warning badge.
 */
export function DeviceTile({ device, onPrimary, onMenu, disabled }: DeviceTileProps) {
  const { t } = useT("casa");
  const Ico = resolveDeviceIcon(device.kind);
  const palette = paletteFor(device.status);
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
    /* Always call onPrimary — CasaPage decides whether to toggle
     * (lights) or open the kind-specific ControlSheet (AC, TV,
     * cameras, appliances). The tile stays dumb about dispatch. */
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
        style={palette.bodyStyle}
        className={[
          "relative w-full min-h-[9.5rem] p-5 text-left rounded-lg",
          "flex flex-col gap-4 justify-between",
          "transition-[background-color,border-color,box-shadow] duration-300",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          "disabled:opacity-60",
          palette.bodyClass,
        ].join(" ")}
      >
        {palette.glow && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-lg opacity-70"
            style={{
              background:
                "radial-gradient(circle at 22% 18%, color-mix(in oklch, var(--color-accent) 22%, transparent), transparent 62%)",
            }}
          />
        )}

        <div className="relative">
          <span
            className={[
              "flex items-center justify-center rounded-md transition-colors",
              "w-12 h-12 shrink-0",
              palette.iconChipClass,
            ].join(" ")}
            style={palette.iconChipStyle}
          >
            <Ico size={26} weight={palette.iconWeight} />
          </span>
        </div>

        <div className="relative min-w-0 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-medium text-text truncate leading-tight">
              {device.name}
            </p>
            {device.subtitle && (
              <p className="text-sm text-text-muted truncate mt-0.5">{device.subtitle}</p>
            )}
          </div>
          <StatusBadge status={device.status} />
        </div>
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
          /* Always at least 55% visible — touch devices have no hover
           * and hiding the menu entirely would make it undiscoverable. */
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
/*  Status glyph                                                       */
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
      className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${classes[status]}`}
    >
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Palette                                                             */
/* ------------------------------------------------------------------ */

interface TilePalette {
  bodyClass: string;
  bodyStyle?: CSSProperties;
  iconChipClass: string;
  iconChipStyle?: CSSProperties;
  iconWeight: "duotone" | "fill" | "regular";
  glow: boolean;
}

function paletteFor(status: DeviceStatus): TilePalette {
  switch (status) {
    case "on":
    case "armed":
      return {
        bodyClass: "border border-accent/40 shadow-md",
        bodyStyle: {
          backgroundColor:
            "color-mix(in oklch, var(--color-accent) 10%, var(--color-surface-elevated))",
        },
        iconChipClass: "",
        iconChipStyle: {
          backgroundColor: "color-mix(in oklch, var(--color-accent) 20%, transparent)",
          color: "var(--color-accent)",
        },
        iconWeight: "fill",
        glow: true,
      };
    case "running":
      return {
        bodyClass: "border border-sage/40 shadow-sm",
        bodyStyle: {
          backgroundColor:
            "color-mix(in oklch, var(--color-sage) 10%, var(--color-surface-elevated))",
        },
        iconChipClass: "",
        iconChipStyle: {
          backgroundColor: "color-mix(in oklch, var(--color-sage) 20%, transparent)",
          color: "var(--color-sage)",
        },
        iconWeight: "fill",
        glow: false,
      };
    case "paused":
      return {
        bodyClass: "border border-ochre/40 shadow-sm",
        bodyStyle: {
          backgroundColor:
            "color-mix(in oklch, var(--color-ochre) 10%, var(--color-surface-elevated))",
        },
        iconChipClass: "",
        iconChipStyle: {
          backgroundColor: "color-mix(in oklch, var(--color-ochre) 20%, transparent)",
          color: "var(--color-ochre-fg)",
        },
        iconWeight: "duotone",
        glow: false,
      };
    case "offline":
      return {
        bodyClass: "bg-surface border border-dashed border-danger/40 opacity-85",
        iconChipClass: "bg-danger/10 text-danger",
        iconWeight: "duotone",
        glow: false,
      };
    default:
      return {
        bodyClass:
          "bg-surface-elevated border border-border hover:border-accent/40 shadow-sm hover:shadow-md",
        iconChipClass: "bg-surface text-text-muted",
        iconWeight: "duotone",
        glow: false,
      };
  }
}
