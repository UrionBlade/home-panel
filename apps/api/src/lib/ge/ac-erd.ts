/**
 * GE Appliances AC (air conditioner) ERD mapping.
 *
 * The SmartHQ appliances expose state as a bag of hex-coded "ERDs"
 * (External Resource Descriptors). Each ERD holds an opaque value
 * serialised as a hex string; decoding depends on the ERD. This module
 * centralises the codes + codec logic so the rest of the backend can
 * speak in typed `AcState` / `AcCommandInput` shapes.
 *
 * Mapping derived from the community reverse-engineered Python SDK
 * (simbaja/gehome), which the official SmartHQ Android app matches.
 *
 * Temperatures on GE units are reported in °F as a 2-byte big-endian
 * integer. We normalise to °C at the edge so the UI never has to deal
 * with the unit mismatch.
 */

import type { AcFanSpeed, AcMode, AcState, AcSwing } from "@home-panel/shared";

/* ----- ERD codes ----- */

export const ERD_AC_TARGET_TEMPERATURE = "0x7003"; // int, 2 bytes, °F
export const ERD_AC_TARGET_HEATING_TEMPERATURE = "0x7002"; // int, 2 bytes, °F
export const ERD_AC_FAN_SETTING = "0x7a00"; // enum, 1 byte
export const ERD_AC_OPERATION_MODE = "0x7a01"; // enum, 1 byte
export const ERD_AC_AMBIENT_TEMPERATURE = "0x7a02"; // int, 2 bytes, °F (read-only)
export const ERD_AC_POWER_STATUS = "0x7a0f"; // bool, 1 byte
export const ERD_SAC_AUTO_SWING_MODE = "0x7b07"; // bool, 1 byte (split AC only)

/* ----- Enum values (from ErdAcOperationMode, ErdAcFanSetting) ----- */

const GE_MODE: Record<AcMode, number> = {
  cool: 0,
  fan: 1,
  heat: 3,
  dry: 4,
  auto: 5,
};

const GE_MODE_DECODE: Record<number, AcMode> = {
  0: "cool",
  1: "fan",
  2: "cool", // ENERGY_SAVER behaves like cool for our UI
  3: "heat",
  4: "dry",
  5: "auto",
  6: "cool", // TURBO_COOL
  7: "fan", // SILENT
};

const GE_FAN: Record<AcFanSpeed, number> = {
  auto: 1,
  low: 2,
  mid: 4,
  high: 8,
};

const GE_FAN_DECODE: Record<number, AcFanSpeed> = {
  1: "auto",
  2: "low",
  3: "low", // LOW_AUTO
  4: "mid",
  5: "mid", // MED_AUTO
  8: "high",
  9: "high", // HIGH_AUTO
};

/* ----- Primitive codecs ----- */

/** Decode a hex string (any length) as a big-endian unsigned integer. */
function decodeInt(hex: string): number {
  const clean = hex.replace(/^0x/i, "");
  if (!clean) return 0;
  return Number.parseInt(clean, 16);
}

/** Encode a number as a big-endian hex string with `byteLen` bytes. */
function encodeInt(value: number, byteLen: number): string {
  const n = Math.max(0, Math.round(value));
  const max = 2 ** (byteLen * 8) - 1;
  const clamped = Math.min(max, n);
  return clamped
    .toString(16)
    .toUpperCase()
    .padStart(byteLen * 2, "0");
}

function decodeBool(hex: string): boolean {
  const clean = hex.replace(/^0x/i, "").toUpperCase();
  // "FF" is the "unknown" sentinel — treat as off so the UI renders sensibly.
  if (clean === "FF" || clean === "") return false;
  return decodeInt(clean) !== 0;
}

function encodeBool(value: boolean): string {
  return value ? "01" : "00";
}

/* ----- Temperature helpers ----- */

/** Convert °F → °C rounded to the nearest integer. */
export function fahrenheitToCelsius(f: number): number {
  return Math.round(((f - 32) * 5) / 9);
}

