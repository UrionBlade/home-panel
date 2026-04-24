import type { Room } from "@home-panel/shared";
import { HouseLineIcon, PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { resolveRoomIcon } from "../../lib/devices/icons";
import type { DeviceEntity } from "../../lib/devices/model";
import { useT } from "../../lib/useT";
import { DeviceTile } from "./DeviceTile";

interface RoomSectionProps {
  room: Room | null;
  devices: DeviceEntity[];
  /** When true, shows the "+ add device" affordance (for the Unassigned bucket). */
  isUnassigned?: boolean;
  onPrimary: (device: DeviceEntity) => void;
  onMenu: (device: DeviceEntity) => void;
  onEditRoom?: (room: Room) => void;
  /** Tap on an empty room → quick access to the device move sheet. */
  emptyAction?: ReactNode;
}

/**
 * One editorial block per room: big warm header with the room name and
 * its summary, followed by a uniform device grid.
 *
 * Every device tile has the same dimensions regardless of how many devices
 * a room holds — a room with one device leaves the rest of the row empty.
 * This preserves visual rhythm across rooms (a 1-device room and a 4-device
 * room read as members of the same family) and avoids tiles ballooning into
 * misshapen "stripes" that fight the grid.
 */
export function RoomSection({
  room,
  devices,
  isUnassigned,
  onPrimary,
  onMenu,
  onEditRoom,
  emptyAction,
}: RoomSectionProps) {
  const { t } = useT("casa");
  const Ico = isUnassigned ? HouseLineIcon : resolveRoomIcon(room?.icon);
  const displayName = isUnassigned
    ? t("section.unassigned.title")
    : (room?.name ?? t("section.unknown"));

  const countSummary = buildSummary(devices, t);

  /* Uniform grid: every tile has the same dimensions regardless of count.
   * A 1-device room simply leaves the trailing columns empty. */
  const gridClass = "grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.2, 0, 0, 1] }}
      className="flex flex-col gap-5"
      aria-label={displayName}
    >
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 min-w-0">
          <span
            className="flex items-center justify-center w-14 h-14 rounded-lg shrink-0"
            style={{
              backgroundColor: isUnassigned
                ? "var(--color-surface-warm)"
                : "color-mix(in oklch, var(--color-accent) 12%, var(--color-surface-elevated))",
              color: isUnassigned ? "var(--color-text-muted)" : "var(--color-accent)",
            }}
          >
            <Ico size={28} weight="duotone" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-3xl sm:text-4xl font-medium leading-[1.05] truncate">
              {displayName}
            </h2>
            <p className="label-italic text-base text-text-muted mt-0.5">{countSummary}</p>
          </div>
        </div>

        {/* Edit room: icon-only, subtle — no text label to reduce visual noise */}
        {!isUnassigned && room && onEditRoom && (
          <button
            type="button"
            onClick={() => onEditRoom(room)}
            className="flex items-center justify-center w-10 h-10 rounded-md text-text-muted opacity-60 hover:opacity-100 hover:bg-surface-warm transition-[opacity,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={t("section.edit", { name: room.name })}
          >
            <PencilSimpleIcon size={18} weight="duotone" />
          </button>
        )}
      </header>

      {devices.length === 0 ? (
        <EmptyRoom isUnassigned={isUnassigned}>{emptyAction}</EmptyRoom>
      ) : (
        <div className={gridClass}>
          {devices.map((d) => (
            <DeviceTile
              key={`${d.kind}-${d.id}`}
              device={d}
              variant="grid"
              onPrimary={() => onPrimary(d)}
              onMenu={() => onMenu(d)}
            />
          ))}
        </div>
      )}
    </motion.section>
  );
}

function EmptyRoom({ isUnassigned, children }: { isUnassigned?: boolean; children?: ReactNode }) {
  const { t } = useT("casa");
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 px-6 rounded-lg bg-surface-warm/60 border border-dashed border-border text-center">
      <PlusIcon size={24} weight="duotone" className="text-text-subtle opacity-70" />
      <p className="text-text-muted max-w-md text-sm">
        {isUnassigned ? t("section.unassigned.empty") : t("section.room.empty")}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary string                                                      */
/* ------------------------------------------------------------------ */

function buildSummary(devices: DeviceEntity[], t: ReturnType<typeof useT>["t"]): string {
  if (devices.length === 0) return t("section.summary.empty");
  /* IP cameras and Blink cameras are both "cameras" from the user's
   * perspective — merge them in the count so the summary reads
   * "2 telecamere" rather than "1 telecamera · 1 ip_camera". */
  const counts = new Map<string, number>();
  for (const d of devices) {
    const key = d.kind === "ip_camera" ? "camera" : d.kind;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [kind, n] of counts) {
    parts.push(t(`kinds.${kind}`, { count: n, defaultValue: `${n} ${kind}` }));
  }
  return parts.join(" · ");
}
