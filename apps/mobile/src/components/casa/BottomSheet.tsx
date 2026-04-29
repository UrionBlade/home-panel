import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect, useRef } from "react";
import { DURATION_DEFAULT, DURATION_MICRO, EASE_OUT_EXPO } from "../../lib/motion/tokens";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Optional header title rendered in Fraunces. */
  title?: string;
  /** Optional subtitle in italic Fraunces, muted. */
  subtitle?: string;
  children: ReactNode;
  /** Footer row — typically Cancel + Save buttons. */
  footer?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Sheet che scivola dal basso — pensato per iPad tenuto in landscape
 * e per iPhone portrait. Sostituisce il Modal centrato per le azioni
 * contestuali (rinomina stanza, sposta device, dettagli light).
 *
 * Rispetto a Modal: arriva dal basso con ease-out-expo, lascia respirare
 * la parte alta della pagina, ed è più tablet-native. Per le conferme
 * distruttive o i form a tutto schermo Modal resta la scelta giusta.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: BottomSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const node = dialogRef.current;
      const first = node?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node)?.focus();
    });

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const nodes = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_MICRO }}
            className="fixed inset-0 z-40 bg-bg/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: DURATION_DEFAULT, ease: [...EASE_OUT_EXPO] }}
            role="dialog"
            aria-modal
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 flex justify-center pointer-events-none"
          >
            <div
              ref={dialogRef}
              tabIndex={-1}
              className="pointer-events-auto w-full mx-4 sm:mx-6 mb-4 sm:mb-6 rounded-lg bg-surface-elevated border border-border shadow-xl outline-none overflow-hidden"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <span className="block w-10 h-1 rounded-full bg-border-strong/50" aria-hidden />
              </div>
              {(title || subtitle) && (
                <header className="px-6 pt-2 pb-4">
                  {title && <h2 className="font-display text-2xl text-text">{title}</h2>}
                  {subtitle && (
                    <p className="label-italic text-base text-text-muted mt-0.5">{subtitle}</p>
                  )}
                </header>
              )}
              <div className="px-6 pb-2 max-h-[min(70vh,540px)] overflow-y-auto">{children}</div>
              {footer && (
                <footer className="flex justify-end gap-3 px-6 py-4 border-t border-border/60 bg-surface">
                  {footer}
                </footer>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
