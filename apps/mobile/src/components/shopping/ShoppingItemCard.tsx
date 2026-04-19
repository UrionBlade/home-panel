import type { ShoppingItem } from "@home-panel/shared";
import { CheckCircleIcon, CircleIcon, TrashIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useDeleteShoppingItem, useToggleShoppingItem } from "../../lib/hooks/useShopping";
import { useT } from "../../lib/useT";
import { IconButton } from "../ui/IconButton";

interface ShoppingItemCardProps {
  item: ShoppingItem;
}

export function ShoppingItemCard({ item }: ShoppingItemCardProps) {
  const { t } = useT("shopping");
  const toggleMutation = useToggleShoppingItem();
  const deleteMutation = useDeleteShoppingItem();

  return (
    <div
      className={clsx(
        "flex items-center gap-4 p-4 rounded-md border border-border bg-surface",
        item.completed && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={() => toggleMutation.mutate(item)}
        className="shrink-0 rounded-full p-1 text-accent hover:bg-surface-elevated transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={item.completed ? "Riattiva" : "Completa"}
      >
        {item.completed ? (
          <CheckCircleIcon size={28} weight="fill" />
        ) : (
          <CircleIcon size={28} weight="duotone" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p className={clsx("font-display text-xl truncate", item.completed && "line-through")}>
          {item.name}
        </p>
        <p className="text-text-muted text-sm">
          {item.quantity} {t(`units.${item.unit}`)}
        </p>
      </div>

      <IconButton
        icon={<TrashIcon size={20} weight="duotone" />}
        label={t("actions.delete")}
        onClick={() => deleteMutation.mutate(item.id)}
      />
    </div>
  );
}
