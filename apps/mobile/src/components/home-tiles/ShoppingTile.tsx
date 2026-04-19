import { useNavigate } from "react-router-dom";
import { useShoppingItems } from "../../lib/hooks/useShopping";
import { useT } from "../../lib/useT";
import { GroceryBagArt } from "../illustrations/TileArt";
import { Tile } from "../ui/Tile";

export function ShoppingTile() {
  const { t } = useT("shopping");
  const navigate = useNavigate();
  const { data: items = [] } = useShoppingItems();
  const active = items.filter((i) => !i.completed);

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

      <div className="relative flex items-center gap-4 h-full z-10">
        {/* Testo a sinistra */}
        <div className="flex flex-col justify-between h-full min-w-0 flex-1">
          <span className="label-mono text-text-muted">{t("title")}</span>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-black tabular-nums leading-none text-text">
              {active.length}
            </span>
            <span className="text-sm font-medium text-text-muted truncate">
              {active.length === 0
                ? t("tile.calmState")
                : t("tile.count", { count: active.length })}
            </span>
          </div>
        </div>
        {/* Illustrazione a destra */}
        <GroceryBagArt size={110} className="shrink-0 pointer-events-none select-none anim-drift" />
      </div>
    </Tile>
  );
}
