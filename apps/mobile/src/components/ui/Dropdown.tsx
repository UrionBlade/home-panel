import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

export interface DropdownOption {
  value: string;
  label: string;
  /** Optional leading glyph (e.g. a color dot or small icon). */
  accessory?: ReactNode;
  /** Optional secondary line shown muted under the label. */
  hint?: string;
}

interface DropdownProps {
  label?: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
  /** Aligns the popover. Defaults to "left". */
  align?: "left" | "right";
}

/**
 * Fully-custom dropdown — replaces native <select> with a styled trigger +
 * animated popover. Keyboard navigation (↑/↓/Home/End/Enter/Esc), outside
 * click dismissal, selected state with a check glyph.
 *
 * Visual goal: match the rest of the design system (rounded surface, warm
 * border, accent-driven hover) rather than the grey OS picker.
 */
export function Dropdown({
  label,
  options,
  value,
  onChange,
  disabled,
  error,
  placeholder,
  align = "left",
}: DropdownProps) {
  const reactId = useId();
  const triggerId = `${reactId}-trigger`;
  const listboxId = `${reactId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  /* Auto-flip: "down" by default, "up" when there's not enough room under the
   * trigger (e.g. last step in a routine editor near the bottom of a
   * scrollable page). Picked at open time. */
  const [direction, setDirection] = useState<"down" | "up">("down");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  /* Close on outside click or outside scroll — scrolls *inside* the popover
   * (e.g. scrollIntoView on the initially-selected option) must not close
   * the menu, otherwise any dropdown whose default value isn't the first
   * option would snap shut on open. */
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleScroll(e: Event) {
      const target = e.target as Node | null;
      if (target && popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  /* Global Escape to close. */
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  /* Reset highlight when opening. */
  useEffect(() => {
    if (open) setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  /* Scroll highlighted option into view. */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const node = popoverRef.current?.querySelector<HTMLElement>(
      `[data-dropdown-option-index="${activeIndex}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function commit(index: number) {
    if (index < 0 || index >= options.length) return;
    onChange(options[index].value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handleListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {label ? (
        <label htmlFor={triggerId} className="text-sm font-medium text-text-muted">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-invalid={!!error}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setOpen((v) => {
              if (v) return false;
              /* Compute direction on open: if the trigger is closer to the
               * bottom of the viewport than to the top AND there isn't at
               * least ~260px below, flip the popover up. */
              const rect = triggerRef.current?.getBoundingClientRect();
              if (rect) {
                const below = window.innerHeight - rect.bottom;
                const above = rect.top;
                setDirection(below < 260 && above > below ? "up" : "down");
              }
              return true;
            });
          }}
          onKeyDown={handleTriggerKey}
          className={clsx(
            "w-full min-h-[56px] rounded-md bg-surface pl-4 pr-10 text-left text-base text-text",
            "border transition-colors",
            "flex items-center gap-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            error
              ? "border-danger"
              : open
                ? "border-accent"
                : "border-border hover:border-accent/60",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {selected?.accessory ? (
            <span aria-hidden className="shrink-0">
              {selected.accessory}
            </span>
          ) : null}
          <span className={clsx("flex-1 truncate", !selected && "text-text-subtle")}>
            {selected?.label ?? placeholder ?? ""}
          </span>
          <CaretDownIcon
            aria-hidden
            size={18}
            weight="bold"
            className={clsx(
              "absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-transform duration-200",
              open && "rotate-180 text-accent",
            )}
          />
        </button>

        <AnimatePresence>
          {open ? (
            <motion.div
              ref={popoverRef}
              role="listbox"
              id={listboxId}
              aria-activedescendant={
                activeIndex >= 0 ? `${reactId}-option-${activeIndex}` : undefined
              }
              tabIndex={-1}
              onKeyDown={handleListKey}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
              onAnimationComplete={() => popoverRef.current?.focus()}
              className={clsx(
                "absolute z-50 min-w-full max-h-64 overflow-y-auto",
                "rounded-md border border-border bg-surface shadow-lg",
                "py-1",
                "focus-visible:outline-none",
                align === "right" ? "right-0" : "left-0",
                direction === "up" ? "bottom-full mb-2" : "top-full mt-2",
              )}
              style={{
                boxShadow: "0 18px 40px -20px oklch(15% 0.02 60 / 0.45)",
              }}
            >
              {options.map((opt, index) => {
                const isActive = index === activeIndex;
                const isSelected = opt.value === value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    role="option"
                    id={`${reactId}-option-${index}`}
                    aria-selected={isSelected}
                    data-dropdown-option-index={index}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(index)}
                    className={clsx(
                      "w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-base",
                      "transition-colors",
                      isActive ? "bg-accent/10 text-text" : "text-text-muted hover:text-text",
                    )}
                  >
                    {opt.accessory ? (
                      <span aria-hidden className="shrink-0">
                        {opt.accessory}
                      </span>
                    ) : null}
                    <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                    {opt.hint ? (
                      <span className="text-xs text-text-subtle shrink-0">{opt.hint}</span>
                    ) : null}
                    <CheckIcon
                      aria-hidden
                      size={16}
                      weight="bold"
                      className={clsx(
                        "shrink-0 transition-opacity",
                        isSelected ? "opacity-100 text-accent" : "opacity-0",
                      )}
                    />
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
