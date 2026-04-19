import clsx from "clsx";
import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useReducedMotion } from "../../lib/motion/useReducedMotion";

export type TileSize = "sm" | "md" | "lg" | "xl";

interface TileProps {
  size?: TileSize;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  /** Se impostato, usato come sfondo invece di --color-surface-elevated */
  background?: string;
  /** Colore del testo se background scuro/colorato */
  foreground?: string;
  style?: CSSProperties;
}

const paddingClass: Record<TileSize, string> = {
  sm: "p-5",
  md: "p-6",
  lg: "p-7",
  xl: "p-9",
};

/**
 * Tile con claymorphism: ombra doppia warm, nessun bordo visibile,
 * hover spring con scale + lift. Usa motion per animazione entry.
 */
export function Tile({
  size = "md",
  children,
  className,
  onClick,
  ariaLabel,
  background,
  foreground,
  style,
}: TileProps) {
  const reduced = useReducedMotion();
  const isInteractive = !!onClick;

  const inlineStyle: CSSProperties = {
    ...style,
    ...(background ? { background } : {}),
    ...(foreground ? { color: foreground } : {}),
  };

  const motionProps =
    isInteractive && !reduced
      ? {
          whileHover: {
            y: -4,
            scale: 1.015,
            transition: { type: "spring" as const, stiffness: 260, damping: 18 },
          },
          whileTap: { scale: 0.99, y: 0 },
        }
      : {};

  const commonClasses = clsx(
    "relative w-full h-full text-left overflow-hidden isolate",
    "rounded-tile",
    !background && "bg-surface-elevated",
    "shadow-lg",
    isInteractive &&
      "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    paddingClass[size],
    className,
  );

  if (isInteractive) {
    return (
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        style={inlineStyle}
        className={commonClasses}
        {...motionProps}
      >
        {children}
      </motion.button>
    );
  }

  return (
    <div
      {...(ariaLabel ? { role: "region" as const, "aria-label": ariaLabel } : {})}
      style={inlineStyle}
      className={commonClasses}
    >
      {children}
    </div>
  );
}
