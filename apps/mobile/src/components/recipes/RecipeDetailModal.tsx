import type {
  CreateRecipeInput,
  GialloZafferanoRecipeDetails,
  GialloZafferanoSearchResult,
  RecipeStep,
} from "@home-panel/shared";
import {
  ArrowSquareOutIcon,
  BookmarkSimpleIcon,
  CheckCircleIcon,
  ClockIcon,
  CookingPotIcon,
  HeartIcon,
  LightbulbIcon,
  ListBulletsIcon,
  NotePencilIcon,
  PackageIcon,
  PencilSimpleIcon,
  SpinnerIcon,
  TrashIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  useCreateRecipe,
  useDeleteRecipe,
  useGialloZafferanoDetails,
  useRecipe,
  useToggleFavorite,
} from "../../lib/hooks/useRecipes";
import { DURATION_DEFAULT, DURATION_MICRO, EASE_OUT_QUART } from "../../lib/motion/tokens";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";

/* ---------------------------------------------------------------- */
/*  Props                                                             */
/* ---------------------------------------------------------------- */

interface LocalProps {
  mode: "local";
  recipeId: string;
  onEdit: (id: string) => void;
}
interface RemoteProps {
  mode: "remote";
  card: GialloZafferanoSearchResult;
}

type RecipeDetailModalProps = {
  open: boolean;
  onClose: () => void;
} & (LocalProps | RemoteProps);

/* ---------------------------------------------------------------- */
/*  Main component                                                    */
/* ---------------------------------------------------------------- */

/**
 * Singola modale per il dettaglio di una ricetta, sia locale che remota.
 *
 * Layout identico:
 *  - Hero image con titolo sovrapposto + gradient
 *  - Contenuto scrollabile: descrizione, badge meta, ingredienti,
 *    passi con immagini, box colorati (Consiglio/Conservazione/Note)
 *  - Footer con azioni (diverse per locale vs remoto)
 */
export function RecipeDetailModal(props: RecipeDetailModalProps) {
  const { open, onClose } = props;

  if (props.mode === "local") {
    return (
      <LocalRecipeDetail
        recipeId={props.recipeId}
        onEdit={props.onEdit}
        open={open}
        onClose={onClose}
      />
    );
  }

  return <RemoteRecipeDetail card={props.card} open={open} onClose={onClose} />;
}

/* ---------------------------------------------------------------- */
/*  Local mode                                                        */
/* ---------------------------------------------------------------- */

