import type { Alarm } from "@home-panel/shared";
import { BellIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { TimerArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { ActiveTimers } from "../components/timers/ActiveTimers";
import { AlarmList } from "../components/timers/AlarmList";
import { CreateAlarmModal } from "../components/timers/CreateAlarmModal";
import { CustomTimerModal } from "../components/timers/CustomTimerModal";
import { QuickTimerButtons } from "../components/timers/QuickTimerButtons";
import { useT } from "../lib/useT";

export function TimerPage() {
  const { t } = useT("timers");
  const [customOpen, setCustomOpen] = useState(false);
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);

  function handleEditAlarm(alarm: Alarm) {
    setEditingAlarm(alarm);
    setAlarmOpen(true);
  }

  function handleCloseAlarmModal() {
    setAlarmOpen(false);
    setEditingAlarm(null);
  }

  function handleNewAlarm() {
    setEditingAlarm(null);
    setAlarmOpen(true);
  }

  return (
    <PageContainer>
      <PageHeader title={t("title")} subtitle={t("subtitle")} artwork={<TimerArt size={96} />} />

      <ActiveTimers />

      <QuickTimerButtons onCustom={() => setCustomOpen(true)} />

      {/* Alarms */}
      <section className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellIcon size={22} weight="duotone" className="text-accent" />
            <h2 className="font-display text-2xl tracking-tight">{t("alarms.title")}</h2>
          </div>
          <button
            type="button"
            onClick={handleNewAlarm}
            className="text-sm font-medium text-accent hover:underline min-h-[2.5rem] px-3"
          >
            {t("alarms.add")}
          </button>
        </header>
        <AlarmList onEdit={handleEditAlarm} />
      </section>

      <CustomTimerModal open={customOpen} onClose={() => setCustomOpen(false)} />
      <CreateAlarmModal open={alarmOpen} onClose={handleCloseAlarmModal} alarm={editingAlarm} />
    </PageContainer>
  );
}
