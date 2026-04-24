import type { CalendarEvent, EventInstance } from "@home-panel/shared";
import { PlusIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import { useState } from "react";
import { AgendaView } from "../components/calendar/AgendaView";
import { EventForm } from "../components/calendar/EventForm";
import { MonthView } from "../components/calendar/MonthView";
import { TodayView } from "../components/calendar/TodayView";
import { CalendarArt } from "../components/illustrations/TileArt";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { useCreateEvent, useDeleteEvent, useUpdateEvent } from "../lib/hooks/useCalendar";
import { useT } from "../lib/useT";

type CalendarSection = "calendar" | "agenda";
type CalendarView = "today" | "month";

function instanceToEvent(inst: EventInstance): CalendarEvent {
  const { instanceStartsAt, instanceEndsAt, ...rest } = inst;
  void instanceStartsAt;
  void instanceEndsAt;
  return rest as CalendarEvent;
}

export function CalendarPage() {
  const { t } = useT("calendar");
  const [section, setSection] = useState<CalendarSection>("calendar");
  const [view, setView] = useState<CalendarView>("today");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const createMutation = useCreateEvent();
  const updateMutation = useUpdateEvent();
  const deleteMutation = useDeleteEvent();

  const handleEventClick = (inst: EventInstance) => {
    setEditing(instanceToEvent(inst));
  };

  return (
    <PageContainer maxWidth="wide">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        artwork={<CalendarArt size={96} />}
        actions={
          <Button iconLeft={<PlusIcon size={20} weight="bold" />} onClick={() => setCreating(true)}>
            {t("actions.addEvent")}
          </Button>
        }
      />

      {/* Main section: Calendar vs Agenda (two distinct views) */}
      <div
        role="tablist"
        aria-label={t("aria.section")}
        className="flex gap-1 p-1 bg-surface border border-border rounded-lg self-start"
      >
        <button
          role="tab"
          aria-selected={section === "calendar"}
          type="button"
          onClick={() => setSection("calendar")}
          className={clsx(
            "px-5 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[2.75rem]",
            section === "calendar"
              ? "bg-surface-elevated text-text shadow-sm"
              : "text-text-muted hover:text-text",
          )}
        >
          {t("title")}
        </button>
        <button
          role="tab"
          aria-selected={section === "agenda"}
          type="button"
          onClick={() => setSection("agenda")}
          className={clsx(
            "px-5 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[2.75rem]",
            section === "agenda"
              ? "bg-surface-elevated text-text shadow-sm"
              : "text-text-muted hover:text-text",
          )}
        >
          {t("views.agenda")}
        </button>
      </div>

      {/* Calendar sub-views: Today / Month */}
      {section === "calendar" && (
        <>
          <div
            role="tablist"
            aria-label={t("aria.view")}
            className="flex gap-2 border-b border-border"
          >
            <button
              role="tab"
              aria-selected={view === "today"}
              type="button"
              onClick={() => setView("today")}
              className={clsx(
                "px-4 py-3 -mb-px border-b-2 text-sm font-medium transition-colors",
                view === "today"
                  ? "border-accent text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {t("views.today")}
            </button>
            <button
              role="tab"
              aria-selected={view === "month"}
              type="button"
              onClick={() => setView("month")}
              className={clsx(
                "px-4 py-3 -mb-px border-b-2 text-sm font-medium transition-colors",
                view === "month"
                  ? "border-accent text-text"
                  : "border-transparent text-text-muted hover:text-text",
              )}
            >
              {t("views.month")}
            </button>
          </div>
          <section className="min-h-[25rem]">
            {view === "today" && (
              <TodayView onEventClick={handleEventClick} onCreateEvent={() => setCreating(true)} />
            )}
            {view === "month" && <MonthView onEventClick={handleEventClick} />}
          </section>
        </>
      )}

      {section === "agenda" && (
        <section className="min-h-[25rem]">
          <AgendaView onEventClick={handleEventClick} />
        </section>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={t("actions.addEvent")}>
        <EventForm
          onCancel={() => setCreating(false)}
          isSubmitting={createMutation.isPending}
          onSubmit={(input) =>
            createMutation.mutate(input, {
              onSuccess: () => setCreating(false),
            })
          }
        />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("actions.edit")}>
        {editing && (
          <EventForm
            initialEvent={editing}
            onCancel={() => setEditing(null)}
            isSubmitting={updateMutation.isPending}
            isDeleting={deleteMutation.isPending}
            onSubmit={(input) =>
              updateMutation.mutate(
                { id: editing.id, input },
                { onSuccess: () => setEditing(null) },
              )
            }
            onDelete={() =>
              deleteMutation.mutate(editing.id, {
                onSuccess: () => setEditing(null),
              })
            }
          />
        )}
      </Modal>
    </PageContainer>
  );
}
