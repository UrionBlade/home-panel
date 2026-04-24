/**
 * Create / edit a routine. Hosted at `/routines/new` and `/routines/:id`.
 *
 * Fetches the routine (when editing) and device catalogs (lights, rooms, AC,
 * cameras) the step editor uses for its dropdowns. Form state is local —
 * only flushed to the backend on submit — so typos don't ping the API, and
 * the "Run now" button always reflects the saved routine, never a dirty
 * draft.
 */

import type { Routine, RoutineCreateInput, RoutineStep, RoutineTrigger } from "@home-panel/shared";
import {
  BedIcon,
  CheckIcon,
  CloudSunIcon,
  CoffeeIcon,
  CookingPotIcon,
  CouchIcon,
  FilmSlateIcon,
  FloppyDiskIcon,
  HouseLineIcon,
  LightningIcon,
  MoonIcon,
  MusicNotesIcon,
  type Icon as PhosphorIcon,
  PlayIcon,
  PlusIcon,
  ShieldCheckIcon,
  SparkleIcon,
  SpinnerIcon,
  SunIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { type EditorDeviceCatalog, StepEditor } from "../components/routines/StepEditor";
import { TriggerEditor } from "../components/routines/TriggerEditor";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Input } from "../components/ui/Input";
import { useAcDevices } from "../lib/hooks/useAc";
import { useCameras } from "../lib/hooks/useBlink";
import { useLights } from "../lib/hooks/useLights";
import { useRooms } from "../lib/hooks/useRooms";
import {
  useCreateRoutine,
  useDeleteRoutine,
  useRoutines,
  useRunRoutine,
  useUpdateRoutine,
} from "../lib/hooks/useRoutines";
import { useT } from "../lib/useT";

function defaultRoutine(): Draft {
  return {
    name: "",
    icon: null,
    color: null,
    enabled: true,
    trigger: { type: "manual" },
    voiceResponse: "",
    steps: [],
  };
}

interface Draft {
  name: string;
  icon: string | null;
  color: string | null;
  enabled: boolean;
  trigger: RoutineTrigger;
  voiceResponse: string;
  steps: RoutineStep[];
}

function routineToDraft(routine: Routine): Draft {
  return {
    name: routine.name,
    icon: routine.icon,
    color: routine.color,
    enabled: routine.enabled,
    trigger: routine.trigger,
    voiceResponse: routine.voiceResponse ?? "",
    steps: routine.steps,
  };
}

function draftToInput(draft: Draft): RoutineCreateInput {
  return {
    name: draft.name.trim(),
    icon: draft.icon,
    color: draft.color,
    enabled: draft.enabled,
    trigger: draft.trigger,
    voiceResponse: draft.voiceResponse.trim() ? draft.voiceResponse.trim() : null,
    steps: draft.steps,
  };
}

/* Curated icon palette. The `key` is what gets persisted; `Icon` is the
 * Phosphor component used at render time. Kept small on purpose — the
 * editor is not an icon browser. */
export const ROUTINE_ICONS: { key: string; Icon: PhosphorIcon }[] = [
  { key: "lightning", Icon: LightningIcon },
  { key: "sun", Icon: SunIcon },
  { key: "moon", Icon: MoonIcon },
  { key: "house", Icon: HouseLineIcon },
  { key: "bed", Icon: BedIcon },
  { key: "couch", Icon: CouchIcon },
  { key: "coffee", Icon: CoffeeIcon },
  { key: "pot", Icon: CookingPotIcon },
  { key: "film", Icon: FilmSlateIcon },
  { key: "music", Icon: MusicNotesIcon },
  { key: "shield", Icon: ShieldCheckIcon },
  { key: "cloud", Icon: CloudSunIcon },
  { key: "sparkle", Icon: SparkleIcon },
];

/* Curated color palette using the same tile accent tokens the rest of the
 * UI already renders. Raw hex so it works inline without extra CSS vars. */
export const ROUTINE_COLORS: { key: string; swatch: string }[] = [
  { key: "amber", swatch: "#E89A2E" },
  { key: "terracotta", swatch: "#C26449" },
  { key: "sage", swatch: "#7A9B7E" },
  { key: "ochre", swatch: "#B88A3E" },
  { key: "mauve", swatch: "#8E6B8A" },
  { key: "sand", swatch: "#C9A876" },
  { key: "blue", swatch: "#4A90D9" },
  { key: "rose", swatch: "#C97A95" },
];

