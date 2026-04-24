import type { Room } from "@home-panel/shared";
import { CheckIcon, HouseLineIcon, XIcon } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { resolveDeviceIcon, resolveRoomIcon } from "../../lib/devices/icons";
import type { DeviceEntity } from "../../lib/devices/model";
import { useDeviceActions } from "../../lib/devices/useHomeDevices";
import { useT } from "../../lib/useT";
import { useUiStore } from "../../store/ui-store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { BottomSheet } from "./BottomSheet";

interface DeviceEditorSheetProps {
  open: boolean;
  device: DeviceEntity | null;
  rooms: Room[];
  onClose: () => void;
}

/**
 * Sheet contestuale di un singolo device: mostra icona + nome, permette
 * di rinominarlo (dove il provider lo consente) e di spostarlo in una
 * nuova stanza. Niente dropdown — pulsanti grandi per ogni stanza,
 * molto più comodi di un <select> sul divano.
 */
export function DeviceEditorSheet({ open, device, rooms, onClose }: DeviceEditorSheetProps) {
  const { t } = useT("casa");
  const { t: tCommon } = useT("common");
  const actions = useDeviceActions();
  const pushToast = useUiStore((s) => s.pushToast);

  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !device) return;
    setName(device.name);
    setRoomId(device.roomId);
  }, [open, device]);

  if (!device) return null;
  const Ico = resolveDeviceIcon(device.kind);

  const kindLabel = t(`kinds.${device.kind}`, { count: 1, defaultValue: device.kind });
  const dirty = name.trim() !== device.name || roomId !== device.roomId;
  const canSave = dirty && !saving && name.trim().length > 0;

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (device.renameable && trimmed !== device.name) {
        await actions.rename(device, trimmed);
      }
      if (roomId !== device.roomId) {
        await actions.moveTo(device, roomId);
      }
      onClose();
    } catch (err) {
      pushToast({
        tone: "danger",
        text: err instanceof Error ? err.message : t("editor.device.saveError"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={device.name}
      subtitle={kindLabel}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            {tCommon("actions.cancel")}
          </Button>
          <Button size="sm" isLoading={saving} disabled={!canSave} onClick={() => handleSubmit()}>
            {tCommon("actions.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 py-2">
        <div className="flex items-center gap-4">
          <span
            className="w-16 h-16 flex items-center justify-center rounded-lg shrink-0"
            style={{
              backgroundColor:
                "color-mix(in oklch, var(--color-accent) 12%, var(--color-surface-warm))",
              color: "var(--color-accent)",
            }}
          >
            <Ico size={32} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl truncate">{device.name}</p>
            <p className="label-italic text-sm text-text-muted">{kindLabel}</p>
          </div>
        </div>

        <Input
          label={t("editor.device.nameLabel")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!device.renameable}
          hint={device.renameable ? undefined : t("editor.device.nameLocked")}
          placeholder={t("editor.device.namePlaceholder")}
          autoFocus={device.renameable}
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">
            {t("editor.device.roomLabel")}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <RoomOption
              selected={roomId === null}
              onClick={() => setRoomId(null)}
              icon={<HouseLineIcon size={20} weight="duotone" />}
              label={t("editor.device.unassigned")}
              muted
            />
            {rooms.map((r) => {
              const RIco = resolveRoomIcon(r.icon);
              return (
                <RoomOption
                  key={r.id}
                  selected={roomId === r.id}
                  onClick={() => setRoomId(r.id)}
                  icon={<RIco size={20} weight="duotone" />}
                  label={r.name}
                />
              );
            })}
          </div>
        </div>

        {/* Hidden submit so Enter from the Input saves */}
        <button type="submit" className="hidden" tabIndex={-1} aria-hidden />
      </form>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Room option button                                                  */
/* ------------------------------------------------------------------ */

function RoomOption({
  selected,
  onClick,
  icon,
  label,
  muted,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={[
        "flex items-center gap-2.5 px-3 py-3 rounded-md min-h-[3rem] text-left",
        "border transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected
          ? "bg-accent/12 border-accent text-accent"
          : muted
            ? "bg-surface-warm/60 border-border border-dashed text-text-muted hover:border-accent/50 hover:text-text"
            : "bg-surface border-border text-text hover:border-accent/50",
      ].join(" ")}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {selected ? (
        <CheckIcon size={16} weight="bold" className="shrink-0" />
      ) : (
        <XIcon size={0} aria-hidden className="w-0 opacity-0" />
      )}
    </button>
  );
}
