import type { CalendarEvent, CreateEventInput } from "@home-panel/shared";
import { type FormEvent, useState } from "react";
import { useEventCategories } from "../../lib/hooks/useCalendar";
import { useFamilyMembers } from "../../lib/hooks/useFamily";
import { useT } from "../../lib/useT";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

interface EventFormProps {
  /** When provided, the form is pre-filled in edit mode */
  initialEvent?: CalendarEvent;
  initialDate?: Date;
  onSubmit: (input: CreateEventInput) => void;
  onDelete?: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  isDeleting?: boolean;
}

function toLocalInput(d: Date): string {
  // Returns a local datetime string in YYYY-MM-DDTHH:mm format
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EventForm({
  initialEvent,
  initialDate,
  onSubmit,
  onDelete,
  onCancel,
  isSubmitting,
  isDeleting,
}: EventFormProps) {
  const { t } = useT("calendar");
  const { t: tCommon } = useT("common");
  const { data: members = [] } = useFamilyMembers();
  const { data: categories = [] } = useEventCategories();

  const isEdit = !!initialEvent;
  const baseStart = initialEvent ? new Date(initialEvent.startsAt) : (initialDate ?? new Date());
  const baseEnd = initialEvent
    ? new Date(initialEvent.endsAt)
    : new Date(baseStart.getTime() + 60 * 60 * 1000);

  const [title, setTitle] = useState(initialEvent?.title ?? "");
  const [description, setDescription] = useState(initialEvent?.description ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(baseStart));
  const [endsAt, setEndsAt] = useState(toLocalInput(baseEnd));
  const [allDay, setAllDay] = useState(initialEvent?.allDay ?? false);
  const [location, setLocation] = useState(initialEvent?.location ?? "");
  const [categoryId, setCategoryId] = useState<string>(initialEvent?.categoryId ?? "");
  const [attendeeIds, setAttendeeIds] = useState<string[]>(
    initialEvent?.attendees.map((a) => a.id) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError(t("errors.titleRequired"));
      return;
    }
    if (new Date(endsAt) < new Date(startsAt)) {
      setError(t("errors.endBeforeStart"));
      return;
    }
    setError(null);
    onSubmit({
      title: title.trim(),
      description: description || null,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      allDay,
      location: location || null,
      categoryId: categoryId || null,
      attendeeIds,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        label={t("fields.title")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        required
        error={error ?? undefined}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label={t("fields.startsAt")}
          type="datetime-local"
          value={startsAt}
          onChange={(e) => {
            const newStart = e.target.value;
            const oldDuration = new Date(endsAt).getTime() - new Date(startsAt).getTime();
            setStartsAt(newStart);
            const newEnd = new Date(new Date(newStart).getTime() + oldDuration);
            setEndsAt(toLocalInput(newEnd));
          }}
        />
        <Input
          label={t("fields.endsAt")}
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="w-5 h-5 accent-accent"
        />
        <span>{t("fields.allDay")}</span>
      </label>

      <Input
        label={t("fields.location")}
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      <Select
        label={t("fields.category")}
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        options={[
          { value: "", label: "—" },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      <div>
        <p className="text-sm font-medium text-text-muted mb-2">{t("fields.attendees")}</p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const selected = attendeeIds.includes(m.id);
            const color = m.accentColor ?? "var(--color-accent)";
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggleAttendee(m.id)}
                className="flex items-center gap-2 px-3 py-2 rounded-md border transition-all duration-150"
                style={{
                  borderColor: selected ? color : "var(--color-border)",
                  backgroundColor: selected
                    ? `color-mix(in oklch, ${color} 12%, transparent)`
                    : "var(--color-surface)",
                  boxShadow: selected ? `0 0 0 1px ${color}` : "none",
                }}
              >
                <Avatar
                  name={m.displayName}
                  imageUrl={m.avatarUrl}
                  accentColor={m.accentColor}
                  size="sm"
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: selected ? color : undefined }}
                >
                  {m.displayName}
                </span>
                {m.kind === "pet" && <span className="text-[10px] text-text-subtle">🐾</span>}
              </button>
            );
          })}
        </div>
      </div>

      <Input
        label={t("fields.description")}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <div className="flex justify-between items-center gap-3 pt-2">
        <div>
          {isEdit && onDelete && (
            <Button
              variant="ghost"
              type="button"
              onClick={onDelete}
              isLoading={isDeleting}
              className="text-danger"
            >
              {tCommon("actions.delete")}
            </Button>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" type="button" onClick={onCancel}>
            {tCommon("actions.cancel")}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {isEdit ? tCommon("actions.save") : t("createEvent")}
          </Button>
        </div>
      </div>
    </form>
  );
}
