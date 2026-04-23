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
  LightbulbIcon,
  PencilSimpleIcon,
  PlantIcon,
  PlusIcon,
  ShowerIcon,
  TelevisionIcon,
  ToiletIcon,
  TrashIcon,
  VideoCameraIcon,
  WashingMachineIcon,
  WindIcon,
} from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Dropdown, type DropdownOption } from "../components/ui/Dropdown";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { useAcConfig, useAcDevices, useUpdateAcDevice } from "../lib/hooks/useAc";
import { useCameras, useUpdateCameraRoom } from "../lib/hooks/useBlink";
import { useAssignDevices, useLaundryConfig } from "../lib/hooks/useLaundry";
import { useLights, useUpdateLight } from "../lib/hooks/useLights";
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from "../lib/hooks/useRooms";
import { useTvAssign, useTvConfig } from "../lib/hooks/useTv";
import { useT } from "../lib/useT";

/**
 * Dedicated page where the user builds the map of their house: every room
 * gets a name + icon; later each device (TV, laundry, camera, AC, …) is
 * assigned to one of these rooms.
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

function RoomGlyph({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const Ico: Icon = (name ? ROOM_ICON[name] : undefined) ?? HouseLineIcon;
  return <Ico size={size} weight="duotone" className="text-accent shrink-0" />;
}

export function RoomsPage() {
  const { t } = useT("rooms");
  const { t: tCommon } = useT("common");
  const { data: rooms = [], isLoading } = useRooms();
  const [editing, setEditing] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const deleteRoom = useDeleteRoom();

  function doDelete() {
    if (!deleteTarget) return;
    deleteRoom.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
  }

  return (
    <PageContainer maxWidth="default">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button
            size="sm"
            iconLeft={<PlusIcon size={18} weight="bold" />}
            onClick={() => setCreating(true)}
          >
            {t("add")}
          </Button>
        }
      />

      {isLoading ? null : rooms.length === 0 ? (
        <EmptyState onAdd={() => setCreating(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <article
              key={room.id}
              className="relative flex items-center gap-4 rounded-md bg-surface border border-border p-4 transition-colors hover:border-accent/50"
            >
              <RoomGlyph name={room.icon} />
              <div className="flex-1 min-w-0">
                <p className="font-display text-xl truncate">{room.name}</p>
              </div>
              <div className="flex items-center gap-1">
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
              </div>
            </article>
          ))}
        </div>
      )}

      {rooms.length > 0 && <DevicesSection rooms={rooms} />}

      <RoomEditor open={creating} room={null} onClose={() => setCreating(false)} />
      <RoomEditor open={editing !== null} room={editing} onClose={() => setEditing(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={tCommon("actions.confirm")}
        message={t("confirmDelete", { name: deleteTarget?.name ?? "" })}
        confirmLabel={tCommon("actions.delete")}
        destructive
        isLoading={deleteRoom.isPending}
        onConfirm={doDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/*  Devices section — assign each configured device to a room           */
