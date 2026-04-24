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
  const [showPurchased, setShowPurchased] = useState(false);

  const { active, purchased } = useMemo(() => {
    return {
      active: items.filter((i) => !i.completed),
      purchased: items.filter((i) => i.completed),
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
      {/* Active items grouped by category */}
      {active.length > 0 && (
        <section>
          <h3 className="font-display text-2xl mb-4">
            {t("sections.active")} ({active.length})
          </h3>

          {CATEGORY_ORDER.map((cat) => {
            const list = grouped.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <div key={cat}>
                {/* Sticky category header */}
                <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm py-2 px-3 border-b border-border/40">
                  <span className="font-display text-sm text-text-muted">
                    {t(`categories.${cat}`)}
                    <span className="ml-1.5 text-text-subtle">· {list.length}</span>
                  </span>
                </div>

                <div>
                  {list.map((item) => (
                    <ShoppingItemCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Purchased items — collapsible section */}
      {purchased.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowPurchased((v) => !v)}
            className={
              "flex items-center gap-2 font-display text-xl text-text-muted hover:text-text " +
              "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
              "rounded-sm"
            }
            aria-expanded={showPurchased}
          >
            {showPurchased ? <CaretDownIcon size={20} /> : <CaretRightIcon size={20} />}
            {t("purchased.section")} ({purchased.length})
          </button>

          {showPurchased && (
            <div className="mt-2">
              {purchased.map((item) => (
                <ShoppingItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
