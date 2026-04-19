import type { GialloZafferanoSearchResult } from "@home-panel/shared";
import {
  CookingPotIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { RecipeArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { ImportFromUrlModal } from "../components/recipes/ImportFromUrlModal";
import { RecipeCard } from "../components/recipes/RecipeCard";
import { RecipeDetailModal } from "../components/recipes/RecipeDetailModal";
import { RecipeFormModal } from "../components/recipes/RecipeFormModal";
import { RemoteRecipeCard } from "../components/recipes/RemoteRecipeCard";
import { Button } from "../components/ui/Button";
import {
  useGialloZafferanoFeed,
  useRecipes,
  useSearchGialloZafferano,
} from "../lib/hooks/useRecipes";
import { useT } from "../lib/useT";

/**
 * Pagina Ricette – replica l'UX del vecchio home-panel:
 *
 *  - barra di ricerca in testa
 *  - if query is empty: show latest recipes from
 *    GialloZafferano** (RSS feed) + la sezione "Le mie ricette"
 *    se ne ho salvate
 *  - if query has a value: search in parallel across local recipes
 *    locali** (backend SQLite) e su **GialloZafferano** (scraping)
 *  - click su una card locale → `RecipeDetail` (edit/delete/favorite)
 *  - click su una card remota → `RemoteRecipeDetail` che scarica
 *    ingredienti/passi via JSON-LD e permette di salvare in locale
 *
 * Niente modal di "import" separato: la ricerca integrata sostituisce
 * quel flusso.
 */
export function RecipesPage() {
  const { t } = useT("recipes");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce 300ms to avoid hammering the backend and GialloZafferano.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const isSearching = debouncedSearch.length > 0;

  // Local recipes: always loaded. When searching, filtered server-side via the `q` param.
  const { data: localRecipes = [] } = useRecipes(isSearching ? { q: debouncedSearch } : undefined);

  // GialloZafferano feed: when the query is empty.
  const gzFeed = useGialloZafferanoFeed();
  // GialloZafferano search: when query length >= 3 (handled inside the hook).
  const gzSearch = useSearchGialloZafferano(debouncedSearch);

  const [selectedLocalId, setSelectedLocalId] = useState<string | null>(null);
  const [selectedRemote, setSelectedRemote] = useState<GialloZafferanoSearchResult | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editRecipeId, setEditRecipeId] = useState<string | null>(null);
  const [showImportUrl, setShowImportUrl] = useState(false);

  const gzList = useMemo<GialloZafferanoSearchResult[]>(() => {
    if (isSearching) return gzSearch.data ?? [];
    return gzFeed.data ?? [];
  }, [isSearching, gzSearch.data, gzFeed.data]);

  const gzLoading = isSearching
    ? gzSearch.isFetching && (gzSearch.data ?? []).length === 0
    : gzFeed.isLoading;
  const gzError = isSearching ? gzSearch.isError : gzFeed.isError;

  function handleAdd() {
    setEditRecipeId(null);
    setShowForm(true);
  }

  function handleEditLocal(id: string) {
    setEditRecipeId(id);
    setShowForm(true);
    setSelectedLocalId(null);
  }

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        artwork={<RecipeArt size={96} />}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<LinkIcon size={18} weight="duotone" />}
              onClick={() => setShowImportUrl(true)}
            >
              {t("actions.importUrl")}
            </Button>
            <Button size="sm" iconLeft={<PlusIcon size={18} weight="bold" />} onClick={handleAdd}>
              {t("actions.add")}
            </Button>
          </>
        }
      />

      <div className="relative">
        <MagnifyingGlassIcon
          size={20}
          weight="duotone"
          className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          type="text"
          placeholder={t("searchCombined")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full min-h-[52px] rounded-md bg-surface pl-12 pr-4 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle"
        />
      </div>

      {/* My recipes */}
      <section className="flex flex-col gap-4">
        <SectionHeader label={t("sections.mine")} count={localRecipes.length} />
        {localRecipes.length === 0 ? (
          <EmptyBlock
            icon={
              <CookingPotIcon size={36} weight="duotone" className="text-text-subtle opacity-60" />
            }
            message={isSearching ? t("sections.mineEmptySearch") : t("sections.mineEmpty")}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {localRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onClick={() => setSelectedLocalId(recipe.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* GialloZafferano (feed or search) */}
      <section className="flex flex-col gap-4">
        <SectionHeader
          label={isSearching ? t("sections.gzSearch") : t("sections.gzLatest")}
          count={gzList.length}
        />

        {gzLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-text-muted">
            <SpinnerIcon size={18} className="animate-spin" />
            {isSearching ? t("import.searchLoading") : t("sections.gzLoading")}
          </div>
        ) : gzError ? (
          <EmptyBlock
            icon={<CookingPotIcon size={36} weight="duotone" className="text-danger opacity-60" />}
            message={t("sections.gzError")}
          />
        ) : gzList.length === 0 ? (
          <EmptyBlock
            icon={
              <CookingPotIcon size={36} weight="duotone" className="text-text-subtle opacity-60" />
            }
            message={isSearching ? t("import.searchEmpty") : t("sections.gzEmpty")}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {gzList.map((card) => (
              <RemoteRecipeCard
                key={card.url}
                card={card}
                onClick={() => setSelectedRemote(card)}
              />
            ))}
          </div>
        )}
      </section>

      {selectedLocalId && (
        <RecipeDetailModal
          mode="local"
          recipeId={selectedLocalId}
          open
          onClose={() => setSelectedLocalId(null)}
          onEdit={handleEditLocal}
        />
      )}

      {selectedRemote && (
        <RecipeDetailModal
          mode="remote"
          card={selectedRemote}
          open
          onClose={() => setSelectedRemote(null)}
        />
      )}

      <RecipeFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditRecipeId(null);
        }}
        editRecipeId={editRecipeId}
      />

      <ImportFromUrlModal open={showImportUrl} onClose={() => setShowImportUrl(false)} />
    </PageContainer>
  );
}

/* ---------------------------------------------------------------- */

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="font-display text-xl text-text">{label}</h2>
      <span className="text-sm text-text-subtle">{count}</span>
    </div>
  );
}

function EmptyBlock({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center rounded-lg bg-surface-warm/50 border border-border/60">
      {icon}
      <p className="text-sm text-text-muted max-w-sm">{message}</p>
    </div>
  );
}
