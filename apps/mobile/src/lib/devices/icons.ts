import {
  AppWindowIcon,
  ArmchairIcon,
  BathtubIcon,
  BedIcon,
  CookingPotIcon,
  DesktopTowerIcon,
  DoorIcon,
  DoorOpenIcon,
  FanIcon,
  HouseLineIcon,
  type Icon,
  LightbulbFilamentIcon,
  PlantIcon,
  PlugIcon,
  ShowerIcon,
  SirenIcon,
  SnowflakeIcon,
  TelevisionIcon,
  ThermometerIcon,
  ToiletIcon,
  VideoCameraIcon,
  WashingMachineIcon,
  WindIcon,
} from "@phosphor-icons/react";

/**
 * Central icon registry — every device kind and every room archetype
 * maps to one Phosphor icon here. Keeping the registry in one place
 * ensures the voice layer, the home tiles, the Casa page and future
 * sheets all resolve the same glyph for the same concept.
 */

/* ------------------------------------------------------------------ */
/*  Device kinds                                                       */
/* ------------------------------------------------------------------ */

/**
 * Union of all physical device archetypes the panel can display.
 * - `light`, `ac`, `camera`, `tv`, `washer`, `dryer` are live today.
 * - `sensor_door`, `sensor_window`, `siren`, `plug` are reserved for the
 *   upcoming Zigbee + alarm hardware. The UI already knows how to render
 *   them so onboarding is just a matter of adding rows to the DB.
 */
export type DeviceKind =
  | "light"
  | "ac"
  | "camera"
  | "ip_camera"
  | "tv"
  | "washer"
  | "dryer"
  | "sensor_door"
  | "sensor_window"
  | "siren"
  | "plug";

export const DEVICE_ICON: Record<DeviceKind, Icon> = {
  light: LightbulbFilamentIcon,
  ac: SnowflakeIcon,
  camera: VideoCameraIcon,
  ip_camera: VideoCameraIcon,
  tv: TelevisionIcon,
  washer: WashingMachineIcon,
  dryer: FanIcon,
  sensor_door: DoorOpenIcon,
  sensor_window: AppWindowIcon,
  siren: SirenIcon,
  plug: PlugIcon,
};

/** Secondary icons, used as status overlays or inside editor sheets. */
export const DEVICE_ICON_ALT: Partial<Record<DeviceKind, Icon>> = {
  ac: ThermometerIcon,
  dryer: WindIcon,
  sensor_door: DoorIcon,
};

/* ------------------------------------------------------------------ */
/*  Room archetypes                                                    */
/* ------------------------------------------------------------------ */

/** Stable keys used in the DB. Adding one here is enough — no migration. */
export const ROOM_ICON_KEYS = [
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
] as const;
export type RoomIconKey = (typeof ROOM_ICON_KEYS)[number];

export const ROOM_ICON: Record<RoomIconKey, Icon> = {
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

/**
 * Resolve a room icon by name with a warm fallback. Accepts nullable
 * inputs so callers don't have to guard every access.
 */
export function resolveRoomIcon(name: string | null | undefined): Icon {
  if (!name) return HouseLineIcon;
  return (ROOM_ICON as Record<string, Icon>)[name] ?? HouseLineIcon;
}

export function resolveDeviceIcon(kind: DeviceKind): Icon {
  return DEVICE_ICON[kind];
}
