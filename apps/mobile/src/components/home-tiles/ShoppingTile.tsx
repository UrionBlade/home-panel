import { useNavigate } from "react-router-dom";
import { useShoppingItems } from "../../lib/hooks/useShopping";
import { useT } from "../../lib/useT";
import { GroceryBagArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

const PREVIEW_COUNT = 3;

export function ShoppingTile() {
  const { t } = useT("shopping");
  const navigate = useNavigate();
  const { data: items = [] } = useShoppingItems();
  const active = items.filter((i) => !i.completed);
  const preview = active.slice(0, PREVIEW_COUNT);
  const remaining = active.length - preview.length;

  return (
    <Tile size="md" onClick={() => navigate("/shopping")} ariaLabel={t("title")}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 100%, var(--tile-ochre-b) 0%, transparent 55%)",
          opacity: 0.55,
        }}
      />

      <GroceryBagArt
        size={74}
        className="absolute top-2 right-2 pointer-events-none select-none opacity-90 anim-drift"
      />
      <div className="relative flex flex-col justify-between h-full z-10 pr-20 md:pr-24">
        <span className="label-mono text-accent" style={{ fontWeight: 900 }}>
          {t("title")}
          {active.length > 0 ? (
            <span className="ml-2 text-text-muted font-normal">· {active.length}</span>
          ) : null}
        </span>
        {active.length === 0 ? (
          <span className="font-display text-xl italic text-text-muted leading-tight">
            {t("tile.calmState")}
          </span>
        ) : (
          <ul className="flex flex-col gap-1 min-w-0">
            {preview.map((item) => (
              <li key={item.id} className="font-display text-2xl leading-tight text-text truncate">
                {item.name}
              </li>
            ))}
            {remaining > 0 ? (
              <li className="text-xs text-text-muted font-medium mt-0.5">
                {t("tile.andMore", { count: remaining })}
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </Tile>
  );
}
