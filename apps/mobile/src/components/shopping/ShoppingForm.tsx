import {
  SHOPPING_CATEGORIES,
  SHOPPING_UNITS,
  type ShoppingCategory,
  type ShoppingUnit,
} from "@home-panel/shared";
import { PlusIcon } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { useAddShoppingItem } from "../../lib/hooks/useShopping";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { ProductAutocomplete } from "./ProductAutocomplete";

/**
 * Quick-add bar for the shopping list.
 *
 * Layout (mobile-aware, tablet/desktop priority):
 *   - Phone (< md): two rows.
 *       Row 1: [product input flex-1] [+ button]
 *       Row 2: [qty ~4ch] [unit] [category]  ← stays full-width via flex
 *     This keeps the primary action (type a name, hit +) immediately
 *     reachable; quantity/unit/category remain visible without horizontal
 *     overflow on a 360-390px viewport.
 *   - Tablet/desktop (>= md): single row.
 *       [product input flex-1] [qty] [unit] [category] [+ button]
 *
 * The + button is disabled when the name field is empty. Enter in the input
 * submits the form.
 */
export function ShoppingForm() {
  const { t } = useT("shopping");
  const addMutation = useAddShoppingItem();

  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<ShoppingUnit>("pz");
  const [category, setCategory] = useState<ShoppingCategory>("other");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addMutation.mutate(
      { name: name.trim(), quantity, unit, category },
      {
        onSuccess: () => {
          setName("");
          setQuantity("1");
          setUnit("pz");
          setCategory("other");
        },
      },
    );
  }

  const unitOptions: DropdownOption[] = SHOPPING_UNITS.map((u) => ({
    value: u,
    label: t(`units.${u}`),
  }));

  const categoryOptions: DropdownOption[] = SHOPPING_CATEGORIES.map((c) => ({
    value: c,
    label: t(`categories.${c}`),
  }));

  const canSubmit = name.trim().length > 0 && !addMutation.isPending;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-md bg-surface/60 border border-border/70 p-3 md:p-4"
      aria-label={t("actions.add")}
    >
      {/* Two-row layout on mobile (product+add on row 1, qty/unit/category
       * on row 2). Collapses to a single row on tablet/desktop. */}
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-3">
        {/* Mobile row 1 / desktop left: product input + (mobile-only) add button. */}
        <div className="flex items-stretch gap-2 md:min-w-0 md:flex-1 md:gap-3">
          <div className="min-w-0 flex-1">
            <ProductAutocomplete
              value={name}
              onChange={setName}
              onProductSelect={(product) => {
                setName(product.name);
                setCategory(product.category);
                setUnit(product.defaultUnit);
              }}
              placeholder={t("addPlaceholder")}
            />
          </div>
          {/* Add button on mobile — keeps the primary action one tap away
           * from the input it submits. Hidden on tablet/desktop, where the
           * trailing button below takes over. */}
          <Button
            type="submit"
            size="md"
            variant="primary"
            disabled={!canSubmit}
            aria-label={t("actions.add")}
            className="!px-0 w-14 shrink-0 md:hidden"
          >
            <PlusIcon size={22} weight="bold" />
          </Button>
        </div>

        {/* Mobile row 2 / desktop middle: qty + unit + category. */}
        <div className="flex items-stretch gap-2 md:gap-3">
          <div className="w-[4.5rem] shrink-0">
            <Input
              aria-label={t("fields.quantity")}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              className="text-center"
            />
          </div>
          <div className="w-28 shrink-0">
            <Dropdown
              options={unitOptions}
              value={unit}
              onChange={(v) => setUnit(v as ShoppingUnit)}
            />
          </div>
          {/* Category stretches to fill the remainder on mobile, fixed
           * 9rem on tablet/desktop so the row stays compact. */}
          <div className="flex-1 min-w-0 md:w-36 md:flex-none">
            <Dropdown
              options={categoryOptions}
              value={category}
              onChange={(v) => setCategory(v as ShoppingCategory)}
            />
          </div>
        </div>

        {/* Add button on tablet/desktop — sits at the trailing edge of the
         * single-row layout. Hidden on mobile (replaced by the inline one
         * next to the product input). Wrapped in a div because Button's
         * default `inline-flex` overrides the `hidden` utility. */}
        <div className="hidden md:flex">
          <Button
            type="submit"
            size="md"
            variant="primary"
            disabled={!canSubmit}
            aria-label={t("actions.add")}
            className="!px-0 w-14"
          >
            <PlusIcon size={22} weight="bold" />
          </Button>
        </div>
      </div>
    </form>
  );
}
