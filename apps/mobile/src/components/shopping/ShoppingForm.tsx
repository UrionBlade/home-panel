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
 * Visual intent: the list is the hero; the form is a compact row (not a
 * full-width slab). Name field dominates, the primary add action is a
 * proportional square icon button aligned with the input height, and the
 * qty/unit/category controls sit on a secondary row.
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
      className="rounded-md bg-surface/60 border border-border/70 p-3 md:p-4 flex flex-col gap-3"
      aria-label={t("actions.add")}
    >
      <div className="flex items-stretch gap-2 md:gap-3">
        <div className="flex-1 min-w-0">
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
        <Button
          type="submit"
          size="md"
          variant="primary"
          disabled={!canSubmit}
          aria-label={t("actions.add")}
          className="!px-0 w-14 shrink-0"
        >
          <PlusIcon size={22} weight="bold" />
        </Button>
      </div>

      <div className="grid grid-cols-[5rem_1fr_1fr] gap-2 md:gap-3">
        <Input
          aria-label={t("fields.quantity")}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="decimal"
        />
        <Dropdown options={unitOptions} value={unit} onChange={(v) => setUnit(v as ShoppingUnit)} />
        <Dropdown
          options={categoryOptions}
          value={category}
          onChange={(v) => setCategory(v as ShoppingCategory)}
        />
      </div>
    </form>
  );
}