function LocalRecipeDetail({
  recipeId,
  onEdit,
  open,
  onClose,
}: {
  recipeId: string;
  onEdit: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useT("recipes");
  const { t: tCommon } = useT("common");
  const { data: recipe } = useRecipe(recipeId);
  const toggleFavorite = useToggleFavorite();
  const deleteRecipe = useDeleteRecipe();

  if (!recipe) return null;

  function handleDelete() {
    if (!confirm(t("confirm.delete"))) return;
    deleteRecipe.mutate(recipeId, { onSuccess: onClose });
  }

  return (
    <DetailShell open={open} onClose={onClose} title={recipe.title}>
      <HeroImage imageUrl={recipe.imageUrl} title={recipe.title} sourceName={recipe.sourceName} />

      <div className="p-7 flex flex-col gap-6 overflow-y-auto">
        {/* Title + favorite */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            {recipe.description && (
              <p className="text-text-muted leading-relaxed whitespace-pre-line">
                {recipe.description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleFavorite.mutate(recipeId)}
            aria-label={recipe.favorite ? t("actions.unfavorite") : t("actions.favorite")}
            className="shrink-0 p-2 rounded-md hover:bg-surface transition-colors"
          >
            <HeartIcon
              size={24}
              weight={recipe.favorite ? "fill" : "regular"}
              className={recipe.favorite ? "text-danger" : "text-text-muted"}
            />
          </button>
        </div>

        <MetaBadges
          prepTime={recipe.prepTimeMinutes}
          cookTime={recipe.cookTimeMinutes}
          servings={recipe.servings}
          difficulty={recipe.difficulty}
        />

        <IngredientsSection ingredients={recipe.ingredients} />
        <StepsSection steps={recipe.steps} />

        <InfoBlocks tips={recipe.tips} conservation={recipe.conservation} notes={recipe.notes} />

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full text-xs font-medium bg-surface border border-border text-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <footer className="flex flex-wrap gap-3 pt-4 border-t border-border shrink-0">
          {recipe.sourceUrl && (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<ArrowSquareOutIcon size={18} weight="duotone" />}
              onClick={() => {
                if (recipe.sourceUrl) window.open(recipe.sourceUrl, "_blank");
              }}
            >
              {t("actions.openSource")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<PencilSimpleIcon size={18} weight="duotone" />}
            onClick={() => onEdit(recipeId)}
          >
            {t("actions.edit")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<TrashIcon size={18} weight="duotone" />}
            onClick={handleDelete}
          >
            {t("actions.delete")}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tCommon("actions.close")}
          </Button>
        </footer>
      </div>
    </DetailShell>
  );
}

/* ---------------------------------------------------------------- */
/*  Remote mode                                                       */
/* ---------------------------------------------------------------- */

function RemoteRecipeDetail({
  card,
  open,
  onClose,
}: {
  card: GialloZafferanoSearchResult;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useT("recipes");
  const { t: tCommon } = useT("common");
  const detailsQuery = useGialloZafferanoDetails(open ? card.url : null);
  const createRecipe = useCreateRecipe();
  const [saved, setSaved] = useState(false);

  const details: GialloZafferanoRecipeDetails | undefined = detailsQuery.data;

  const title = details?.title ?? card.title;
  const description = details?.description ?? card.description ?? undefined;
  const imageUrl = details?.imageUrl ?? card.imageUrl ?? undefined;
  const prepTime = details?.prepTimeMinutes ?? null;
  const cookTime = details?.cookTimeMinutes ?? null;
  const totalTime = details?.totalTimeMinutes ?? card.totalTimeMinutes ?? null;
  const servings = details?.servings ?? null;
  const difficulty = details?.difficulty ?? card.difficulty ?? null;

  const ingredients = details?.ingredients ?? [];
  const steps = details?.steps ?? [];

  function handleSave() {
    const ingredientsFlat = ingredients.map((i) =>
      i.quantity ? `${i.quantity} ${i.name}`.trim() : i.name,
    );
    const stepsRich = steps.map((s) => ({ text: s.text, images: s.images }));
    const input: CreateRecipeInput = {
      title,
      description,
      sourceUrl: card.url,
      sourceName: "GialloZafferano",
      imageUrl,
      prepTimeMinutes: prepTime ?? undefined,
      cookTimeMinutes: cookTime ?? undefined,
      servings: servings ?? undefined,
      ingredients: ingredientsFlat,
      steps: stepsRich,
      tips: details?.tips ?? undefined,
      conservation: details?.conservation ?? undefined,
      notes: details?.notes ?? undefined,
    };
    createRecipe.mutate(input, { onSuccess: () => setSaved(true) });
  }

  function handleClose() {
    setSaved(false);
    onClose();
  }

  // Map GZ ingredients to flat strings for the shared section
  const ingredientsFlat = ingredients.map((i) =>
    i.quantity ? `${i.quantity} ${i.name}`.trim() : i.name,
  );
  // Map GZ steps to RecipeStep shape
  const stepsAsRecipeStep: RecipeStep[] = steps.map((s) => ({
    text: s.text,
    images: s.images,
  }));

  return (
    <DetailShell open={open} onClose={handleClose} title={title}>
      <HeroImage
        imageUrl={imageUrl ?? null}
        title={title}
        sourceName="GialloZafferano"
        category={details?.category ?? card.category}
      />

      <div className="p-7 flex flex-col gap-6 overflow-y-auto">
        {description && (
          <p className="text-text-muted leading-relaxed whitespace-pre-line">{description}</p>
        )}

        <MetaBadges
          prepTime={prepTime}
          cookTime={cookTime}
          totalTime={totalTime}
          servings={servings}
          difficulty={difficulty}
        />

        {detailsQuery.isLoading && ingredients.length === 0 && steps.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-10 text-text-muted">
            <SpinnerIcon size={20} className="animate-spin" />
            {t("import.fetchingDetails")}
          </div>
        )}

        {detailsQuery.isError && (
          <div className="px-4 py-3 rounded-md bg-surface border border-danger/40 text-sm text-danger">
            {t("remoteDetail.fetchError")}
          </div>
        )}

        <IngredientsSection ingredients={ingredientsFlat} />
        <StepsSection steps={stepsAsRecipeStep} />

        <InfoBlocks
          tips={details?.tips}
          conservation={details?.conservation}
          notes={details?.notes}
        />

        {createRecipe.isError && (
          <div className="px-4 py-3 rounded-md bg-surface border border-danger/40 text-sm text-danger">
            {t("remoteDetail.saveError")}
          </div>
        )}

        <footer className="flex flex-wrap gap-3 pt-4 border-t border-border shrink-0">
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<ArrowSquareOutIcon size={18} weight="duotone" />}
            onClick={() => window.open(card.url, "_blank")}
          >
            {t("actions.openSource")}
          </Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleClose}>
            {tCommon("actions.close")}
          </Button>
          {saved ? (
            <Button size="sm" disabled iconLeft={<CheckCircleIcon size={18} weight="fill" />}>
              {t("remoteDetail.saved")}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleSave}
              isLoading={createRecipe.isPending}
              disabled={!title}
              iconLeft={<BookmarkSimpleIcon size={18} weight="duotone" />}
            >
              {t("remoteDetail.save")}
            </Button>
          )}
        </footer>
      </div>
    </DetailShell>
  );
}

/* ================================================================ */
/*  Shared sub-components                                             */
/* ================================================================ */

/** Animated modal shell — identical for local + remote. */
function DetailShell({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION_MICRO }}
            className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{
              duration: DURATION_DEFAULT,
              ease: [...EASE_OUT_QUART],
            }}
            role="dialog"
            aria-modal
            aria-label={title}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-4xl max-h-[calc(100vh-3rem)] flex flex-col rounded-xl bg-surface-elevated shadow-xl border border-border overflow-hidden">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/** Hero image with title overlaid on gradient. */
