import { useState } from "react";
import { useCreateTimer } from "../../lib/hooks/useTimers";
import { primeAudio } from "../../lib/timers/alertSound";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

interface CustomTimerModalProps {
  open: boolean;
  onClose: () => void;
}

export function CustomTimerModal({ open, onClose }: CustomTimerModalProps) {
  const { t } = useT("timers");
  const { t: tc } = useT("common");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");
  const [label, setLabel] = useState("");
  const createTimer = useCreateTimer();

  function reset() {
    setHours("");
    setMinutes("");
    setSeconds("");
    setLabel("");
  }

  const totalSeconds =
    (parseInt(hours, 10) || 0) * 3600 +
    (parseInt(minutes, 10) || 0) * 60 +
    (parseInt(seconds, 10) || 0);

  function handleSubmit() {
    if (totalSeconds <= 0) return;
    primeAudio();
    createTimer.mutate(
      {
        durationSeconds: totalSeconds,
        label: label.trim() || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  }

  function formatPreview(): string {
    if (totalSeconds <= 0) return "—";
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0) parts.push(`${s}s`);
    return parts.join(" ");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("timers.setTimer")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {tc("actions.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={totalSeconds <= 0}
            isLoading={createTimer.isPending}
          >
            {tc("actions.confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Input
            label={t("timers.hours")}
            type="number"
            min={0}
            max={23}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            autoFocus
          />
          <Input
            label={t("timers.minutes")}
            type="number"
            min={0}
            max={59}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
          />
          <Input
            label={t("timers.seconds")}
            type="number"
            min={0}
            max={59}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
          />
        </div>

        <div className="text-center">
          <span className="text-sm text-text-muted">Totale: </span>
          <span className="font-display text-2xl tabular-nums text-text">{formatPreview()}</span>
        </div>

        <Input
          label={t("alarms.label")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("timer.labelPlaceholder")}
        />
      </div>
    </Modal>
  );
}