/* ------------------------------------------------------------------ */
function DevicesSection({ rooms }: { rooms: Room[] }) {
  const { t } = useT("rooms");
  const { data: cameras = [] } = useCameras();
  const { data: lights = [] } = useLights();
  const { data: tvConfig } = useTvConfig();
  const { data: laundryConfig } = useLaundryConfig();
  const { data: acConfig } = useAcConfig();
  const { data: acDevices = [] } = useAcDevices(acConfig?.configured ?? false);

  const updateCamera = useUpdateCameraRoom();
  const updateLight = useUpdateLight();
  const assignLaundry = useAssignDevices();
  const assignTv = useTvAssign();
  const updateAc = useUpdateAcDevice();

  const roomOptions: DropdownOption[] = useMemo(
    () => [
      { value: "", label: t("unassigned") },
      ...rooms.map((r) => ({ value: r.id, label: r.name })),
    ],
    [rooms, t],
  );

  const hasTv = !!tvConfig?.tvDeviceId;
  const hasWasher = !!laundryConfig?.washerDeviceId;
  const hasDryer = !!laundryConfig?.dryerDeviceId;
  const hasAc = acDevices.length > 0;
  const hasAny = cameras.length > 0 || lights.length > 0 || hasTv || hasWasher || hasDryer || hasAc;

  if (!hasAny) {
    return (
      <section className="flex flex-col gap-3 pt-6 border-t border-border/60">
        <h2 className="font-display text-2xl">{t("devices")}</h2>
        <p className="text-sm text-text-muted italic">{t("devicesEmpty")}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 pt-6 border-t border-border/60">
      <div>
        <h2 className="font-display text-2xl">{t("devices")}</h2>
        <p className="text-sm text-text-muted mt-1">{t("devicesHint")}</p>
      </div>

      {cameras.length > 0 && (
        <DeviceGroup
          icon={<VideoCameraIcon size={18} weight="duotone" />}
          title={t("groups.cameras")}
        >
          {cameras.map((cam) => (
            <DeviceRow
              key={cam.id}
              label={cam.name}
              value={cam.roomId ?? ""}
              options={roomOptions}
              disabled={updateCamera.isPending}
              onChange={(v) => updateCamera.mutate({ id: cam.id, roomId: v || null })}
            />
          ))}
        </DeviceGroup>
      )}

      {lights.length > 0 && (
        <DeviceGroup icon={<LightbulbIcon size={18} weight="duotone" />} title={t("groups.lights")}>
          {lights.map((light) => (
            <DeviceRow
              key={light.id}
              label={light.name}
              value={light.roomId ?? ""}
              options={roomOptions}
              disabled={updateLight.isPending}
              onChange={(v) => updateLight.mutate({ id: light.id, input: { roomId: v || null } })}
            />
          ))}
        </DeviceGroup>
      )}

      {hasAc && (
        <DeviceGroup icon={<WindIcon size={18} weight="duotone" />} title={t("groups.ac")}>
          {acDevices.map((ac) => (
            <DeviceRow
              key={ac.id}
              icon={<WindIcon size={16} weight="duotone" />}
              label={ac.nickname?.trim() || ac.model?.trim() || ac.serial}
              value={ac.roomId ?? ""}
              options={roomOptions}
              disabled={updateAc.isPending}
              onChange={(v) => updateAc.mutate({ id: ac.id, roomId: v || null })}
            />
          ))}
        </DeviceGroup>
      )}

      {(hasWasher || hasDryer || hasTv) && (
        <DeviceGroup
          icon={<WashingMachineIcon size={18} weight="duotone" />}
          title={t("groups.smartthings")}
        >
          {hasWasher && (
            <DeviceRow
              icon={<WashingMachineIcon size={16} weight="duotone" />}
              label={t("labels.washer")}
              value={laundryConfig?.washerRoomId ?? ""}
              options={roomOptions}
              disabled={assignLaundry.isPending}
              onChange={(v) => assignLaundry.mutate({ washerRoomId: v || null })}
            />
          )}
          {hasDryer && (
            <DeviceRow
              icon={<WindIcon size={16} weight="duotone" />}
              label={t("labels.dryer")}
              value={laundryConfig?.dryerRoomId ?? ""}
              options={roomOptions}
              disabled={assignLaundry.isPending}
              onChange={(v) => assignLaundry.mutate({ dryerRoomId: v || null })}
            />
          )}
          {hasTv && (
            <DeviceRow
              icon={<TelevisionIcon size={16} weight="duotone" />}
              label={t("labels.tv")}
              value={tvConfig?.tvRoomId ?? ""}
              options={roomOptions}
              disabled={assignTv.isPending}
              onChange={(v) => assignTv.mutate({ tvRoomId: v || null })}
            />
          )}
        </DeviceGroup>
      )}
    </section>
  );
}

function DeviceGroup({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-md bg-surface border border-border">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-text-muted">
        <span className="text-accent">{icon}</span>
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function DeviceRow({
  icon,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  options: DropdownOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 min-w-0 flex items-center gap-2 font-medium truncate">
        {icon ? <span className="shrink-0 text-text-muted">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </span>
      <div className="w-44 sm:w-56">
        <Dropdown
          options={options}
          value={value}
          onChange={onChange}
          disabled={disabled}
          align="right"
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty-state invite                                                  */
/* ------------------------------------------------------------------ */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useT("rooms");
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center rounded-lg bg-surface-warm/50 border border-border/60">
      <HouseLineIcon size={48} weight="duotone" className="text-text-subtle opacity-70" />
      <p className="text-text-muted max-w-md">{t("empty")}</p>
      <Button onClick={onAdd} iconLeft={<PlusIcon size={18} weight="bold" />}>
        {t("add")}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editor modal                                                        */
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
  const { t } = useT("rooms");
  const { t: tCommon } = useT("common");
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>("generic");

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
      title={isEdit ? t("edit") : t("add")}
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
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          autoFocus
          required
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">{t("icon")}</span>
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