function HeroImage({
  imageUrl,
  title,
  sourceName,
  category,
}: {
  imageUrl: string | null;
  title: string;
  sourceName?: string | null;
  category?: string | null;
}) {
  const sourceLabel = [sourceName, category].filter(Boolean).join(" · ");

  if (imageUrl) {
    return (
      <div className="relative aspect-[21/9] overflow-hidden shrink-0">
        <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          {sourceLabel && (
            <div className="text-xs uppercase tracking-wider font-medium text-white/80 mb-1">
              {sourceLabel}
            </div>
          )}
          <h2 className="font-display text-3xl md:text-4xl text-white drop-shadow-md">{title}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="p-7 pb-0 shrink-0">
      {sourceLabel && (
        <div className="text-xs uppercase tracking-wider font-medium text-text-subtle mb-1">
          {sourceLabel}
        </div>
      )}
      <h2 className="font-display text-3xl">{title}</h2>
    </div>
  );
}

function MetaBadges({
  prepTime,
  cookTime,
  totalTime,
  servings,
  difficulty,
}: {
  prepTime?: number | null;
  cookTime?: number | null;
  totalTime?: number | null;
  servings?: number | null;
  difficulty?: string | null;
}) {
  const { t } = useT("recipes");
  const hasSomething =
    prepTime != null ||
    cookTime != null ||
    totalTime != null ||
    servings != null ||
    difficulty != null;
  if (!hasSomething) return null;

  return (
    <div className="flex flex-wrap gap-3 text-sm text-text-muted">
      {prepTime != null && (
        <Badge
          icon={<ClockIcon size={16} weight="duotone" />}
          label={`${t("fields.prepTime")}: ${prepTime} min`}
        />
      )}
      {cookTime != null && (
        <Badge
          icon={<CookingPotIcon size={16} weight="duotone" />}
          label={`${t("fields.cookTime")}: ${cookTime} min`}
        />
      )}
      {totalTime != null && prepTime == null && cookTime == null && (
        <Badge icon={<ClockIcon size={16} weight="duotone" />} label={`${totalTime} min`} />
      )}
      {servings != null && (
        <Badge
          icon={<UsersIcon size={16} weight="duotone" />}
          label={`${servings} ${String(t("fields.servings")).toLowerCase()}`}
        />
      )}
      {difficulty && (
        <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-surface-warm text-accent">
          {difficulty}
        </span>
      )}
    </div>
  );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border">
      {icon}
      {label}
    </span>
  );
}

