import type { Alarm } from "@home-panel/shared";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useAlarms, useDeleteAlarm, useUpdateAlarm } from "../../lib/hooks/useTimers";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface AlarmListProps {
  onEdit?: (alarm: Alarm) => void;
}

export function AlarmList({ onEdit }: AlarmListProps) {
  const { t } = useT("timers");
  const { data: alarms = [] } = useAlarms();
  const deleteAlarm = useDeleteAlarm();
  const updateAlarm = useUpdateAlarm();

  if (alarms.length === 0) {
    return <p className="text-text-muted">{t("alarms.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {alarms.map((alarm) => (
        <div
          key={alarm.id}
          className="flex items-center gap-4 rounded-md border border-border bg-surface-elevated p-5"
        >
          {/* Ora */}
          <span className="font-display text-3xl tabular-nums leading-none min-w-[5rem]">
            {pad2(alarm.hour)}:{pad2(alarm.minute)}
          </span>

          {/* Label + days */}
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <span className="font-medium truncate">{alarm.label}</span>
            {alarm.daysOfWeek.length > 0 ? (
              <span className="text-xs text-text-muted">
                {alarm.daysOfWeek.map((d) => t(`days.${d}` as never)).join(", ")}
              </span>
            ) : (
              <span className="text-xs text-text-subtle">Singola</span>
            )}
          </div>

          {/* Toggle */}
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={alarm.enabled}
              onChange={() =>
                updateAlarm.mutate({
                  id: alarm.id,
                  input: { enabled: !alarm.enabled },
                })
              }
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent rounded-full peer peer-checked:bg-accent transition-colors duration-200 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>

          {/* Edit */}
          {onEdit && (
            <Button
              variant="icon"
              size="sm"
              onClick={() => onEdit(alarm)}
              aria-label={t("alarms.edit")}
            >
              <PencilSimpleIcon size={20} weight="duotone" />
            </Button>
          )}

          {/* Delete */}
          <Button
            variant="icon"
            size="sm"
            onClick={() => deleteAlarm.mutate(alarm.id)}
            aria-label={t("alarms.delete")}
          >
            <TrashIcon size={20} weight="duotone" />
          </Button>
        </div>
      ))}
    </div>
  );
}
