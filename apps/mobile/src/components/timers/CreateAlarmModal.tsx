import type { Alarm } from "@home-panel/shared";
import { useEffect, useState } from "react";
import { useCreateAlarm, useUpdateAlarm } from "../../lib/hooks/useTimers";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

interface AlarmFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the modal is in edit mode */
  alarm?: Alarm | null;
}

/**
 * Reusable modal: edits the given alarm when `alarm` is provided, otherwise creates a new one.
 * The file name stays `CreateAlarmModal` for import backwards-compatibility.
 */
export function CreateAlarmModal({ open, onClose, alarm }: AlarmFormModalProps) {
  const { t } = useT("timers");
  const { t: tc } = useT("common");
  const createAlarm = useCreateAlarm();
  const updateAlarm = useUpdateAlarm();

  const isEdit = !!alarm;

  const [label, setLabel] = useState("");
  const [hour, setHour] = useState("7");
  const [minute, setMinute] = useState("0");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // Sincronizza lo stato quando cambia alarm (apre in edit) o viene aperta in create
  useEffect(() => {
    if (!open) return;
    if (alarm) {
      setLabel(alarm.label);
      setHour(String(alarm.hour));
      setMinute(String(alarm.minute));
      setSelectedDays(alarm.daysOfWeek);
    } else {
      setLabel("");
      setHour("7");
      setMinute("0");
      setSelectedDays([]);
    }
  }, [open, alarm]);

  function toggleDay(d: number) {
    setSelectedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function resetAndClose() {
    setLabel("");
    setHour("7");
    setMinute("0");
    setSelectedDays([]);
    onClose();
  }

  function handleSubmit() {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (!label.trim()) return;
    if (Number.isNaN(h) || h < 0 || h > 23) return;
    if (Number.isNaN(m) || m < 0 || m > 59) return;

    if (isEdit && alarm) {
      updateAlarm.mutate(
        {
          id: alarm.id,
          input: {
            label: label.trim(),
            hour: h,
            minute: m,
            daysOfWeek: selectedDays,
          },
        },
        {
          onSuccess: resetAndClose,
        },
      );
    } else {
      createAlarm.mutate(
        {
          label: label.trim(),
          hour: h,
          minute: m,
          daysOfWeek: selectedDays.length > 0 ? selectedDays : undefined,
        },
        {
          onSuccess: resetAndClose,
        },
      );
    }
  }

  const isLoading = createAlarm.isPending || updateAlarm.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("alarms.editTitle") : t("alarms.add")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!label.trim() || isLoading}
            isLoading={isLoading}
          >
            {isEdit ? tc("actions.save") : tc("actions.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t("alarms.label")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />

        <div className="flex gap-4">
          <div className="flex-1">
            <Input
              label={t("alarms.time")}
              type="number"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              hint="0-23"
            />
          </div>
          <span className="self-end pb-3 font-display text-2xl">:</span>
          <div className="flex-1">
            <Input
              label="&nbsp;"
              type="number"
              min={0}
              max={59}
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              hint="0-59"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("alarms.days")}</span>
          <div className="flex gap-2">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(d)}
                className={`min-w-[3rem] min-h-[3rem] rounded-md text-sm font-medium transition-colors duration-200 border ${
                  selectedDays.includes(d)
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-surface text-text border-border hover:bg-surface-elevated"
                }`}
              >
                {t(`days.${d}` as never)}
              </button>
            ))}
          </div>
          <span className="text-xs text-text-subtle">{t("alarm.noDayHint")}</span>
        </div>
      </div>
    </Modal>
  );
}
