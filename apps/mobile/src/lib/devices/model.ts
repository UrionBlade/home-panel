import type {
  AcDevice,
  BlinkCamera,
  EnvSensor,
  IpCamera,
  LaundryAppliance,
  LeakSensor,
  LightSummary,
  Room,
  SmartThingsConfig,
  TvConfig,
  TvStatus,
  ZigbeeDevice,
} from "@home-panel/shared";
import { i18next } from "../i18n";
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
  sensor_air: 11,
  sensor_climate: 12,
  sensor_leak: 13,
};

/**
 * Projector for paired Zigbee devices (Aqara contact sensors, Heiman
 * sirens, smart plugs, …). The Z2M definition is opaque enough that we
 * heuristically pick a `DeviceKind` from description / model: anything
 * with a "window" hint becomes `sensor_window`, sirens map to `siren`,
 * plugs to `plug`, everything else with a `contact` payload defaults to
 * `sensor_door`. Renames and room moves go through the home-panel API,
 * not directly to Z2M, so the user can pick a friendly Italian name
 * without re-pairing the device.
 */
export function projectZigbee(row: ZigbeeDevice): DeviceEntity {
  const desc = (row.description ?? "").toLowerCase();
  const model = (row.model ?? "").toLowerCase();
  const state = row.state as Record<string, unknown>;

  /* If the user picked an explicit kind from the editor, honour it. */
  const overrideOk =
    row.kindOverride === "sensor_door" ||
    row.kindOverride === "sensor_window" ||
    row.kindOverride === "siren" ||
    row.kindOverride === "plug";
  let kind: DeviceKind;
  if (overrideOk) {
    kind = row.kindOverride as DeviceKind;
  } else if (desc.includes("siren") || model.startsWith("hs2wd")) {
    kind = "siren";
  } else if (desc.includes("plug") || desc.includes("outlet")) {
    kind = "plug";
  } else {
    /* Aqara contact sensors describe themselves as "door & window" so
     * we can't tell them apart from metadata alone. Default to "porta"
     * and let the user flip individual devices to "finestra" via the
     * Casa editor. */
    kind = "sensor_door";
  }

  /* Status mapping. Sensors and sirens use the per-device `armed`
   * flag (mirroring the cameras' badge semantics: "Attiva" /
   * "Disattivata") so the live contact state stays in the subtitle
   * and the badge tells the user whether the alarm is watching the
   * device. Plugs are still on/off because that's their natural
   * state vocabulary. Offline always wins. */
  let status: DeviceStatus = "unknown";
  if (row.availability === "offline") {
    status = "offline";
  } else if (kind === "sensor_door" || kind === "sensor_window" || kind === "siren") {
    status = row.armed ? "armed" : "disarmed";
  } else if (typeof state.state === "string") {
    status = state.state.toLowerCase() === "on" ? "on" : "off";
  } else if (typeof state.contact === "boolean") {
    /* Fallback for unknown sensor kinds reporting contact. */
    status = state.contact ? "off" : "on";
  }

  /* Subtitle on the Casa tile reflects the most useful current reading
   * — for contact sensors, "Aperto" / "Chiuso"; for leak sensors,
   * "Perdita" / "Asciutto"; for plugs, on/off. Falls back to
   * "Sconosciuto" when there's no payload yet (sensor never reported
   * an event since pairing). */
  let subtitle: string | undefined;
  if (typeof state.contact === "boolean") {
    subtitle = i18next.t(`zigbee:state.contact.${state.contact ? "true" : "false"}` as never);
  } else if (typeof state.water_leak === "boolean") {
    subtitle = i18next.t(`zigbee:state.water_leak.${state.water_leak ? "true" : "false"}` as never);
  } else if (typeof state.occupancy === "boolean") {
    subtitle = i18next.t(`zigbee:state.occupancy.${state.occupancy ? "true" : "false"}` as never);
  } else if (typeof state.state === "string") {
    subtitle = state.state.toLowerCase();
  }

  return {
    id: row.ieeeAddress,
    kind,
    name: row.friendlyName,
    roomId: row.roomId,
    status,
    subtitle,
    renameable: true,
    supportsToggle: false,
    raw: row,
  };
}

/**
 * Projector for environmental sensors (ALPSTUGA + TIMMERFLÖTTE class).
 * Sensors are read-only, so the tile is informational with no toggle.
 * Subtitle prefers the most "expensive" reading available: CO2 ppm
 * when present (ALPSTUGA), else temperature.
 */
export function projectEnvSensor(row: EnvSensor): DeviceEntity {
  const kind: DeviceKind = row.kind === "air_quality" ? "sensor_air" : "sensor_climate";
  let subtitle: string | undefined;
  if (row.co2Ppm != null) {
    subtitle = `${Math.round(row.co2Ppm)} ppm CO₂`;
  } else if (row.temperatureC != null) {
    subtitle = `${row.temperatureC.toFixed(1)}°`;
    if (row.humidityPct != null) subtitle += ` · ${Math.round(row.humidityPct)}%`;
  }
  return {
    id: row.id,
    kind,
    name: row.friendlyName,
    roomId: row.roomId,
    status: row.offline ? "offline" : "unknown",
    subtitle,
    renameable: true,
    supportsToggle: false,
    raw: row,
  };
}

/**
 * Projector for water-leak sensors (KLIPPBOK class). Status flips to
 * "armed" when a leak is currently active so the badge stands out;
 * otherwise we stay quiet ("disarmed" reads as "all dry, monitoring").
 */
export function projectLeakSensor(row: LeakSensor): DeviceEntity {
  const status: DeviceStatus = row.offline ? "offline" : row.leakDetected ? "armed" : "disarmed";
  let subtitle: string | undefined;
  if (row.offline) {
    subtitle = i18next.t("zigbee:state.availability.offline" as never) || "offline";
  } else if (row.leakDetected) {
    subtitle = i18next.t("sensors:voice.leakActive" as never, {
      room: row.roomName ?? row.friendlyName,
    });
  } else {
    subtitle = i18next.t("sensors:voice.leakAllDry" as never);
  }
  return {
    id: row.id,
    kind: "sensor_leak",
    name: row.friendlyName,
    roomId: row.roomId,
    status,
    subtitle: typeof subtitle === "string" ? subtitle : undefined,
    renameable: true,
    supportsToggle: false,
    raw: row,
  };
}

/* ------------------------------------------------------------------ */

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
