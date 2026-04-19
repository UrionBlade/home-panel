import clsx from "clsx";
import { forwardRef, type InputHTMLAttributes, useId } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, ...rest }, ref) => {
    const reactId = useId();
    const inputId = id ?? reactId;

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-text-muted">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            "min-h-[56px] rounded-md bg-surface px-4 text-base text-text",
            "border border-border focus:border-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            "placeholder:text-text-subtle",
            error && "border-danger",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {error ? (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-sm text-text-subtle">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = "Input";
