import type { CreateRecipeInput, RecipeDifficulty, RecipeStep } from "@home-panel/shared";
import { MinusCircleIcon, PlusCircleIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useCreateRecipe, useRecipe, useUpdateRecipe } from "../../lib/hooks/useRecipes";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface RecipeFormModalProps {
  open: boolean;
  onClose: () => void;
  editRecipeId?: string | null;
  /** Pre-fill from import */
  importData?: Partial<CreateRecipeInput>;
}

const TAG_OPTIONS = ["primo", "secondo", "contorno", "dolce", "colazione", "snack"];

const DIFFICULTY_OPTIONS = [
  { value: "", label: "-" },
  { value: "facile", label: "Facile" },
  { value: "medio", label: "Medio" },
  { value: "difficile", label: "Difficile" },
];

export function RecipeFormModal({ open, onClose, editRecipeId, importData }: RecipeFormModalProps) {
  const { t } = useT("recipes");
  const { t: tCommon } = useT("common");
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const { data: existingRecipe } = useRecipe(editRecipeId ?? null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  // The form only edits step text; associated images are
  // preserved in a parallel array to avoid losing them during edit.
  const [stepTexts, setStepTexts] = useState<string[]>([""]);
  const [stepImages, setStepImages] = useState<string[][]>([[]]);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setSourceUrl("");
    setSourceName("");
    setImageUrl("");
    setPrepTime("");
    setCookTime("");
    setServings("");
    setDifficulty("");
    setIngredients([""]);
    setStepTexts([""]);
    setStepImages([[]]);
    setTags([]);
    setNotes("");
  }, []);

  // Pre-fill when editing or importing
  useEffect(() => {
    if (editRecipeId && existingRecipe) {
      setTitle(existingRecipe.title);
      setDescription(existingRecipe.description ?? "");
      setSourceUrl(existingRecipe.sourceUrl ?? "");
      setSourceName(existingRecipe.sourceName ?? "");
      setImageUrl(existingRecipe.imageUrl ?? "");
      setPrepTime(
        existingRecipe.prepTimeMinutes != null ? String(existingRecipe.prepTimeMinutes) : "",
      );
      setCookTime(
        existingRecipe.cookTimeMinutes != null ? String(existingRecipe.cookTimeMinutes) : "",
      );
      setServings(existingRecipe.servings != null ? String(existingRecipe.servings) : "");
      setDifficulty(existingRecipe.difficulty ?? "");
      setIngredients(existingRecipe.ingredients.length > 0 ? existingRecipe.ingredients : [""]);
      setStepTexts(
        existingRecipe.steps.length > 0 ? existingRecipe.steps.map((s) => s.text) : [""],
      );
      setStepImages(
        existingRecipe.steps.length > 0 ? existingRecipe.steps.map((s) => s.images) : [[]],
      );
      setTags(existingRecipe.tags);
      setNotes(existingRecipe.notes ?? "");
    } else if (importData && !editRecipeId) {
      setTitle(importData.title ?? "");
      setDescription(importData.description ?? "");
      setSourceUrl(importData.sourceUrl ?? "");
      setSourceName(importData.sourceName ?? "");
      setImageUrl(importData.imageUrl ?? "");
      setPrepTime(importData.prepTimeMinutes != null ? String(importData.prepTimeMinutes) : "");
      setCookTime(importData.cookTimeMinutes != null ? String(importData.cookTimeMinutes) : "");
      setServings(importData.servings != null ? String(importData.servings) : "");
      setDifficulty(importData.difficulty ?? "");
      setIngredients(
        importData.ingredients && importData.ingredients.length > 0 ? importData.ingredients : [""],
      );
      {
        const incoming = importData.steps ?? [];
        setStepTexts(
          incoming.length > 0 ? incoming.map((s) => (typeof s === "string" ? s : s.text)) : [""],
        );
        setStepImages(
          incoming.length > 0
            ? incoming.map((s) => (typeof s === "string" ? [] : (s.images ?? [])))
            : [[]],
        );
      }
      setTags(importData.tags ?? []);
      setNotes(importData.notes ?? "");
    } else if (!editRecipeId && !importData) {
      resetForm();
    }
  }, [editRecipeId, existingRecipe, importData, resetForm]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const input: CreateRecipeInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      sourceName: sourceName.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      prepTimeMinutes: prepTime ? Number(prepTime) : undefined,
      cookTimeMinutes: cookTime ? Number(cookTime) : undefined,
      servings: servings ? Number(servings) : undefined,
      difficulty: (difficulty as RecipeDifficulty) || undefined,
      ingredients: ingredients.filter((i) => i.trim()),
      steps: stepTexts
        .map((text, i): RecipeStep | null => {
          const t = text.trim();
          if (!t) return null;
          return { text: t, images: stepImages[i] ?? [] };
        })
        .filter((s): s is RecipeStep => s !== null),
      tags,
      notes: notes.trim() || undefined,
    };

    if (editRecipeId) {
      updateRecipe.mutate(
        { id: editRecipeId, input },
        {
          onSuccess: () => {
            resetForm();
            onClose();
          },
        },
      );
    } else {
      createRecipe.mutate(input, {
        onSuccess: () => {
          resetForm();
          onClose();
        },
      });
    }
  }

  function addIngredient() {
    setIngredients([...ingredients, ""]);
  }

  function removeIngredient(index: number) {
    setIngredients(ingredients.filter((_, i) => i !== index));
  }

  function updateIngredient(index: number, value: string) {
    setIngredients(ingredients.map((v, i) => (i === index ? value : v)));
  }

  function addStep() {
    setStepTexts([...stepTexts, ""]);
    setStepImages([...stepImages, []]);
  }

  function removeStep(index: number) {
    setStepTexts(stepTexts.filter((_, i) => i !== index));
    setStepImages(stepImages.filter((_, i) => i !== index));
  }

  function updateStep(index: number, value: string) {
    setStepTexts(stepTexts.map((v, i) => (i === index ? value : v)));
  }

  function toggleTag(tag: string) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const isLoading = createRecipe.isPending || updateRecipe.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editRecipeId ? t("actions.edit") : t("actions.add")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tCommon("actions.cancel")}
          </Button>
          <Button size="sm" onClick={handleSubmit} isLoading={isLoading} disabled={!title.trim()}>
            {t("actions.save")}
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1"
      >
        <Input
          label={t("fields.title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Input
          label={t("fields.description")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t("fields.sourceUrl")}
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            type="url"
          />
          <Input
            label={t("fields.imageUrl")}
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            type="url"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label={t("fields.prepTime")}
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            type="number"
            min="0"
          />
          <Input
            label={t("fields.cookTime")}
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            type="number"
            min="0"
          />
          <Input
            label={t("fields.servings")}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            type="number"
            min="1"
          />
        </div>

        <Dropdown
          label={t("fields.difficulty")}
          value={difficulty}
          onChange={(v) => setDifficulty(v)}
          options={DIFFICULTY_OPTIONS}
        />

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("fields.tags")}</span>
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  tags.includes(tag)
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-surface text-text-muted border-border"
                }`}
              >
                {t(`filters.${tag}` as never)}
              </button>
            ))}
          </div>
        </div>

        {/* Ingredients */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("fields.ingredients")}</span>
          {ingredients.map((ing, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={ing}
                onChange={(e) => updateIngredient(i, e.target.value)}
                className="flex-1 min-h-[40px] rounded-md bg-surface px-3 text-sm text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                placeholder={`Ingrediente ${i + 1}`}
              />
              {ingredients.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeIngredient(i)}
                  className="text-text-subtle hover:text-danger transition-colors"
                >
                  <MinusCircleIcon size={20} weight="duotone" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addIngredient}
            className="flex items-center gap-1 text-sm text-accent hover:underline self-start"
          >
            <PlusCircleIcon size={18} weight="duotone" />
            {t("addIngredient")}
          </button>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("fields.steps")}</span>
          {stepTexts.map((stepText, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="shrink-0 w-6 h-6 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium mt-2">
                {i + 1}
              </span>
              <textarea
                value={stepText}
                onChange={(e) => updateStep(i, e.target.value)}
                className="flex-1 min-h-[60px] rounded-md bg-surface px-3 py-2 text-sm text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent resize-y"
                placeholder={`Passaggio ${i + 1}`}
              />
              {stepTexts.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="text-text-subtle hover:text-danger transition-colors mt-2"
                >
                  <MinusCircleIcon size={20} weight="duotone" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addStep}
            className="flex items-center gap-1 text-sm text-accent hover:underline self-start"
          >
            <PlusCircleIcon size={18} weight="duotone" />
            {t("addStep")}
          </button>
        </div>

        {/* Notes */}
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("fields.notes")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[80px] rounded-md bg-surface px-3 py-2 text-sm text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent resize-y"
            placeholder={t("placeholders.notes")}
          />
        </div>
      </form>
    </Modal>
  );
}
