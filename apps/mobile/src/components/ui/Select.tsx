import clsx from "clsx";
import { forwardRef, type SelectHTMLAttributes, useId } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, id, className, ...rest }, ref) => {
    const reactId = useId();
    const selectId = id ?? reactId;

    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-text-muted">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={clsx(
            "min-h-[56px] rounded-md bg-surface px-4 text-base text-text",
            "border border-border focus:border-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            error && "border-danger",
            className,
          )}
          aria-invalid={!!error}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  },
);
Select.displayName = "Select";
