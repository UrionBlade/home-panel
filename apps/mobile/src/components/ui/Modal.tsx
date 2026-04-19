import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useEffect } from "react";
import { DURATION_DEFAULT, DURATION_MICRO, EASE_OUT_QUART } from "../../lib/motion/tokens";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  // Lock body scroll when the modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_MICRO }}
            className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{
              duration: DURATION_DEFAULT,
              ease: [...EASE_OUT_QUART],
            }}
            role="dialog"
            aria-modal
            aria-label={title}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-xl rounded-xl bg-surface-elevated shadow-xl border border-border">
              {title && (
                <header className="px-7 pt-7 pb-3">
                  <h2 className="text-2xl font-display">{title}</h2>
                </header>
              )}
              <div className="px-7 py-4">{children}</div>
              {footer && (
                <footer className="flex justify-end gap-3 px-7 py-5 border-t border-border">
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
