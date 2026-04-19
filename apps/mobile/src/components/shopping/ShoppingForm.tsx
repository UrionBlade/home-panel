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
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { ProductAutocomplete } from "./ProductAutocomplete";

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

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg bg-surface border border-border p-5 md:p-6 flex flex-col gap-4"
    >
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 items-end">
        <Input
          label={t("fields.quantity")}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="decimal"
        />
        <Select
          label={t("fields.unit")}
          value={unit}
          onChange={(e) => setUnit(e.target.value as ShoppingUnit)}
          options={SHOPPING_UNITS.map((u) => ({
            value: u,
            label: t(`units.${u}`),
          }))}
        />
        <div className="col-span-2 md:col-span-1">
          <Select
            label={t("fields.category")}
            value={category}
            onChange={(e) => setCategory(e.target.value as ShoppingCategory)}
            options={SHOPPING_CATEGORIES.map((c) => ({
              value: c,
              label: t(`categories.${c}`),
            }))}
          />
        </div>
      </div>

      <Button
        type="submit"
        isLoading={addMutation.isPending}
        iconLeft={<PlusIcon size={20} weight="bold" />}
      >
        {t("actions.add")}
      </Button>
    </form>
  );
}
