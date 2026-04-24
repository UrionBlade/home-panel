import type { GialloZafferanoSearchResult } from "@home-panel/shared";
import {
  BookOpenIcon,
  ClockIcon,
  CookingPotIcon,
  GaugeIcon,
  StarIcon,
} from "@phosphor-icons/react";

interface RemoteRecipeCardProps {
  card: GialloZafferanoSearchResult;
  onClick: () => void;
}

/**
 * Card di ricetta remota (GialloZafferano), sorella di `RecipeCard`.
 * Mostra badge origine, rating/commenti, tempo totale e difficoltà quando
 * presenti. Click → apre `RemoteRecipeDetail` dal genitore.
 */
export function RemoteRecipeCard({ card, onClick }: RemoteRecipeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full text-left rounded-xl overflow-hidden border border-border bg-surface-elevated shadow-md transition-[box-shadow,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:shadow-lg active:scale-[0.995] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {/* Image or placeholder */}
      <div className="relative aspect-[4/3] bg-surface overflow-hidden">
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CookingPotIcon size={48} weight="duotone" className="text-text-subtle opacity-30" />
          </div>
        )}

        {/* Rating badge */}
        {card.rating !== null && (
          <span className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-elevated/90 backdrop-blur-sm text-text shadow-sm">
            <StarIcon size={12} weight="fill" className="text-accent" />
            {card.rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2">
        {card.category && (
          <span className="text-[10px] uppercase tracking-wide font-medium text-text-subtle">
            {card.category}
          </span>
        )}
        <h3 className="font-display text-lg leading-tight line-clamp-2">{card.title}</h3>

        {card.description && (
          <p className="text-xs text-text-muted line-clamp-2">{card.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted mt-0.5">
          {card.totalTimeMinutes !== null && (
            <span className="flex items-center gap-1">
              <ClockIcon size={13} weight="duotone" />
              {card.totalTimeMinutes} min
            </span>
          )}
          {card.difficulty && (
            <span className="flex items-center gap-1">
              <GaugeIcon size={13} weight="duotone" />
              {card.difficulty}
            </span>
          )}
          {card.comments !== null && (
            <span className="text-text-subtle">{card.comments} commenti</span>
          )}
        </div>

        {/* Discrete source attribution */}
        <div className="flex items-center gap-1 text-xs text-text-subtle mt-0.5">
          <BookOpenIcon size={12} weight="duotone" />
          <span>GialloZafferano</span>
        </div>
      </div>
    </button>
  );
}