export function RoutineEditorPage() {
  const { t } = useT("routines");
  const { t: tCommon } = useT("common");
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const { data: routines = [], isLoading: routinesLoading } = useRoutines();
  const routine = useMemo(() => routines.find((r) => r.id === id) ?? null, [routines, id]);

  const { data: lights = [] } = useLights();
  const { data: rooms = [] } = useRooms();
  const { data: acDevices = [] } = useAcDevices(true);
  const { data: cameras = [] } = useCameras();

  const devices: EditorDeviceCatalog = useMemo(
    () => ({
      lights,
      rooms,
      acDevices: acDevices.map((d) => ({ id: d.id, nickname: d.nickname })),
      cameras: cameras.map((c) => ({ id: c.id, name: c.name })),
    }),
    [lights, rooms, acDevices, cameras],
  );

  const [draft, setDraft] = useState<Draft>(defaultRoutine);
  const [initializedFromServer, setInitializedFromServer] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Drag-and-drop state for the steps list. `dragIndex` is the source of
   * the active drag, `dropIndex` the hovered target. Both reset on drop. */
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  /* Hydrate once when editing — `routines` refetches every 2 minutes so we
   * only take its first load, otherwise typing would get clobbered. */
  if (isEdit && routine && !initializedFromServer) {
    setDraft(routineToDraft(routine));
    setInitializedFromServer(true);
  }

  const create = useCreateRoutine();
  const update = useUpdateRoutine();
  const del = useDeleteRoutine();
  const run = useRunRoutine();

  const handleSave = async () => {
    setError(null);
    if (!draft.name.trim()) {
      setError(t("editor.errors.nameRequired"));
      return;
    }
    if (draft.steps.length === 0) {
      setError(t("editor.errors.noSteps"));
      return;
    }
    if (draft.trigger.type === "voice" && draft.trigger.phrases.length === 0) {
      setError(t("editor.errors.noPhrases"));
      return;
    }
    try {
      if (isEdit && id) {
        await update.mutateAsync({ id, input: draftToInput(draft) });
      } else {
        await create.mutateAsync(draftToInput(draft));
      }
      navigate("/routines");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("update.error"));
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    await del.mutateAsync(id);
    setConfirmDelete(false);
    navigate("/routines");
  };

  const addStep = () => {
    setDraft((d) => ({
      ...d,
      steps: [...d.steps, { action: "voice.speak", params: { text: "" } }],
    }));
  };

  const updateStep = (index: number, next: RoutineStep) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s, i) => (i === index ? next : s)),
    }));
  };

  const removeStep = (index: number) => {
    setDraft((d) => ({
      ...d,
      steps: d.steps.filter((_, i) => i !== index),
    }));
  };

  const commitDrop = () => {
    if (dragIndex === null || dropIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }
    setDraft((d) => {
      const next = [...d.steps];
      const [moved] = next.splice(dragIndex, 1);
      if (!moved) return d;
      next.splice(dropIndex, 0, moved);
      return { ...d, steps: next };
    });
    setDragIndex(null);
    setDropIndex(null);
  };

  if (isEdit && routinesLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-full">
          <SpinnerIcon size={32} className="animate-spin text-text-muted" />
        </div>
      </PageContainer>
    );
  }

  if (isEdit && !routine && !routinesLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center gap-4 pt-16">
          <p className="text-text-muted">{tCommon("states.error")}</p>
          <button
            type="button"
            onClick={() => navigate("/routines")}
            className="text-accent hover:underline"
          >
            {tCommon("actions.back")}
          </button>
        </div>
      </PageContainer>
    );
  }

  const submitting = create.isPending || update.isPending;

  return (
    <PageContainer>
      <PageHeader
        title={isEdit ? t("editor.editTitle") : t("editor.createTitle")}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {isEdit && id && (
              <button
                type="button"
                onClick={() => run.mutate(id)}
                disabled={run.isPending}
                className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-4 py-2 text-sm font-medium hover:border-accent disabled:opacity-50 min-h-[2.75rem]"
              >
                <PlayIcon size={16} weight="bold" />
                {t("editor.actions.runNow")}
              </button>
            )}
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-4 py-2 text-sm font-medium text-danger hover:border-danger hover:bg-danger/10 min-h-[2.75rem]"
              >
                <TrashIcon size={16} weight="bold" />
                {tCommon("actions.delete")}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/routines")}
              className="flex items-center gap-2 rounded-md bg-surface-elevated border border-border px-4 py-2 text-sm font-medium hover:border-accent min-h-[2.75rem]"
            >
              {tCommon("actions.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 min-h-[2.75rem]"
            >
              <FloppyDiskIcon size={16} weight="bold" />
              {t("editor.actions.save")}
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-8 max-w-3xl">
        {/* Basic meta */}
        <section className="flex flex-col gap-4">
          <Input
            label={t("editor.name")}
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder={t("editor.namePlaceholder")}
            autoFocus={!isEdit}
          />
          <label className="flex items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
              className="h-5 w-5 rounded accent-accent"
            />
            <span>{t("editor.enabled")}</span>
          </label>
        </section>

        {/* Appearance: icon + color */}
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-elevated p-5">
          <span className="text-sm font-medium text-text-muted">
            {t("editor.appearance.label")}
          </span>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-text-subtle">{t("editor.appearance.icon")}</span>
            <div className="flex flex-wrap gap-2">
              {ROUTINE_ICONS.map(({ key, Icon }) => {
                const selected = draft.icon === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDraft((d) => ({ ...d, icon: selected ? null : key }))}
                    className={`p-3 rounded-md border min-h-[3rem] min-w-[3rem] flex items-center justify-center transition-colors ${
                      selected
                        ? "bg-accent/15 border-accent text-accent"
                        : "bg-surface border-border text-text-muted hover:text-text hover:border-accent/60"
                    }`}
                  >
                    <Icon size={22} weight={selected ? "fill" : "duotone"} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-text-subtle">{t("editor.appearance.color")}</span>
            <div className="flex flex-wrap gap-2">
              {ROUTINE_COLORS.map(({ key, swatch }) => {
                const selected = draft.color === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={key}
                    onClick={() => setDraft((d) => ({ ...d, color: selected ? null : key }))}
                    className={`h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all ${
                      selected ? "border-text scale-110" : "border-border hover:scale-105"
                    }`}
                    style={{ backgroundColor: swatch }}
                  >
                    {selected ? (
                      <CheckIcon size={18} weight="bold" className="text-white drop-shadow" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Trigger */}
        <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface-elevated p-5">
          <TriggerEditor
            value={draft.trigger}
            onChange={(trigger) => setDraft((d) => ({ ...d, trigger }))}
          />
        </section>

        {/* Voice response */}
        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium text-text-muted" htmlFor="voice-response">
            {t("editor.response.label")}
          </label>
          <textarea
            id="voice-response"
            value={draft.voiceResponse}
            onChange={(e) => setDraft((d) => ({ ...d, voiceResponse: e.target.value }))}
            placeholder={t("editor.response.placeholder")}
            rows={2}
            maxLength={500}
            className="min-h-[88px] rounded-md bg-surface px-4 py-3 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle resize-y"
          />
          <span className="text-xs text-text-subtle">{t("editor.response.hint")}</span>
        </section>

        {/* Steps */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-text-muted">{t("editor.steps.label")}</span>
          </div>
          <p className="text-xs text-text-subtle">{t("editor.steps.hint")}</p>
          {draft.steps.length === 0 ? (
            <p className="italic text-text-subtle py-6 text-center">{t("editor.steps.empty")}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {draft.steps.map((step, idx) => (
                <StepEditor
                  key={idx}
                  step={step}
                  index={idx}
                  devices={devices}
                  isDragging={dragIndex === idx}
                  isDragTarget={dropIndex === idx && dragIndex !== idx}
                  onChange={(next) => updateStep(idx, next)}
                  onRemove={() => removeStep(idx)}
                  onDragStart={(i) => setDragIndex(i)}
                  onDragOver={(i) => setDropIndex(i)}
                  onDrop={commitDrop}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDropIndex(null);
                  }}
                />
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={addStep}
            className="self-start flex items-center gap-2 rounded-md bg-surface-elevated border border-dashed border-border px-5 py-3 text-sm font-medium text-text hover:border-accent hover:text-accent"
          >
            <PlusIcon size={16} weight="bold" />
            {t("editor.steps.addStep")}
          </button>
        </section>

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-md px-4 py-3">
            {error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("delete.confirmTitle")}
        message={t("delete.confirmBody", { name: routine?.name ?? "" })}
        confirmLabel={tCommon("actions.delete")}
        cancelLabel={tCommon("actions.cancel")}
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </PageContainer>
  );
}
