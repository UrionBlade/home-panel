import type {
  AcDevice,
  BlinkCamera,
  IpCamera,
  LaundryAppliance,
  LightSummary,
  Room,
  SmartThingsConfig,
  TvConfig,
  TvStatus,
} from "@home-panel/shared";
import type { DeviceKind } from "./icons";

/**
 * Unified view-model for any device that can appear in the Casa page.
 *
 * Every provider-specific shape (light, AC, camera, TV, appliances) is
 * projected onto this interface so the UI renders a single DeviceTile.
 * Adding a new device family is a matter of writing one more projector
 * function and wiring it into `buildHomeDevices()` — no component
 * changes required.
 */
export interface DeviceEntity {
  /** Stable identifier unique within a kind. Used as React key and as
   * the dispatch id for rename / move / toggle actions. */
  id: string;
  kind: DeviceKind;
  /** Human name shown on the tile. Falls back to a kind-specific default
   * when the provider gave nothing. */
  name: string;
  /** Null = unassigned ("Senza stanza"). Stale ids surface as orphans. */
  roomId: string | null;
  /**
   * Short status word rendered as a warm badge on the tile.
   * "on" | "off" | "running" | "paused" | "armed" | "offline" | "unknown".
   * Left abstract so the tile can style it without knowing device specifics.
   */
  status: DeviceStatus;
  /** Optional one-liner placed under the name (e.g. "22°C", "12 min alla fine"). */
  subtitle?: string;
  /** Whether the panel is allowed to rename this device locally. Provider-
   * owned names (Blink cameras, SmartThings washer/dryer) are read-only. */
  renameable: boolean;
  /** Whether the tile exposes a one-tap primary action (toggle for light/
   * ac/tv). Tiles without it are informational — tap opens details. */
  supportsToggle: boolean;
  /** Raw provider row, kept for specialised detail views that want fields
   * beyond the abstract surface. */
  raw: unknown;
}

export type DeviceStatus =
  | "on"
  | "off"
  | "running"
  | "paused"
  | "armed"
  | "disarmed"
  | "offline"
  | "unknown";

/* ------------------------------------------------------------------ */
/*  Projectors                                                         */
/* ------------------------------------------------------------------ */

export function projectLight(row: LightSummary): DeviceEntity {
  const state = row.state;
  return {
    id: row.id,
    kind: "light",
    name: row.name,
    roomId: row.roomId ?? null,
    status: state === "on" ? "on" : state === "off" ? "off" : "unknown",
    renameable: true,
    supportsToggle: true,
    raw: row,
  };
}

export function projectAc(row: AcDevice): DeviceEntity {
  const s = row.state;
  const displayName = row.nickname?.trim() || row.model?.trim() || `AC ${row.serial.slice(-4)}`;
  const subtitle =
    s && s.currentTemp != null
      ? `${Math.round(s.currentTemp)}°`
      : s
        ? `${Math.round(s.targetTemp)}°`
        : undefined;
  return {
    id: row.id,
    kind: "ac",
    name: displayName,
    roomId: row.roomId ?? null,
    status: s?.power ? "on" : s ? "off" : "unknown",
    subtitle,
    renameable: true,
    supportsToggle: true,
    raw: row,
  };
}

export function projectCamera(row: BlinkCamera): DeviceEntity {
  const st = row.status === "offline" ? "offline" : row.armed ? "armed" : "disarmed";
  return {
    id: row.id,
    kind: "camera",
    /* Nickname locale ha la precedenza sul nome Blink: così l'utente
     * può rinominare "Outdoor 4 - B9RM" in "Giardino" senza che la
     * prossima sync dal provider glielo sovrascriva. */
    name: row.nickname?.trim() || row.name,
    roomId: row.roomId ?? null,
    status: st,
    renameable: true,
    supportsToggle: false,
    raw: row,
  };
}

export function projectIpCamera(row: IpCamera): DeviceEntity {
  return {
    /* Prefisso con il kind così non collide con camera IDs di altri
     * provider se un giorno arrivassero collisioni di UUID. */
    id: `ip:${row.id}`,
    kind: "ip_camera",
    name: row.name,
    roomId: row.roomId ?? null,
    /* Le IP camera non hanno concetto di "armata": stream always-on,
     * controllato solo da enabled. Unknown quando disabilitata. */
    status: row.enabled ? "armed" : "unknown",
    renameable: true,
    supportsToggle: false,
    raw: row,
  };
}

