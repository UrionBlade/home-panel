import clsx from "clsx";
import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Required for accessibility */
  label: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ icon, label, className, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={clsx(
          "inline-flex items-center justify-center min-w-[56px] min-h-[56px] rounded-md text-text",
          "hover:bg-surface active:scale-[0.96] transition-[background-color,transform] duration-200",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          className,
        )}
        {...rest}
      >
        {icon}
      </button>
    );
  },
);
IconButton.displayName = "IconButton";
