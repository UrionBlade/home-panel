import type { Recipe } from "@home-panel/shared";
import { ClockIcon, CookingPotIcon, HeartIcon } from "@phosphor-icons/react";
import { useToggleFavorite } from "../../lib/hooks/useRecipes";
import { useT } from "../../lib/useT";

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
}

const DIFFICULTY_COLOR: Record<string, string> = {
  facile: "bg-surface-warm text-sage",
  medio: "bg-surface-warm text-ochre",
  difficile: "bg-surface-warm text-danger",
};

export function RecipeCard({ recipe, onClick }: RecipeCardProps) {
  const { t } = useT("recipes");
  const toggleFavorite = useToggleFavorite();
  const totalTime = (recipe.prepTimeMinutes ?? 0) + (recipe.cookTimeMinutes ?? 0);

  function handleFavoriteClick(e: React.MouseEvent) {
    e.stopPropagation();
    toggleFavorite.mutate(recipe.id);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full text-left rounded-xl overflow-hidden border border-border bg-surface-elevated shadow-md transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:shadow-lg active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* Image or placeholder */}
      <div className="relative aspect-[16/10] bg-surface overflow-hidden">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CookingPotIcon size={48} weight="duotone" className="text-text-subtle opacity-30" />
          </div>
        )}

        {/* Favorite button */}
        <button
          type="button"
          onClick={handleFavoriteClick}
          aria-label={recipe.favorite ? t("actions.unfavorite") : t("actions.favorite")}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface-elevated/80 backdrop-blur-sm flex items-center justify-center transition-colors hover:bg-surface-elevated"
        >
          <HeartIcon
            size={20}
            weight={recipe.favorite ? "fill" : "regular"}
            className={recipe.favorite ? "text-danger" : "text-text-muted"}
          />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2">
        <h3 className="font-display text-lg leading-tight line-clamp-2">{recipe.title}</h3>

        <div className="flex items-center gap-3 text-sm text-text-muted">
          {totalTime > 0 && (
            <span className="flex items-center gap-1">
              <ClockIcon size={14} weight="duotone" />
              {totalTime} min
            </span>
          )}
          {recipe.difficulty && (
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIFFICULTY_COLOR[recipe.difficulty] ?? ""}`}
            >
              {t(`difficulty.${recipe.difficulty}` as never)}
            </span>
          )}
          {recipe.servings && <span className="text-xs">{recipe.servings} porz.</span>}
        </div>

        {recipe.sourceName && (
          <span className="text-xs text-text-subtle truncate">{recipe.sourceName}</span>
        )}
      </div>
    </button>
  );
}
