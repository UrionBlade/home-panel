import type { WasteRule, WasteRulePattern, WasteType } from "@home-panel/shared";
import { PencilSimpleIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  useCreateWasteRule,
  useCreateWasteType,
  useDeleteWasteRule,
  useDeleteWasteType,
  useUpdateWasteRule,
  useUpdateWasteType,
  useWasteCalendar,
  useWasteRules,
  useWasteTypes,
} from "../../lib/hooks/useWaste";
import { i18next } from "../../lib/i18n";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Dropdown } from "../ui/Dropdown";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

/* ---- helpers ---- */

/**
 * YYYY-MM-DD in timezone locale (non UTC). Allineato col backend `todayUTC`
 * che ora usa anch'esso componenti locali per la chiave giornaliera.
 */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - now.getDay() + 1); // Monday
  const to = new Date(from);
  to.setDate(from.getDate() + 13); // 2 weeks
  return {
    from: localIsoDate(from),
    to: localIsoDate(to),
  };
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const locale = i18next.language.startsWith("it") ? "it-IT" : "en-US";
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

function isToday(dateStr: string): boolean {
  return dateStr === localIsoDate(new Date());
}

function isPast(dateStr: string): boolean {
  return dateStr < localIsoDate(new Date());
}

function getWeekdayLabels(): string[] {
  const raw = i18next.t("waste:weekdays.long", { returnObjects: true });
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function describeRule(rule: WasteRule): string {
  const p = rule.pattern;
  const freq =
    p.freq === "weekly"
      ? i18next.t("waste:freq.weekly")
      : i18next.t("waste:freq.everyNDaysShort", { n: p.interval ?? 14 });
  const weekdayLabels = getWeekdayLabels();
  const days = p.byWeekday?.map((d) => weekdayLabels[d]).join(", ") ?? "";
  return days
    ? i18next.t("waste:describeRuleWithDays", {
        freq,
        days,
        time: rule.expositionTime,
      })
    : i18next.t("waste:describeRule", { freq, time: rule.expositionTime });
}

/* ---- Type Form Modal ---- */

interface TypeFormState {
  displayName: string;
  color: string;
  icon: string;
  containerType: "bag" | "bin";
  expositionInstructions: string;
}

const EMPTY_TYPE_FORM: TypeFormState = {
  displayName: "",
  color: "#4CAF50",
  icon: "trash",
  containerType: "bag",
  expositionInstructions: "",
};

function WasteTypeFormModal({
  open,
  onClose,
  initial,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  initial: TypeFormState;
  onSubmit: (form: TypeFormState) => void;
  isLoading: boolean;
}) {
  const { t } = useT("waste");
  const { t: tc } = useT("common");
  const [form, setForm] = useState(initial);

  const initialKey = JSON.stringify(initial);
  const [prevKey, setPrevKey] = useState(initialKey);
  if (initialKey !== prevKey) {
    setForm(initial);
    setPrevKey(initialKey);
  }

  const containerOptions = [
    { value: "bag", label: t("container.bag") },
    { value: "bin", label: t("container.bin") },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial.displayName ? t("form.type.editTitle") : t("form.type.newTitle")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button
            size="sm"
            isLoading={isLoading}
            onClick={() => onSubmit(form)}
            disabled={!form.displayName.trim() || !form.color.trim()}
          >
            {tc("actions.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t("form.type.name")}
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          placeholder={t("form.type.namePlaceholder")}
        />
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Input
              label={t("form.type.color")}
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              placeholder={t("form.type.colorPlaceholder")}
            />
          </div>
          <div
            className="w-14 h-14 rounded-md border border-border shrink-0"
            style={{ backgroundColor: form.color }}
          />
        </div>
        <Input
          label={t("form.type.icon")}
          value={form.icon}
          onChange={(e) => setForm({ ...form, icon: e.target.value })}
          placeholder={t("form.type.iconPlaceholder")}
        />
        <Dropdown
          label={t("form.type.containerType")}
          options={containerOptions}
          value={form.containerType}
          onChange={(v) => setForm({ ...form, containerType: v as "bag" | "bin" })}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor="exposition-instructions" className="text-sm font-medium text-text-muted">
            {t("form.type.expositionInstructions")}
          </label>
          <textarea
            id="exposition-instructions"
            className="min-h-[80px] rounded-md bg-surface px-4 py-3 text-base text-text border border-border focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent placeholder:text-text-subtle"
            value={form.expositionInstructions}
            onChange={(e) => setForm({ ...form, expositionInstructions: e.target.value })}
            placeholder={t("form.type.expositionInstructionsPlaceholder")}
          />
        </div>
      </div>
    </Modal>
  );
}

/* ---- Rule Form Modal ---- */

interface RuleFormState {
  freq: "weekly" | "every-n-days";
  interval: string;
  byWeekday: string;
  expositionTime: string;
  anchorDate: string;
}

const EMPTY_RULE_FORM: RuleFormState = {
  freq: "weekly",
  interval: "14",
  byWeekday: "1",
  expositionTime: "20:00",
  anchorDate: new Date().toISOString().slice(0, 10),
};

function ruleToFormState(rule: WasteRule): RuleFormState {
  const p = rule.pattern;
  return {
    freq: p.freq === "weekly" ? "weekly" : "every-n-days",
    interval: String(p.interval ?? 14),
    byWeekday: String(p.byWeekday?.[0] ?? 1),
    expositionTime: rule.expositionTime,
    anchorDate: p.anchorDate,
  };
}

function formStateToPattern(form: RuleFormState): WasteRulePattern {
  return {
    freq: form.freq,
    interval: form.freq === "every-n-days" ? Number(form.interval) : undefined,
    byWeekday: [Number(form.byWeekday)],
    anchorDate: form.anchorDate,
  };
}

function WasteRuleFormModal({
  open,
  onClose,
  initial,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  initial: RuleFormState;
  onSubmit: (form: RuleFormState) => void;
  isLoading: boolean;
}) {
  const { t } = useT("waste");
  const { t: tc } = useT("common");
  const [form, setForm] = useState(initial);

  const initialKey = JSON.stringify(initial);
  const [prevKey, setPrevKey] = useState(initialKey);
  if (initialKey !== prevKey) {
    setForm(initial);
    setPrevKey(initialKey);
  }

  const freqOptions = [
    { value: "weekly", label: t("freq.weekly") },
    { value: "every-n-days", label: t("freq.everyNDays") },
  ];

  const weekdayOptions = getWeekdayLabels().map((label, i) => ({
    value: String(i),
    label,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("form.rule.title")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button size="sm" isLoading={isLoading} onClick={() => onSubmit(form)}>
            {tc("actions.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Dropdown
          label={t("form.rule.frequency")}
          options={freqOptions}
          value={form.freq}
          onChange={(v) => setForm({ ...form, freq: v as "weekly" | "every-n-days" })}
        />
        {form.freq === "every-n-days" && (
          <Input
            label={t("form.rule.interval")}
            type="number"
            min={1}
            value={form.interval}
            onChange={(e) => setForm({ ...form, interval: e.target.value })}
          />
        )}
        <Dropdown
          label={t("form.rule.weekday")}
          options={weekdayOptions}
          value={form.byWeekday}
          onChange={(v) => setForm({ ...form, byWeekday: v })}
        />
        <Input
          label={t("form.rule.expositionTime")}
          type="time"
          value={form.expositionTime}
          onChange={(e) => setForm({ ...form, expositionTime: e.target.value })}
        />
        <Input
          label={t("form.rule.anchorDate")}
          type="date"
          value={form.anchorDate}
          onChange={(e) => setForm({ ...form, anchorDate: e.target.value })}
        />
      </div>
    </Modal>
  );
}

/* ---- Delete Confirmation Modal ---- */

function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  isLoading,
  message,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  message: string;
}) {
  const { t } = useT("waste");
  const { t: tc } = useT("common");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("confirm.title")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button
            size="sm"
            isLoading={isLoading}
            onClick={onConfirm}
            className="bg-danger hover:bg-danger/80"
          >
            {tc("actions.delete")}
          </Button>
        </>
      }
    >
      <p className="text-text">{message}</p>
    </Modal>
  );
}

/* ---- Management Section ---- */

function WasteManagement({ types, rules }: { types: WasteType[]; rules: WasteRule[] }) {
  const { t } = useT("waste");
  const createType = useCreateWasteType();
  const updateType = useUpdateWasteType();
  const deleteType = useDeleteWasteType();

  const createRule = useCreateWasteRule();
  const updateRule = useUpdateWasteRule();
  const deleteRule = useDeleteWasteRule();

  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<WasteType | null>(null);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WasteRule | null>(null);
  const [ruleTypeId, setRuleTypeId] = useState<string>("");

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "type" | "rule";
    id: string;
    label: string;
  } | null>(null);

  function openCreateType() {
    setEditingType(null);
    setTypeModalOpen(true);
  }

  function openEditType(t: WasteType) {
    setEditingType(t);
    setTypeModalOpen(true);
  }

  function handleTypeSubmit(form: TypeFormState) {
    if (editingType) {
      updateType.mutate(
        {
          id: editingType.id,
          input: {
            displayName: form.displayName,
            color: form.color,
            icon: form.icon,
            containerType: form.containerType,
            expositionInstructions: form.expositionInstructions || null,
          },
        },
        { onSuccess: () => setTypeModalOpen(false) },
      );
    } else {
      createType.mutate(
        {
          displayName: form.displayName,
          color: form.color,
          icon: form.icon,
          containerType: form.containerType,
          expositionInstructions: form.expositionInstructions || undefined,
        },
        { onSuccess: () => setTypeModalOpen(false) },
      );
    }
  }

  function openCreateRule(wasteTypeId: string) {
    setEditingRule(null);
    setRuleTypeId(wasteTypeId);
    setRuleModalOpen(true);
  }

  function openEditRule(rule: WasteRule) {
    setEditingRule(rule);
    setRuleTypeId(rule.wasteTypeId);
    setRuleModalOpen(true);
  }

  function handleRuleSubmit(form: RuleFormState) {
    const pattern = formStateToPattern(form);
    if (editingRule) {
      updateRule.mutate(
        {
          id: editingRule.id,
          input: {
            pattern,
            expositionTime: form.expositionTime,
          },
        },
        { onSuccess: () => setRuleModalOpen(false) },
      );
    } else {
      createRule.mutate(
        {
          wasteTypeId: ruleTypeId,
          pattern,
          expositionTime: form.expositionTime,
        },
        { onSuccess: () => setRuleModalOpen(false) },
      );
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const onSuccess = () => setDeleteTarget(null);
    if (deleteTarget.kind === "type") {
      deleteType.mutate(deleteTarget.id, { onSuccess });
    } else {
      deleteRule.mutate(deleteTarget.id, { onSuccess });
    }
  }

  const rulesByType = useMemo(() => {
    const map = new Map<string, WasteRule[]>();
    for (const r of rules) {
      const list = map.get(r.wasteTypeId) ?? [];
      list.push(r);
      map.set(r.wasteTypeId, list);
    }
    return map;
  }, [rules]);

  return (
    <>
      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-3xl text-text">{t("sections.management")}</h2>
          <Button
            size="sm"
            onClick={openCreateType}
            iconLeft={<PlusIcon size={18} weight="duotone" />}
          >
            {t("actions.addType")}
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {types.map((wt) => {
            const typeRules = rulesByType.get(wt.id) ?? [];
            return (
              <div
                key={wt.id}
                className="rounded-md border border-border bg-surface overflow-hidden"
              >
                <div className="flex items-center gap-3 p-4">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: wt.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text truncate">{wt.displayName}</p>
                    <p className="text-xs text-text-muted capitalize">
                      {wt.containerType === "bag" ? t("container.bag") : t("container.bin")}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={t("aria.editType", { name: wt.displayName })}
                      className="p-2 rounded-md text-text-muted hover:bg-surface-raised transition-colors"
                      onClick={() => openEditType(wt)}
                    >
                      <PencilSimpleIcon size={18} weight="duotone" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("aria.deleteType", { name: wt.displayName })}
                      className="p-2 rounded-md text-text-muted hover:text-danger hover:bg-surface-raised transition-colors"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "type",
                          id: wt.id,
                          label: wt.displayName,
                        })
                      }
                    >
                      <TrashIcon size={18} weight="duotone" />
                    </button>
                  </div>
                </div>

                <div className="border-t border-border">
                  {typeRules.length === 0 ? (
                    <p className="text-sm text-text-muted px-4 py-3">{t("empty.rules")}</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {typeRules.map((rule) => (
                        <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
                          <p className="flex-1 text-sm text-text min-w-0 truncate">
                            {describeRule(rule)}
                          </p>
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              aria-label={t("aria.editRule")}
                              className="p-1.5 rounded-md text-text-muted hover:bg-surface-raised transition-colors"
                              onClick={() => openEditRule(rule)}
                            >
                              <PencilSimpleIcon size={16} weight="duotone" />
                            </button>
                            <button
                              type="button"
                              aria-label={t("aria.deleteRule")}
                              className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-surface-raised transition-colors"
                              onClick={() =>
                                setDeleteTarget({
                                  kind: "rule",
                                  id: rule.id,
                                  label: describeRule(rule),
                                })
                              }
                            >
                              <TrashIcon size={16} weight="duotone" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="px-4 py-3 border-t border-border">
                    <button
                      type="button"
                      className="text-sm text-accent hover:underline flex items-center gap-1.5"
                      onClick={() => openCreateRule(wt.id)}
                    >
                      <PlusIcon size={14} weight="bold" />
                      {t("actions.addRule")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <WasteTypeFormModal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        initial={
          editingType
            ? {
                displayName: editingType.displayName,
                color: editingType.color,
                icon: editingType.icon,
                containerType: editingType.containerType,
                expositionInstructions: editingType.expositionInstructions ?? "",
              }
            : EMPTY_TYPE_FORM
        }
        onSubmit={handleTypeSubmit}
        isLoading={createType.isPending || updateType.isPending}
      />

      <WasteRuleFormModal
        open={ruleModalOpen}
        onClose={() => setRuleModalOpen(false)}
        initial={editingRule ? ruleToFormState(editingRule) : EMPTY_RULE_FORM}
        onSubmit={handleRuleSubmit}
        isLoading={createRule.isPending || updateRule.isPending}
      />

      <DeleteConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        isLoading={deleteType.isPending || deleteRule.isPending}
        message={
          deleteTarget
            ? deleteTarget.kind === "type"
              ? t("confirm.deleteType", { name: deleteTarget.label })
              : t("confirm.deleteRule")
            : ""
        }
      />
    </>
  );
}

/**
 * Settings tab showing the 2-week waste collection preview plus type & rule
 * management. Replaces the former standalone /waste page so the sidebar stays
 * focused on daily-use destinations.
 */
export function WasteSettings() {
  const { t } = useT("waste");
  const { from, to } = useMemo(getWeekRange, []);
  const { data: days = [] } = useWasteCalendar(from, to);
  const { data: allTypes = [] } = useWasteTypes();
  const { data: allRules = [] } = useWasteRules();

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-3xl text-text">{t("sections.schedule")}</h2>
        {days.map((day) => {
          const today = isToday(day.date);
          const past = isPast(day.date);
          return (
            <div
              key={day.date}
              className={`flex items-center gap-4 p-4 rounded-md border ${
                today
                  ? "border-accent bg-surface-raised"
                  : past
                    ? "border-border opacity-50"
                    : "border-border bg-surface"
              }`}
            >
              <div className="w-28 shrink-0">
                <span
                  className={`text-sm capitalize ${today ? "font-bold text-accent" : "text-text-muted"}`}
                >
                  {formatDayLabel(day.date)}
                </span>
                {today && (
                  <span className="block text-[10px] font-medium text-accent uppercase tracking-wider">
                    {t("labels.today")}
                  </span>
                )}
              </div>

              {day.wasteTypes.length === 0 ? (
                <span className="text-sm text-text-muted">{t("empty.day")}</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {day.wasteTypes.map((wt) => (
                    <span
                      key={wt.id}
                      className="text-xs px-3 py-1.5 rounded-full font-medium"
                      style={{
                        backgroundColor: `color-mix(in oklch, ${wt.color} 18%, transparent)`,
                        color: wt.color,
                      }}
                    >
                      {wt.displayName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {allTypes.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="font-display text-3xl text-text">{t("sections.types")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allTypes
              .filter((ty) => ty.active)
              .map((wt) => (
                <div
                  key={wt.id}
                  className="flex items-start gap-3 p-4 rounded-md border border-border bg-surface"
                >
                  <TrashIcon
                    size={24}
                    weight="duotone"
                    style={{ color: wt.color }}
                    className="shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="font-medium text-text">{wt.displayName}</p>
                    <p className="text-xs text-text-muted capitalize">
                      {wt.containerType === "bag" ? t("container.bag") : t("container.bin")}
                    </p>
                    {wt.expositionInstructions && (
                      <p className="text-xs text-text-muted mt-1">{wt.expositionInstructions}</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      <hr className="border-border" />

      <WasteManagement types={allTypes} rules={allRules} />
    </>
  );
}
