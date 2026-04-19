import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { DURATION_DEFAULT, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useUiStore } from "../../store/ui-store";

const TOAST_TIMEOUT = 4000;

const toneClass: Record<"info" | "success" | "danger", string> = {
  info: "bg-surface-elevated text-text border-border",
  success: "bg-success text-bg border-success",
  danger: "bg-danger text-bg border-danger",
};

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  // Auto-dismiss
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((toast) => setTimeout(() => dismissToast(toast.id), TOAST_TIMEOUT));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none md:bottom-6 md:right-6"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: DURATION_DEFAULT, ease: [...EASE_OUT_QUART] }}
            className={`pointer-events-auto rounded-md border px-5 py-4 shadow-md ${toneClass[toast.tone]}`}
          >
            {toast.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
