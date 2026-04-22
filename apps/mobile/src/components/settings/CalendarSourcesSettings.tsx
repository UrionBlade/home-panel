import type { CalendarSource } from "@home-panel/shared";
import {
  ArrowsClockwiseIcon,
  CalendarPlusIcon,
  InfoIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import {
  useCalendarSources,
  useCreateCalendarSource,
  useDeleteCalendarSource,
  useSyncCalendarSource,
  useUpdateCalendarSource,
} from "../../lib/hooks/useCalendarSources";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface SourceFormData {
  name: string;
  url: string;
  type: "ics" | "caldav";
  color: string;
  syncIntervalMinutes: string;
}

const EMPTY_FORM: SourceFormData = {
  name: "",
  url: "",
  type: "ics",
  color: "#4A90D9",
  syncIntervalMinutes: "30",
};

const COLOR_PRESETS = [
  "#4A90D9",
  "#E74C3C",
  "#2ECC71",
  "#F39C12",
  "#9B59B6",
  "#1ABC9C",
  "#E67E22",
  "#34495E",
];

function formatSyncTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CalendarSourcesSettings() {
  const { t } = useT("calendar");
  const { t: tCommon } = useT("common");
  const { t: tSettings } = useT("settings");
  const { data: sources } = useCalendarSources();
  const createSource = useCreateCalendarSource();
  const updateSource = useUpdateCalendarSource();
  const deleteSource = useDeleteCalendarSource();
  const syncSource = useSyncCalendarSource();

  const [addOpen, setAddOpen] = useState(false);
  const [editSource, setEditSource] = useState<CalendarSource | null>(null);
  const [form, setForm] = useState<SourceFormData>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const openAdd = useCallback(() => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setAddOpen(true);
  }, []);

  const openEdit = useCallback((source: CalendarSource) => {
    setForm({
      name: source.name,
      url: source.url,
      type: source.type,
      color: source.color,
      syncIntervalMinutes: String(source.syncIntervalMinutes),
    });
    setFormError(null);
    setEditSource(source);
  }, []);

  const closeModal = useCallback(() => {
    setAddOpen(false);
    setEditSource(null);
    setFormError(null);
  }, []);

  const validate = useCallback(
    (data: SourceFormData): string | null => {
      if (!data.name.trim()) return `${t("sources.name")} obbligatorio`;
      if (!data.url.trim()) return `${t("sources.url")} obbligatorio`;
      try {
        new URL(data.url);
      } catch {
        return "URL non valido";
      }
      const interval = Number(data.syncIntervalMinutes);
      if (Number.isNaN(interval) || interval < 5) return "Intervallo minimo: 5 minuti";
      return null;
    },
    [t],
  );

  const handleAdd = useCallback(() => {
    const err = validate(form);
    if (err) {
      setFormError(err);
      return;
    }
    createSource.mutate(
      {
        name: form.name.trim(),
        url: form.url.trim(),
        type: form.type,
        color: form.color,
        syncIntervalMinutes: Number(form.syncIntervalMinutes),
      },
      { onSuccess: () => closeModal() },
    );
  }, [form, createSource, closeModal, validate]);

  const handleEdit = useCallback(() => {
    if (!editSource) return;
    const err = validate(form);
    if (err) {
      setFormError(err);
      return;
    }
    updateSource.mutate(
      {
        id: editSource.id,
        input: {
          name: form.name.trim(),
          url: form.url.trim(),
          type: form.type,
          color: form.color,
          syncIntervalMinutes: Number(form.syncIntervalMinutes),
        },
      },
      { onSuccess: () => closeModal() },
    );
  }, [form, editSource, updateSource, closeModal, validate]);

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm(t("sources.delete"))) return;
      deleteSource.mutate(id);
    },
    [deleteSource, t],
  );

  const handleSync = useCallback(
    (id: string) => {
      syncSource.mutate(id);
    },
    [syncSource],
  );

  if (!sources) return null;

  const isModalOpen = addOpen || editSource !== null;

  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-display text-3xl">{t("sources.title")}</h2>

      <div className="rounded-md bg-surface border border-border p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl flex items-center gap-2">
            <CalendarPlusIcon size={22} weight="duotone" />
            {t("sources.title")}
          </h3>
          <Button variant="ghost" size="sm" onClick={openAdd} iconLeft={<PlusIcon size={18} />}>
            {t("sources.add")}
          </Button>
        </div>

        {sources.length === 0 && <p className="text-sm text-text-muted">{t("sources.empty")}</p>}

        <ul className="flex flex-col gap-3">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center gap-4 p-4 rounded-md border border-border bg-bg"
            >
              {/* Color dot */}
              <span
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: source.color }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{source.name}</span>
                  {!source.enabled && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-text-muted/15 text-text-muted">
                      {t("sources.disabled")}
                    </span>
                  )}
                </div>
                <span className="text-sm text-text-muted truncate block">
                  {source.url.length > 50 ? `${source.url.slice(0, 50)}...` : source.url}
                </span>
                <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{
                        backgroundColor: source.lastSyncError
                          ? "var(--color-danger)"
                          : source.lastSyncAt
                            ? "var(--color-success, #2ECC71)"
                            : "var(--color-text-muted)",
                      }}
                    />
                    {source.lastSyncAt
                      ? `${t("sources.lastSync")}: ${formatSyncTime(source.lastSyncAt)}`
                      : t("sources.neverSynced")}
                  </span>
                  {source.lastSyncError && (
                    <span
                      className="text-danger truncate max-w-[200px]"
                      title={source.lastSyncError}
                    >
                      {source.lastSyncError}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSync(source.id)}
                  disabled={syncSource.isPending}
                  title={t("sources.syncNow")}
                  className="p-2 rounded-sm hover:bg-surface text-text-muted hover:text-accent transition-colors"
                >
                  <ArrowsClockwiseIcon
                    size={20}
                    weight="duotone"
                    className={syncSource.isPending ? "animate-spin" : ""}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(source)}
                  title={tCommon("actions.edit")}
                  className="p-2 rounded-sm hover:bg-surface text-text-muted hover:text-text transition-colors"
                >
                  <PencilSimpleIcon size={20} weight="duotone" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(source.id)}
                  disabled={deleteSource.isPending}
                  title={t("sources.deleteConfirm")}
                  className="p-2 rounded-sm hover:bg-surface text-text-muted hover:text-danger transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <TrashIcon size={20} weight="duotone" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Google Calendar setup help */}
        <div className="flex items-start gap-2 p-3 rounded-sm bg-bg text-xs text-text-muted">
          <InfoIcon size={16} weight="duotone" className="shrink-0 mt-0.5" />
          <span>{t("sources.googleHelp")}</span>
        </div>
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title={
          editSource
            ? tSettings("calendar.editSource", { name: editSource.name })
            : t("sources.add")
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeModal}>
              {tCommon("actions.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={editSource ? handleEdit : handleAdd}
              isLoading={createSource.isPending || updateSource.isPending}
            >
              {editSource ? tCommon("actions.save") : t("sources.add")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            label={t("sources.name")}
            placeholder={tSettings("calendar.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label={t("sources.url")}
            placeholder={t("sources.urlPlaceholder")}
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
          />
          <Dropdown
            label={t("sources.type")}
            value={form.type}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                type: v as "ics" | "caldav",
              }))
            }
            options={[
              { value: "ics", label: t("sources.ics") },
              { value: "caldav", label: t("sources.caldav") },
            ]}
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-muted">{t("sources.color")}</span>
            <div className="flex items-center gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? "var(--color-text)" : "transparent",
                  }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="w-8 h-8 rounded-full border-0 cursor-pointer"
              />
            </div>
          </div>
          <Input
            label={t("sources.syncInterval")}
            type="number"
            min={5}
            step={5}
            value={form.syncIntervalMinutes}
            onChange={(e) => setForm((f) => ({ ...f, syncIntervalMinutes: e.target.value }))}
          />
          {formError && <p className="text-sm text-danger">{formError}</p>}
        </div>
      </Modal>
    </section>
  );
}
