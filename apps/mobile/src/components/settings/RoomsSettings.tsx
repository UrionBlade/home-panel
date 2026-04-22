import type { Room } from "@home-panel/shared";
import {
  ArmchairIcon,
  BathtubIcon,
  BedIcon,
  CookingPotIcon,
  DesktopTowerIcon,
  DoorIcon,
  HouseLineIcon,
  type Icon,
  PencilSimpleIcon,
  PlantIcon,
  PlusIcon,
  ShowerIcon,
  TelevisionIcon,
  ToiletIcon,
  TrashIcon,
  WashingMachineIcon,
} from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from "../../lib/hooks/useRooms";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";

/**
 * Palette of icons the user can assign to a room. Stored in DB as the key
 * string (e.g. `"bed"`) — `ROOM_ICON` below is the render map. Adding a new
 * icon is a pure frontend change, no schema migration.
 */
const ROOM_ICON: Record<string, Icon> = {
  bed: BedIcon,
  couch: ArmchairIcon,
  tv: TelevisionIcon,
  kitchen: CookingPotIcon,
  bath: BathtubIcon,
  shower: ShowerIcon,
  toilet: ToiletIcon,
  laundry: WashingMachineIcon,
  office: DesktopTowerIcon,
  garden: PlantIcon,
  entry: DoorIcon,
  generic: HouseLineIcon,
};

const ICON_ORDER: string[] = [
  "bed",
  "couch",
  "tv",
  "kitchen",
  "bath",
  "shower",
  "toilet",
  "laundry",
  "office",
  "garden",
  "entry",
  "generic",
];

function RoomIcon({ name, size = 22 }: { name: string | null | undefined; size?: number }) {
  const Ico: Icon = (name ? ROOM_ICON[name] : undefined) ?? HouseLineIcon;
  return <Ico size={size} weight="duotone" className="text-accent shrink-0" />;
}

export function RoomsSettings() {
  const { t } = useT("settings");
  const { t: tCommon } = useT("common");
  const { data: rooms = [], isLoading } = useRooms();
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const deleteRoom = useDeleteRoom();

  function doDelete() {
    if (!deleteTarget) return;
    deleteRoom.mutate(deleteTarget.id, {
      onSettled: () => setDeleteTarget(null),
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl">{t("sections.rooms")}</h2>
          <p className="text-sm text-text-muted mt-1">{t("rooms.hint")}</p>
        </div>
        <Button
          size="sm"
          iconLeft={<PlusIcon size={18} weight="bold" />}
          onClick={() => setCreating(true)}
        >
          {t("rooms.add")}
        </Button>
      </div>

      {isLoading ? null : rooms.length === 0 ? (
        <p className="text-sm text-text-muted italic">{t("rooms.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="flex items-center gap-3 px-4 py-3 rounded-md bg-surface border border-border"
            >
              <RoomIcon name={room.icon} />
              <span className="flex-1 font-medium truncate">{room.name}</span>
              <button
                type="button"
                aria-label={tCommon("actions.edit")}
                onClick={() => setEditing(room)}
                className="p-2 rounded-md text-text-muted hover:text-text hover:bg-surface-warm transition-colors"
              >
                <PencilSimpleIcon size={18} weight="duotone" />
              </button>
              <button
                type="button"
                aria-label={tCommon("actions.delete")}
                onClick={() => setDeleteTarget(room)}
                className="p-2 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <TrashIcon size={18} weight="duotone" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <RoomEditor open={creating} room={null} onClose={() => setCreating(false)} />
      <RoomEditor open={editing !== null} room={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={tCommon("actions.confirm")}
        message={t("rooms.confirmDelete", { name: deleteTarget?.name ?? "" })}
        confirmLabel={tCommon("actions.delete")}
        destructive
        isLoading={deleteRoom.isPending}
        onConfirm={doDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal: create or edit a room                                       */
/* ------------------------------------------------------------------ */
function RoomEditor({
  open,
  room,
  onClose,
}: {
  open: boolean;
  room: Room | null;
  onClose: () => void;
}) {
  const { t } = useT("settings");
  const { t: tCommon } = useT("common");
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("generic");

  /* Reset form whenever the dialog opens with a different target. */
  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? "");
    setIcon(room?.icon ?? "generic");
  }, [open, room]);

  const isEdit = room !== null;
  const pending = create.isPending || update.isPending;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isEdit) {
      update.mutate({ id: room.id, input: { name: trimmed, icon } }, { onSuccess: onClose });
    } else {
      create.mutate({ name: trimmed, icon }, { onSuccess: onClose });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t("rooms.edit") : t("rooms.add")}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            {tCommon("actions.cancel")}
          </Button>
          <Button size="sm" isLoading={pending} onClick={handleSubmit}>
            {tCommon("actions.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label={t("rooms.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("rooms.namePlaceholder")}
          autoFocus
          required
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("rooms.icon")}</span>
          <div className="grid grid-cols-6 sm:grid-cols-7 gap-2">
            {ICON_ORDER.map((key) => {
              const Ico = ROOM_ICON[key];
              const selected = icon === key;
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setIcon(key)}
                  aria-pressed={selected}
                  className={`aspect-square flex items-center justify-center rounded-md border transition-colors ${
                    selected
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-surface text-text-muted hover:border-accent/60"
                  }`}
                >
                  <Ico size={22} weight="duotone" />
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