function IngredientsSection({ ingredients }: { ingredients: string[] }) {
  const { t } = useT("recipes");
  if (ingredients.length === 0) return null;

  return (
    <section>
      <h3 className="font-display text-xl mb-3 flex items-center gap-2">
        <ListBulletsIcon size={22} weight="duotone" className="text-accent" />
        {t("fields.ingredients")}
      </h3>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {ingredients.map((ing, i) => (
          <li key={i} className="flex items-start gap-2 text-text-muted">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            {ing}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepsSection({ steps }: { steps: RecipeStep[] }) {
  const { t } = useT("recipes");
  if (steps.length === 0) return null;

  return (
    <section>
      <h3 className="font-display text-xl mb-4 flex items-center gap-2">
        <CookingPotIcon size={22} weight="duotone" className="text-accent" />
        {t("fields.steps")}
      </h3>
      <ol className="flex flex-col gap-6">
        {steps.map((step, i) => (
          <StepItem key={i} index={i + 1} step={step} />
        ))}
      </ol>
    </section>
  );
}

function StepItem({ index, step }: { index: number; step: RecipeStep }) {
  const stripImages = step.images.filter((img) => /_strip_/.test(img));
  const singleImages = step.images.filter((img) => !/_strip_/.test(img));

  return (
    <li className="flex flex-col gap-3">
      <div className="flex gap-3">
        <span className="shrink-0 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-sm font-bold">
          {index}
        </span>
        <p className="text-text pt-1 leading-relaxed flex-1">{step.text}</p>
      </div>

      {(stripImages.length > 0 || singleImages.length > 0) && (
        <div className="ml-11 flex flex-col gap-2">
          {stripImages.map((img, idx) => (
            <img
              key={`strip-${idx}`}
              src={img}
              alt={`Step ${index}`}
              loading="lazy"
              className="w-full rounded-md border border-border shadow-sm"
            />
          ))}
          {singleImages.length > 0 && (
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${singleImages.length}, minmax(0, 1fr))`,
              }}
            >
              {singleImages.map((img, idx) => (
                <img
                  key={`single-${idx}`}
                  src={img}
                  alt={`Step ${index} – ${idx + 1}`}
                  loading="lazy"
                  className="w-full aspect-[4/3] object-cover rounded-md border border-border shadow-sm"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function InfoBlocks({
  tips,
  conservation,
  notes,
}: {
  tips?: string | null;
  conservation?: string | null;
  notes?: string | null;
}) {
  const { t } = useT("recipes");
  return (
    <>
      {tips && (
        <InfoBlock
          icon={<LightbulbIcon size={22} weight="duotone" className="text-amber-500" />}
          title={t("remoteDetail.sections.tips")}
          body={tips}
          tone="amber"
        />
      )}
      {conservation && (
        <InfoBlock
          icon={<PackageIcon size={22} weight="duotone" className="text-emerald-500" />}
          title={t("remoteDetail.sections.conservation")}
          body={conservation}
          tone="emerald"
        />
      )}
      {notes && (
        <InfoBlock
          icon={<NotePencilIcon size={22} weight="duotone" className="text-sky-500" />}
          title={t("fields.notes")}
          body={notes}
          tone="sky"
        />
      )}
    </>
  );
}

function InfoBlock({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: "amber" | "sky" | "emerald";
}) {
  const toneClass = {
    amber: "border-l-warning bg-surface-warm",
    sky: "border-l-accent/50 bg-surface",
    emerald: "border-l-success bg-surface-warm",
  }[tone];
  return (
    <section className={`p-5 rounded-md border border-border border-l-4 ${toneClass}`}>
      <h4 className="font-display text-lg mb-2 flex items-center gap-2">
        {icon}
        {title}
      </h4>
      <p className="text-text-muted leading-relaxed whitespace-pre-line">{body}</p>
    </section>
  );
}
