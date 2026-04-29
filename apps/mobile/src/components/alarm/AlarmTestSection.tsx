/**
 * Test trigger for the home alarm. Pressing the button fires the same
 * code path a real sensor opening would: the API records a "manual"
 * event, sends APNs push, and broadcasts the trigger over SSE — which
 * means the AlarmAlertOverlay opens with its keypad. Stopping the
 * siren is intentionally NOT a button here: the user has to enter
 * their disarm code to silence it, just like in a real incident.
 */

import { LightningIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useAlarmTest } from "../../lib/hooks/useAlarm";
import { useT } from "../../lib/useT";

export function AlarmTestSection() {
  const { t } = useT("alarm");
  const test = useAlarmTest();
  const [feedback, setFeedback] = useState<string | null>(null);

  const onTrigger = async () => {
    setFeedback(null);
    try {
      const res = await test.mutateAsync();
      setFeedback(res.fired === 0 ? t("test.noSiren") : t("test.triggered", { n: res.fired }));
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "errore");
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <LightningIcon size={26} weight="duotone" className="text-amber-500 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl">{t("test.title")}</h2>
          <p className="text-sm text-text-muted">{t("test.description")}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onTrigger}
        disabled={test.isPending}
        className="self-start rounded-lg bg-rose-500 text-white font-medium px-4 py-2.5 hover:bg-rose-600 disabled:opacity-50"
      >
        {t("test.trigger")}
      </button>

      {feedback && <p className="text-sm text-text-muted">{feedback}</p>}
    </section>
  );
}
