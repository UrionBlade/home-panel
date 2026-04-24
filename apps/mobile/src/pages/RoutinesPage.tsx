/**
 * Routines list page. Shows every defined routine with its trigger summary,
 * enabled toggle, "Run now" button and deep-link to the editor.
 */

import type { Routine, RoutineTrigger } from "@home-panel/shared";
import {
  ClockIcon,
  LightningIcon,
  MicrophoneIcon,
  PlayIcon,
  PlusIcon,
  SpinnerIcon,
  ToggleLeftIcon,
} from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { useRoutines, useRunRoutine, useUpdateRoutine } from "../lib/hooks/useRoutines";
import { i18next } from "../lib/i18n";
import { useT } from "../lib/useT";
import { ROUTINE_COLORS, ROUTINE_ICONS } from "./RoutineEditorPage";

function iconForRoutine(key: string | null) {
  return ROUTINE_ICONS.find((i) => i.key === key)?.Icon ?? LightningIcon;
}
function swatchForRoutine(key: string | null): string | null {
  return ROUTINE_COLORS.find((c) => c.key === key)?.swatch ?? null;
}

function weekdayShortLabels(): string[] {
  const raw = i18next.t("routines:weekdays.short", { returnObjects: true });
  return Array.isArray(raw) ? (raw as string[]) : [];
}

export function RoutinesPage() {
  const { t } = useT("routines");
  const navigate = useNavigate();
  const { data: routines = [], isLoading } = useRoutines();
  const run = useRunRoutine();
  const update = useUpdateRoutine();

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-full">
          <SpinnerIcon size={32} className="animate-spin text-text-muted" />
        </div>
      </PageContainer>
    );
  }

  if (routines.length === 0) {
    return (
      <PageContainer>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto mt-16 flex flex-col items-center gap-5 text-center"
        >
          <LightningIcon size={140} weight="duotone" className="text-accent/70" />
          <h2 className="font-display text-2xl text-text">{t("empty.title")}</h2>
          <p className="text-text-muted">{t("empty.body")}</p>
          <button
            type="button"
            onClick={() => navigate("/routines/new")}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-6 py-3 font-medium text-base hover:opacity-90"
          >
            <PlusIcon size={18} weight="bold" />
            {t("empty.cta")}
          </button>
        </motion.div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <button
            type="button"
            onClick={() => navigate("/routines/new")}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-5 py-2 font-medium text-sm hover:opacity-90 min-h-[2.75rem]"
          >
            <PlusIcon size={16} weight="bold" />
            {t("actions.new")}
          </button>
        }
      />
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {routines.map((routine, index) => (
          <motion.div
            key={routine.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
          >
            <RoutineCard
              routine={routine}
              onEdit={() => navigate(`/routines/${routine.id}`)}
              onRun={() => run.mutate(routine.id)}
              onToggle={() =>
                update.mutate({
                  id: routine.id,
                  input: { enabled: !routine.enabled },
                })
              }
            />
          </motion.div>
        ))}
      </div>
    </PageContainer>
  );
}

function RoutineCard({
  routine,
  onEdit,
  onRun,
  onToggle,
}: {
  routine: Routine;
  onEdit: () => void;
  onRun: () => void;
  onToggle: () => void;
}) {
  const { t } = useT("routines");
  const disabled = !routine.enabled;
  const Icon = iconForRoutine(routine.icon);
  const swatch = swatchForRoutine(routine.color);

  return (
    <div
      className={`relative flex flex-col gap-3 rounded-lg border bg-surface-elevated p-5 transition-colors ${
        disabled ? "opacity-60 border-border" : "border-border hover:border-accent/60"
      }`}
      style={
        swatch && !disabled
          ? {
              borderLeftColor: swatch,
              borderLeftWidth: "4px",
            }
          : undefined
      }
    >
      {/* Primary tap area — full card except action buttons */}
      <button
        type="button"
        onClick={onEdit}
        className="absolute inset-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`${t("actions.edit")} ${routine.name}`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="p-2.5 rounded-md shrink-0"
            style={{
              backgroundColor: swatch ? `${swatch}20` : undefined,
              color: swatch ?? undefined,
            }}
          >
            <Icon size={22} weight="duotone" className={swatch ? "" : "text-accent"} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-medium text-text truncate">{routine.name}</h3>
            <TriggerSummary trigger={routine.trigger} />
          </div>
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
            disabled
              ? "bg-surface text-text-subtle"
              : routine.lastRunStatus === "error"
                ? "bg-danger/15 text-danger"
                : routine.lastRunStatus === "success"
                  ? "bg-accent/15 text-accent"
                  : "bg-surface text-text-subtle"
          }`}
        >
          {disabled
            ? t("list.disabled")
            : routine.lastRunStatus === "error"
              ? t("list.statusError")
              : routine.lastRunStatus === "success"
                ? t("list.statusSuccess")
                : t("list.never")}
        </span>
      </div>

      <div className="relative flex items-center justify-between">
        <span className="text-xs text-text-subtle truncate">
          {routine.lastRunAt
            ? `${t("list.lastRun")}: ${formatTimestamp(routine.lastRunAt)}`
            : t("list.never")}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            aria-label={routine.enabled ? t("actions.disable") : t("actions.enable")}
            className="p-2 rounded-md text-text-muted hover:text-text hover:bg-surface"
          >
            <ToggleLeftIcon
              size={20}
              weight={routine.enabled ? "fill" : "duotone"}
              className={routine.enabled ? "text-accent" : undefined}
            />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRun();
            }}
            aria-label={t("actions.runNow")}
            className="p-2 rounded-md text-text-muted hover:text-accent hover:bg-surface"
          >
            <PlayIcon size={18} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
}

function TriggerSummary({ trigger }: { trigger: RoutineTrigger }) {
  const { t } = useT("routines");
  const weekdays = weekdayShortLabels();

  if (trigger.type === "time") {
    const hhmm = `${String(trigger.hour).padStart(2, "0")}:${String(trigger.minute).padStart(2, "0")}`;
    const daysLabel =
      trigger.daysOfWeek.length === 0 || trigger.daysOfWeek.length === 7
        ? t("editor.trigger.daysAll")
        : trigger.daysOfWeek.map((d) => weekdays[d] ?? "").join(" · ");
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
        <ClockIcon size={14} weight="bold" />
        <span className="tabular-nums">{hhmm}</span>
        <span className="text-text-subtle">· {daysLabel}</span>
      </p>
    );
  }
  if (trigger.type === "cron") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-muted mt-1 font-mono">
        <ClockIcon size={14} weight="bold" />
        {trigger.expr}
      </p>
    );
  }
  if (trigger.type === "voice") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-text-muted mt-1 truncate">
        <MicrophoneIcon size={14} weight="bold" />
        <span className="truncate">«{trigger.phrases.join("», «")}»</span>
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-text-muted mt-1">
      <LightningIcon size={14} weight="bold" />
      {t("editor.trigger.manual")}
    </p>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