/** Convert °C → °F rounded to the nearest integer. */
export function celsiusToFahrenheit(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

/** Reasonable bounds so a UI slip can't ask the unit for 5°C or 40°C. */
export const AC_TEMP_MIN_C = 16;
export const AC_TEMP_MAX_C = 30;

export function clampTargetCelsius(c: number): number {
  return Math.max(AC_TEMP_MIN_C, Math.min(AC_TEMP_MAX_C, Math.round(c)));
}

/* ----- Public codec (ERD hex ↔ typed fields) ----- */

export const acErdCodec = {
  decodePower: decodeBool,
  encodePower: encodeBool,

  decodeMode(hex: string): AcMode {
    const n = decodeInt(hex);
    return GE_MODE_DECODE[n] ?? "cool";
  },
  encodeMode(mode: AcMode): string {
    return encodeInt(GE_MODE[mode], 1);
  },

  decodeFan(hex: string): AcFanSpeed {
    const n = decodeInt(hex);
    return GE_FAN_DECODE[n] ?? "auto";
  },
  encodeFan(fan: AcFanSpeed): string {
    return encodeInt(GE_FAN[fan], 1);
  },

  /** Decodes a 2-byte °F ERD into °C. Returns null when the appliance
   * reports the "sensor unavailable" sentinel (0xFFFF or very low values). */
  decodeTemperature(hex: string): number | null {
    const n = decodeInt(hex);
    // Sensor unavailable / powered off sentinels.
    if (n === 0xffff || n === 0 || n > 200) return null;
    return fahrenheitToCelsius(n);
  },
  /** Encode a target °C back to the 2-byte °F payload GE expects. */
  encodeTargetTemperature(celsius: number): string {
    return encodeInt(celsiusToFahrenheit(clampTargetCelsius(celsius)), 2);
  },

  decodeSwing(hex: string): AcSwing {
    return decodeBool(hex) ? "on" : "off";
  },
  encodeSwing(swing: AcSwing): string {
    return encodeBool(swing === "on");
  },
};

/* ----- Whole-appliance state decoder ----- */

/** Map of ERD hex code → raw hex value as returned by GET
 * `/v1/appliance/{jid}/erd`. Both keys and values may arrive uppercase
 * or lowercase; callers should normalise before lookup. */
export type ErdBag = Record<string, string>;

/** Find an ERD value in the bag tolerating case differences ("0x7A01"
 * vs "0x7a01") and the optional leading "0x". */
export function lookupErd(bag: ErdBag, code: string): string | undefined {
  const targets = [code, code.toLowerCase(), code.toUpperCase(), code.replace(/^0x/i, "")];
  for (const [k, v] of Object.entries(bag)) {
    const kn = k.toLowerCase();
    if (targets.some((t) => t.toLowerCase() === kn)) return v;
  }
  return undefined;
}

/** Build an `AcState` from a raw ERD bag. Missing ERDs fall back to
 * conservative defaults so the UI can still render something useful
 * during the first few polls after a reboot. */
export function decodeAcState(bag: ErdBag): AcState {
  const power = lookupErd(bag, ERD_AC_POWER_STATUS);
  const mode = lookupErd(bag, ERD_AC_OPERATION_MODE);
  const fan = lookupErd(bag, ERD_AC_FAN_SETTING);
  const ambient = lookupErd(bag, ERD_AC_AMBIENT_TEMPERATURE);
  const target = lookupErd(bag, ERD_AC_TARGET_TEMPERATURE);
  const swing = lookupErd(bag, ERD_SAC_AUTO_SWING_MODE);

  return {
    power: power ? acErdCodec.decodePower(power) : false,
    mode: mode ? acErdCodec.decodeMode(mode) : "cool",
    currentTemp: ambient ? acErdCodec.decodeTemperature(ambient) : null,
    targetTemp: target ? (acErdCodec.decodeTemperature(target) ?? 24) : 24,
    fanSpeed: fan ? acErdCodec.decodeFan(fan) : "auto",
    swing: swing ? acErdCodec.decodeSwing(swing) : "off",
    updatedAt: new Date().toISOString(),
  };
}
