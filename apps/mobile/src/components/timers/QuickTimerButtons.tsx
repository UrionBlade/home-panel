import { useCreateTimer } from "../../lib/hooks/useTimers";
import { primeAudio } from "../../lib/timers/alertSound";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";

const QUICK_OPTIONS = [1, 3, 5, 10, 15, 30] as const;

interface QuickTimerButtonsProps {
  onCustom: () => void;
}

export function QuickTimerButtons({ onCustom }: QuickTimerButtonsProps) {
  const { t } = useT("timers");
  const createTimer = useCreateTimer();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {QUICK_OPTIONS.map((mins) => (
        <Button
          key={mins}
          variant="ghost"
          size="sm"
          onClick={() => {
            primeAudio();
            createTimer.mutate({ durationSeconds: mins * 60 });
          }}
        >
          {t(`quick.${mins}` as never)}
        </Button>
      ))}
      <button
        type="button"
        onClick={onCustom}
        className="text-sm text-accent hover:underline min-h-[2.5rem] px-1"
      >
        {t("timers.customLink")}
      </button>
    </div>
  );
}
