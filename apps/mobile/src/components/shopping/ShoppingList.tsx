import type { ShoppingCategory, ShoppingItem } from "@home-panel/shared";
import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useShoppingItems } from "../../lib/hooks/useShopping";
import { useT } from "../../lib/useT";
import { ShoppingItemCard } from "./ShoppingItemCard";

const CATEGORY_ORDER: ShoppingCategory[] = [
  "fruits",
  "meat",
  "dairy",
  "bakery",
  "pantry",
  "frozen",
  "beverages",
  "other",
];

function groupByCategory(items: ShoppingItem[]): Map<ShoppingCategory, ShoppingItem[]> {
  const map = new Map<ShoppingCategory, ShoppingItem[]>();
  for (const item of items) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

export function ShoppingList() {
  const { t } = useT("shopping");
  const { t: tCommon } = useT("common");
  const { data: items = [], isLoading, error } = useShoppingItems();
  const [showCompleted, setShowCompleted] = useState(false);

  const { active, completed } = useMemo(() => {
    return {
      active: items.filter((i) => !i.completed),
      completed: items.filter((i) => i.completed),
    };
  }, [items]);

  const grouped = useMemo(() => groupByCategory(active), [active]);

  if (isLoading) {
    return <p className="text-text-muted text-center py-8">{tCommon("states.loading")}</p>;
  }

  if (error) {
    return <p className="text-danger text-center py-8">{(error as Error).message}</p>;
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="font-display text-3xl">{t("empty.title")}</p>
        <p className="text-text-muted mt-3 max-w-md mx-auto">{t("empty.body")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <h3 className="font-display text-2xl">
          {t("sections.active")} ({active.length})
        </h3>
        {CATEGORY_ORDER.map((cat) => {
          const list = grouped.get(cat);
          if (!list || list.length === 0) return null;
          return (
            <div key={cat} className="space-y-3">
              <h4 className="text-text-muted text-sm uppercase tracking-wider font-medium">
                {t(`categories.${cat}`)} · {list.length}
              </h4>
              <div className="space-y-2">
                {list.map((item) => (
                  <ShoppingItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {completed.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 font-display text-2xl text-text-muted hover:text-text"
          >
            {showCompleted ? <CaretDownIcon size={24} /> : <CaretRightIcon size={24} />}
            {t("sections.completed")} ({completed.length})
          </button>
          {showCompleted && (
            <div className="space-y-2">
              {completed.map((item) => (
                <ShoppingItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