export function projectTv(
  config: TvConfig | undefined,
  status: TvStatus | undefined,
): DeviceEntity | null {
  if (!config?.tvDeviceId) return null;
  return {
    id: config.tvDeviceId,
    kind: "tv",
    name: config.tvNickname?.trim() || "TV",
    roomId: config.tvRoomId ?? null,
    status: status?.power === "on" ? "on" : "off",
    subtitle: status?.input ?? undefined,
    renameable: true,
    supportsToggle: true,
    raw: { config, status },
  };
}

export function projectWasher(
  config: SmartThingsConfig | undefined,
  appliance: LaundryAppliance | undefined,
): DeviceEntity | null {
  if (!config?.washerDeviceId) return null;
  const state = appliance?.machineState;
  const status: DeviceStatus = state === "run" ? "running" : state === "pause" ? "paused" : "off";
  return {
    id: config.washerDeviceId,
    kind: "washer",
    name: config.washerNickname?.trim() || appliance?.name || "Lavatrice",
    roomId: config.washerRoomId ?? null,
    status,
    subtitle: appliance?.mode ?? undefined,
    renameable: true,
    supportsToggle: false,
    raw: { config, appliance },
  };
}

export function projectDryer(
  config: SmartThingsConfig | undefined,
  appliance: LaundryAppliance | undefined,
): DeviceEntity | null {
  if (!config?.dryerDeviceId) return null;
  const state = appliance?.machineState;
  const status: DeviceStatus = state === "run" ? "running" : state === "pause" ? "paused" : "off";
  return {
    id: config.dryerDeviceId,
    kind: "dryer",
    name: config.dryerNickname?.trim() || appliance?.name || "Asciugatrice",
    roomId: config.dryerRoomId ?? null,
    status,
    subtitle: appliance?.mode ?? undefined,
    renameable: true,
    supportsToggle: false,
    raw: { config, appliance },
  };
}

/* ------------------------------------------------------------------ */
/*  Grouping                                                           */
/* ------------------------------------------------------------------ */

export interface RoomWithDevices {
  room: Room | null;
  /** Stable sort: by kind order (lights → AC → TV → camera → washer/dryer),
   * then by name. */
  devices: DeviceEntity[];
}

const KIND_RANK: Record<DeviceKind, number> = {
  light: 0,
  ac: 1,
  tv: 2,
  plug: 3,
  camera: 4,
  ip_camera: 5,
  washer: 6,
  dryer: 7,
  sensor_door: 8,
  sensor_window: 9,
  siren: 10,
};

export function groupDevicesByRoom(
  rooms: Room[],
  devices: DeviceEntity[],
): { rooms: RoomWithDevices[]; unassigned: DeviceEntity[] } {
  const byRoomId = new Map<string, DeviceEntity[]>();
  const unassigned: DeviceEntity[] = [];
  for (const d of devices) {
    if (!d.roomId) {
      unassigned.push(d);
      continue;
    }
    const arr = byRoomId.get(d.roomId) ?? [];
    arr.push(d);
    byRoomId.set(d.roomId, arr);
  }
  /* Catch orphans: devices pointing at a room that no longer exists. */
  const validRoomIds = new Set(rooms.map((r) => r.id));
  for (const [rid, arr] of byRoomId) {
    if (!validRoomIds.has(rid)) {
      unassigned.push(...arr);
      byRoomId.delete(rid);
    }
  }
  for (const arr of byRoomId.values()) sortDevices(arr);
  sortDevices(unassigned);

  /* Stanze con dispositivi davanti, vuote dopo. All'interno dei due
   * gruppi manteniamo l'ordine originale (sortOrder dal DB) così
   * l'utente percepisce la sua sequenza. */
  const populated: RoomWithDevices[] = [];
  const empty: RoomWithDevices[] = [];
  for (const room of rooms) {
    const deviceList = byRoomId.get(room.id) ?? [];
    if (deviceList.length > 0) populated.push({ room, devices: deviceList });
    else empty.push({ room, devices: deviceList });
  }

  return {
    rooms: [...populated, ...empty],
    unassigned,
  };
}

function sortDevices(list: DeviceEntity[]): void {
  list.sort((a, b) => {
    const r = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (r !== 0) return r;
    return a.name.localeCompare(b.name, "it");
  });
}
