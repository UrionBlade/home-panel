import type { CreateRecipeInput } from "@home-panel/shared";
import {
  ArrowLeftIcon,
  BookmarkSimpleIcon,
  CheckCircleIcon,
  ClockIcon,
  CookingPotIcon,
  LinkIcon,
  SpinnerIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useCreateRecipe, useImportRecipeUrl } from "../../lib/hooks/useRecipes";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface ImportFromUrlModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal "Importa da URL" — generico per qualsiasi sito.
 *
 * Usa `POST /recipes/import-url` che parsifica il JSON-LD schema.org/Recipe
 * presente sulla maggior parte dei siti di ricette moderni (GialloZafferano,
 * BBC Good Food, Cookist, AllRecipes, NYTCooking, etc.).
 *
 * Flow a due step:
 *  1. Input URL → "Analizza" → mostra anteprima
 *  2. Anteprima → "Salva" → crea ricetta locale e chiude
 */
export function ImportFromUrlModal({ open, onClose }: ImportFromUrlModalProps) {
  const { t } = useT("recipes");
  const { t: tCommon } = useT("common");
  const importUrl = useImportRecipeUrl();
  const createRecipe = useCreateRecipe();
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);

  const preview = importUrl.data;
  const hasPreview = !!preview;

  function resetAll() {
    setUrl("");
    setSaved(false);
    importUrl.reset();
    createRecipe.reset();
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  function handleAnalyze() {
    const trimmed = url.trim();
    if (!trimmed) return;
    importUrl.mutate(trimmed);
  }

  function handleBack() {
    importUrl.reset();
    createRecipe.reset();
    setSaved(false);
  }

  function handleSave() {
    if (!preview?.title) return;
    const input: CreateRecipeInput = {
      title: preview.title,
      description: preview.description,
      sourceUrl: url.trim(),
      sourceName: preview.sourceName,
      imageUrl: preview.imageUrl,
      prepTimeMinutes: preview.prepTimeMinutes,
      cookTimeMinutes: preview.cookTimeMinutes,
      servings: preview.servings,
      ingredients: preview.ingredients,
      steps: preview.steps,
    };
    createRecipe.mutate(input, {
      onSuccess: () => {
        setSaved(true);
        // Auto-close after a moment for visual feedback
        setTimeout(() => handleClose(), 900);
      },
    });
  }

  const canAnalyze = url.trim().length > 0 && !importUrl.isPending;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("importUrl.title")}
      footer={
        hasPreview ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<ArrowLeftIcon size={16} weight="bold" />}
              onClick={handleBack}
            >
              {t("importUrl.back")}
            </Button>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {tCommon("actions.cancel")}
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
                disabled={!preview?.title}
                iconLeft={<BookmarkSimpleIcon size={18} weight="duotone" />}
              >
                {t("importUrl.save")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {tCommon("actions.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleAnalyze}
              isLoading={importUrl.isPending}
              disabled={!canAnalyze}
              iconLeft={<LinkIcon size={18} weight="duotone" />}
            >
              {t("importUrl.analyze")}
            </Button>
          </>
        )
      }
    >
      {!hasPreview ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-muted">{t("importUrl.body")}</p>
          <input
            type="url"
            placeholder={t("importUrl.placeholder")}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAnalyze) handleAnalyze();
            }}
            className="w-full min-h-[52px] rounded-md bg-surface px-4 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle"
          />
          {importUrl.isPending && (
            <div className="flex items-center gap-2 text-text-muted text-sm">
              <SpinnerIcon size={16} className="animate-spin" />
              {t("importUrl.analyzing")}
            </div>
          )}
          {importUrl.isError && <p className="text-sm text-danger">{t("importUrl.error")}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {preview.imageUrl && (
            <img
              src={preview.imageUrl}
              alt={preview.title ?? ""}
              className="w-full aspect-[16/9] object-cover rounded-md"
            />
          )}

          {preview.title && (
            <div>
              {preview.sourceName && (
                <div className="text-xs uppercase tracking-wider font-medium text-text-subtle mb-1">
                  {preview.sourceName}
                </div>
              )}
              <h3 className="font-display text-2xl leading-tight">{preview.title}</h3>
            </div>
          )}

          {preview.description && (
            <p className="text-sm text-text-muted line-clamp-4 leading-relaxed">
              {preview.description}
            </p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2 text-xs text-text-muted">
            {preview.prepTimeMinutes != null && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-border">
                <ClockIcon size={13} weight="duotone" />
                Prep {preview.prepTimeMinutes} min
              </span>
            )}
            {preview.cookTimeMinutes != null && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-border">
                <CookingPotIcon size={13} weight="duotone" />
                Cottura {preview.cookTimeMinutes} min
              </span>
            )}
            {preview.servings != null && (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface border border-border">
                <UsersIcon size={13} weight="duotone" />
                {preview.servings} porz.
              </span>
            )}
            {preview.ingredients && preview.ingredients.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-surface border border-border">
                {preview.ingredients.length} ingredienti
              </span>
            )}
            {preview.steps && preview.steps.length > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-surface border border-border">
                {preview.steps.length} passaggi
              </span>
            )}
          </div>

          {createRecipe.isError && (
            <div className="px-3 py-2 rounded-md bg-surface border border-danger/40 text-sm text-danger">
              {t("remoteDetail.saveError")}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
