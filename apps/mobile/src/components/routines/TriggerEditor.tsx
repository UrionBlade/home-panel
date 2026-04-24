/**
 * Trigger section of the routine editor.
 *
 * Mirrors the shared `RoutineTrigger` discriminated union: manual, time-of-day
 * + weekday picker, cron expression, or a list of voice phrases. The "time"
 * and "cron" tabs are presented as two presentation modes of the same
 * schedule-style trigger so the user can start simple (hh:mm + days) and
 * drop down to raw cron for power-user cases.
 */

import type {
  RoutineTrigger,
  RoutineTriggerCron,
  RoutineTriggerTime,
  RoutineTriggerVoice,
} from "@home-panel/shared";
import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { i18next } from "../../lib/i18n";
import { useT } from "../../lib/useT";
import { Input } from "../ui/Input";

function weekdayShortLabels(): string[] {
  const raw = i18next.t("routines:weekdays.short", { returnObjects: true });
  return Array.isArray(raw) ? (raw as string[]) : [];
}

type TriggerKind = RoutineTrigger["type"];

interface TriggerEditorProps {
  value: RoutineTrigger;
  onChange: (trigger: RoutineTrigger) => void;
}

export function TriggerEditor({ value, onChange }: TriggerEditorProps) {
  const { t } = useT("routines");

  const tabs: { kind: TriggerKind; label: string }[] = [
    { kind: "time", label: t("editor.trigger.time") },
    { kind: "cron", label: t("editor.trigger.cron") },
    { kind: "voice", label: t("editor.trigger.voice") },
    { kind: "manual", label: t("editor.trigger.manual") },
  ];

  /* Switching trigger kind resets the config to a sensible default so
   * malformed legacy state can't leak into the new shape. */
  const switchKind = (kind: TriggerKind) => {
    if (kind === value.type) return;
    switch (kind) {
      case "time":
        onChange({ type: "time", hour: 22, minute: 0, daysOfWeek: [] });
        return;
      case "cron":
        onChange({ type: "cron", expr: "0 22 * * *" });
        return;
      case "voice":
        onChange({ type: "voice", phrases: [] });
        return;
      case "manual":
        onChange({ type: "manual" });
        return;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-medium text-text-muted">{t("editor.trigger.label")}</span>
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            onClick={() => switchKind(tab.kind)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              value.type === tab.kind
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-surface border-border text-text-muted hover:text-text hover:border-accent/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {value.type === "time" && <TimeEditor value={value} onChange={onChange} />}
      {value.type === "cron" && <CronEditor value={value} onChange={onChange} />}
      {value.type === "voice" && <VoicePhrasesEditor value={value} onChange={onChange} />}
      {value.type === "manual" && (
        <p className="text-sm text-text-subtle italic">{t("editor.trigger.manual")}</p>
      )}
    </div>
  );
}

// ---------- time ----------

function TimeEditor({
  value,
  onChange,
}: {
  value: RoutineTriggerTime;
  onChange: (t: RoutineTrigger) => void;
}) {
  const { t } = useT("routines");
  const weekdays = weekdayShortLabels();

  const toggleDay = (day: number) => {
    const next = value.daysOfWeek.includes(day)
      ? value.daysOfWeek.filter((d) => d !== day)
      : [...value.daysOfWeek, day].sort();
    onChange({ ...value, daysOfWeek: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        type="time"
        label={t("editor.trigger.hourMinute")}
        value={`${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`}
        onChange={(e) => {
          const [h, m] = e.target.value.split(":");
          onChange({
            ...value,
            hour: Number.parseInt(h ?? "0", 10) || 0,
            minute: Number.parseInt(m ?? "0", 10) || 0,
          });
        }}
      />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text-muted">{t("editor.trigger.days")}</span>
        <div className="flex gap-2 flex-wrap">
          {weekdays.map((label, day) => {
            const selected = value.daysOfWeek.includes(day);
            return (
              <button
                key={label}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-2 rounded-md text-sm font-medium border min-w-[3rem] transition-colors ${
                  selected
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-surface border-border text-text-muted hover:text-text hover:border-accent/60"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {value.daysOfWeek.length === 0 && (
          <span className="text-xs text-text-subtle italic">{t("editor.trigger.everyDay")}</span>
        )}
      </div>
    </div>
  );
}

// ---------- cron ----------

const CRON_FIELD = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/;
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((p) => CRON_FIELD.test(p));
}

function CronEditor({
  value,
  onChange,
}: {
  value: RoutineTriggerCron;
  onChange: (t: RoutineTrigger) => void;
}) {
  const { t } = useT("routines");
  const valid = isValidCron(value.expr);
  return (
    <Input
      label={t("editor.trigger.cronExpr")}
      value={value.expr}
      onChange={(e) => onChange({ ...value, expr: e.target.value })}
      placeholder="0 22 * * *"
      hint={t("editor.trigger.cronHint")}
      error={!valid && value.expr.trim() ? t("editor.trigger.cronInvalid") : undefined}
    />
  );
}

// ---------- voice ----------

function VoicePhrasesEditor({
  value,
  onChange,
}: {
  value: RoutineTriggerVoice;
  onChange: (t: RoutineTrigger) => void;
}) {
  const { t } = useT("routines");
  const [draft, setDraft] = useState("");

  const addPhrase = () => {
    const phrase = draft.trim();
    if (!phrase || value.phrases.includes(phrase)) {
      setDraft("");
      return;
    }
    onChange({ ...value, phrases: [...value.phrases, phrase] });
    setDraft("");
  };

  const removePhrase = (phrase: string) => {
    onChange({ ...value, phrases: value.phrases.filter((p) => p !== phrase) });
  };

  return (
    <div className="flex flex-col gap-3">
      <Input
        label={t("editor.trigger.phrases")}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("editor.trigger.phrasesPlaceholder")}
        hint={t("editor.trigger.phrasesHint")}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addPhrase();
          }
        }}
        onBlur={addPhrase}
      />
      {value.phrases.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.phrases.map((phrase) => (
            <li
              key={phrase}
              className="flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-surface border border-border text-sm"
            >
              <span className="text-text">{phrase}</span>
              <button
                type="button"
                onClick={() => removePhrase(phrase)}
                className="p-1 rounded-full text-text-subtle hover:text-danger hover:bg-danger/10 transition-colors"
                aria-label={t("editor.steps.remove")}
              >
                <XIcon size={14} weight="bold" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
