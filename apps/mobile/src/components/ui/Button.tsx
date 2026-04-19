import clsx from "clsx";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

export type ButtonVariant = "primary" | "ghost" | "icon";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

const sizeClass: Record<ButtonSize, string> = {
  // Minimum touch target: 56pt (md), 64pt (lg) per design guidelines
  sm: "min-h-[44px] px-4 text-sm",
  md: "min-h-[56px] px-6 text-base",
  lg: "min-h-[64px] px-8 text-lg",
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50",
  ghost: "bg-transparent text-text hover:bg-surface border border-border disabled:opacity-50",
  icon: "bg-transparent text-text hover:bg-surface min-w-[56px] disabled:opacity-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading,
      iconLeft,
      iconRight,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[background-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          sizeClass[size],
          variantClass[variant],
          className,
        )}
        {...rest}
      >
        {iconLeft && <span className="shrink-0">{iconLeft}</span>}
        {isLoading ? <span aria-busy>…</span> : children}
        {iconRight && <span className="shrink-0">{iconRight}</span>}
      </button>
    );
  },
);
Button.displayName = "Button";
