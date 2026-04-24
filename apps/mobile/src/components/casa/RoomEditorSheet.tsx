import type { Room } from "@home-panel/shared";
import { TrashIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { ROOM_ICON, ROOM_ICON_KEYS, type RoomIconKey } from "../../lib/devices/icons";
import { useCreateRoom, useDeleteRoom, useUpdateRoom } from "../../lib/hooks/useRooms";
import { useT } from "../../lib/useT";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input } from "../ui/Input";
import { BottomSheet } from "./BottomSheet";

interface RoomEditorSheetProps {
  open: boolean;
  /** Null → create mode. */
  room: Room | null;
  onClose: () => void;
}

/**
 * Sheet per creare o modificare una stanza. Include selezione icona
 * dal palette noto e azione di cancellazione (solo in edit mode).
 */
export function RoomEditorSheet({ open, room, onClose }: RoomEditorSheetProps) {
  const { t } = useT("casa");
  const { t: tCommon } = useT("common");

  const create = useCreateRoom();
  const update = useUpdateRoom();
  const del = useDeleteRoom();

  const [name, setName] = useState("");
  const [icon, setIcon] = useState<RoomIconKey>("generic");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(room?.name ?? "");
    setIcon((room?.icon as RoomIconKey) ?? "generic");
  }, [open, room]);

  const isEdit = room !== null;
  const pending = create.isPending || update.isPending || del.isPending;

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (isEdit) {
      update.mutate({ id: room.id, input: { name: trimmed, icon } }, { onSuccess: onClose });
    } else {
      create.mutate({ name: trimmed, icon }, { onSuccess: onClose });
    }
  };

  const handleDelete = () => {
    if (!room) return;
    del.mutate(room.id, {
      onSettled: () => {
        setConfirmDelete(false);
        onClose();
      },
    });
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title={isEdit ? t("editor.room.editTitle") : t("editor.room.createTitle")}
        subtitle={t("editor.room.subtitle")}
        footer={
          <>
            {isEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
                className="mr-auto !text-danger"
                iconLeft={<TrashIcon size={16} weight="duotone" />}
              >
                {tCommon("actions.delete")}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
              {tCommon("actions.cancel")}
            </Button>
            <Button size="sm" isLoading={pending} onClick={() => handleSubmit()}>
              {tCommon("actions.save")}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-2">
          <Input
            label={t("editor.room.nameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("editor.room.namePlaceholder")}
            autoFocus
            required
          />
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-muted">
              {t("editor.room.iconLabel")}
            </span>
            <div className="grid grid-cols-6 sm:grid-cols-7 md:grid-cols-8 gap-2">
              {ROOM_ICON_KEYS.map((key) => {
                const Ico = ROOM_ICON[key];
                const selected = icon === key;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setIcon(key)}
                    aria-pressed={selected}
                    aria-label={t(`roomIcons.${key}`, { defaultValue: key })}
                    className={`aspect-square flex items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
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
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete}
        title={tCommon("actions.confirm")}
        message={t("editor.room.confirmDelete", { name: room?.name ?? "" })}
        confirmLabel={tCommon("actions.delete")}
        destructive
        isLoading={del.isPending}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
