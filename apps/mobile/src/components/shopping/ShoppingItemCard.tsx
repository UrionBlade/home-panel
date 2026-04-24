import type { ShoppingItem } from "@home-panel/shared";
import {
  CheckIcon,
  DotsThreeVerticalIcon,
  PencilSimpleIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { useDeleteShoppingItem, useToggleShoppingItem } from "../../lib/hooks/useShopping";
import { useT } from "../../lib/useT";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface ShoppingItemCardProps {
  item: ShoppingItem;
}

/**
 * Inline row for a single shopping item.
 *
 * Layout: [checkbox] [name + qty] [kebab menu]
 *
 * Checkbox semantics:
 *   - Pending (not completed): neutral outline, no fill, no check mark.
 *   - Completed: accent fill with white check, spring scale-in animation.
 *
 * Destructive action (delete) is hidden behind a kebab menu and requires
 * confirmation via ConfirmDialog to prevent accidental taps on the kiosk.
 */
export function ShoppingItemCard({ item }: ShoppingItemCardProps) {
  const { t } = useT("shopping");
  const toggleMutation = useToggleShoppingItem();
  const deleteMutation = useDeleteShoppingItem();

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleToggle() {
    toggleMutation.mutate(item);
  }

  function handleDeleteRequest() {
    setMenuOpen(false);
    setConfirmOpen(true);
  }

  function handleDeleteConfirm() {
    deleteMutation.mutate(item.id, {
      onSettled: () => setConfirmOpen(false),
    });
  }

  return (
    <>
      <div
        className={clsx(
          "flex items-center gap-3 min-h-[3rem] px-3 border-b border-border/40",
          "hover:bg-surface-warm/40 transition-colors duration-150",
          item.completed && "opacity-60",
        )}
      >
        {/* Checkbox toggle — semantically a button with role="checkbox" */}
        <button
          type="button"
          role="checkbox"
          aria-checked={item.completed}
          aria-label={item.completed ? "Segna come da comprare" : "Segna come comprato"}
          onClick={handleToggle}
          className={clsx(
            "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center",
            "transition-colors duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            // Ensure 44px minimum touch target via padding trick
            "min-w-[44px] min-h-[44px]",
            item.completed
              ? "bg-accent border-accent"
              : "bg-transparent border-border hover:border-accent/60",
          )}
        >
          <AnimatePresence>
            {item.completed && (
              <motion.span
                key="check"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 28 }}
                className="flex items-center justify-center"
              >
                <CheckIcon size={14} weight="bold" className="text-accent-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* Name + quantity — grows to fill */}
        <div className="flex-1 min-w-0 flex items-baseline gap-2">
          <span className={clsx("font-display text-lg truncate", item.completed && "line-through")}>
            {item.name}
          </span>
          <span className="text-text-muted text-sm shrink-0">
            {item.quantity} {t(`units.${item.unit}`)}
          </span>
        </div>

        {/* Kebab menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label="Opzioni"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={clsx(
              "inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-md text-text-muted",
              "hover:bg-surface hover:text-text transition-colors duration-150",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            )}
          >
            <DotsThreeVerticalIcon size={20} weight="bold" />
          </button>

          <AnimatePresence>
            {menuOpen && (
              <>
                {/* Backdrop to close on outside tap */}
                <div
                  className="fixed inset-0 z-40"
                  aria-hidden
                  onClick={() => setMenuOpen(false)}
                />
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
                  className={clsx(
                    "absolute right-0 top-full mt-1 z-50",
                    "min-w-[10rem] rounded-md border border-border bg-surface shadow-lg py-1",
                  )}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className={clsx(
                      "w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-base text-text",
                      "hover:bg-surface-elevated transition-colors",
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    <PencilSimpleIcon size={18} aria-hidden />
                    {t("item.actions.edit")}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className={clsx(
                      "w-full text-left px-4 py-2.5 flex items-center gap-2.5 text-base text-danger",
                      "hover:bg-danger/10 transition-colors",
                    )}
                    onClick={handleDeleteRequest}
                  >
                    <TrashIcon size={18} aria-hidden />
                    {t("item.actions.delete")}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t("item.confirmDelete.title")}
        message={t("item.confirmDelete.body", { name: item.name })}
        confirmLabel={t("item.confirmDelete.confirm")}
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={handleDeleteConfirm}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
