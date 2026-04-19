import type { Product } from "@home-panel/shared";
import { useEffect, useState } from "react";
import { useShoppingProducts } from "../../lib/hooks/useShopping";
import { Input } from "../ui/Input";

interface ProductAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onProductSelect: (product: Product) => void;
  placeholder?: string;
}

export function ProductAutocomplete({
  value,
  onChange,
  onProductSelect,
  placeholder,
}: ProductAutocompleteProps) {
  const [debounced, setDebounced] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  const { data: products = [] } = useShoppingProducts(debounced);

  const filtered = products.slice(0, 6);

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder={placeholder}
      />
      {showSuggestions && filtered.length > 0 && (
        <ul className="absolute z-10 w-full mt-2 max-h-72 overflow-auto rounded-md bg-surface-elevated border border-border shadow-lg">
          {filtered.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onProductSelect(product);
                  setShowSuggestions(false);
                }}
                className="w-full text-left px-5 py-3 hover:bg-surface focus:bg-surface focus:outline-none flex justify-between"
              >
                <span className="font-medium text-text">{product.name}</span>
                <span className="text-text-subtle text-sm">{product.defaultUnit}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
