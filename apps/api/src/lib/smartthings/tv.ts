/**
 * Typed wrappers around SmartThings capabilities for Samsung OCF TVs.
 *
 * Covers: switch, audioVolume, audioMute, mediaInputSource, mediaPlayback,
 * custom.launchapp. The underlying `stFetch` / `stPost` client takes care
 * of reading + refreshing the OAuth access token from the DB, so these
 * helpers only need a deviceId.
 */

import type { TvPlaybackInput, TvStatus } from "@home-panel/shared";
import { type SmartThingsStatus, stGetDeviceStatus, stSendCommands } from "./client.js";

/* ------------------------------------------------------------------------ */
/*  Status                                                                   */
/* ------------------------------------------------------------------------ */

/** Parse a SmartThings status document into the TV contract. */
export function mapTvStatus(raw: SmartThingsStatus): TvStatus {
  const main = raw.components?.main ?? {};

  const switchCap = main.switch;
  const audioVolume = main.audioVolume;
  const audioMute = main.audioMute;
  const mediaInput = main.mediaInputSource;
  const mediaPlayback = main.mediaPlayback;

  const power = switchCap?.switch?.value === "on" ? "on" : "off";

  const volumeRaw = audioVolume?.volume?.value;
  const volume = typeof volumeRaw === "number" ? Math.round(volumeRaw) : null;

  const muted = audioMute?.mute?.value === "muted";

  const inputRaw = mediaInput?.inputSource?.value;
  const input = typeof inputRaw === "string" && inputRaw.length > 0 ? inputRaw : null;

  const supportedInputsRaw = mediaInput?.supportedInputSources?.value;
  const supportedInputs = Array.isArray(supportedInputsRaw)
    ? supportedInputsRaw.filter((v): v is string => typeof v === "string")
    : [];

  const supportedCommandsRaw = mediaPlayback?.supportedPlaybackCommands?.value;
  const supportedPlaybackCommands = Array.isArray(supportedCommandsRaw)
    ? supportedCommandsRaw.filter((v): v is string => typeof v === "string")
    : [];

  /* Pick the most recent timestamp among the capabilities we actually parsed. */
  const timestamps = [
    switchCap?.switch?.timestamp,
    audioVolume?.volume?.timestamp,
    audioMute?.mute?.timestamp,
    mediaInput?.inputSource?.timestamp,
  ].filter((t): t is string => typeof t === "string" && t.length > 0);
  const lastUpdatedAt =
    timestamps.length > 0 ? timestamps.reduce((a, b) => (a > b ? a : b)) : new Date().toISOString();

  return {
    power,
    volume,
    muted,
    input,
    supportedInputs,
    supportedPlaybackCommands,
    lastUpdatedAt,
  };
}

/** Fetch + parse status directly from SmartThings (no cache). */
export async function readTvStatus(deviceId: string): Promise<TvStatus> {
  const raw = await stGetDeviceStatus(deviceId);
  return mapTvStatus(raw);
}

/* ------------------------------------------------------------------------ */
/*  In-memory cache (TTL 10s, keyed by deviceId)                             */
/* ------------------------------------------------------------------------ */

type CacheEntry = { status: TvStatus; fetchedAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10_000;

export async function getCachedTvStatus(deviceId: string, force = false): Promise<TvStatus> {
  const cached = cache.get(deviceId);
  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.status;
  }
  const status = await readTvStatus(deviceId);
  cache.set(deviceId, { status, fetchedAt: Date.now() });
  return status;
}

export function invalidateTvCache(deviceId?: string): void {
  if (deviceId === undefined) cache.clear();
  else cache.delete(deviceId);
}

/* ------------------------------------------------------------------------ */
/*  Commands                                                                 */
/* ------------------------------------------------------------------------ */

export async function sendPower(deviceId: string, on: boolean): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "switch", command: on ? "on" : "off" }]);
}

export async function sendSetVolume(deviceId: string, level: number): Promise<void> {
  await stSendCommands(deviceId, [
    { capability: "audioVolume", command: "setVolume", arguments: [level] },
  ]);
}

export async function sendVolumeUp(deviceId: string): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "audioVolume", command: "volumeUp" }]);
}

export async function sendVolumeDown(deviceId: string): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "audioVolume", command: "volumeDown" }]);
}

export async function sendMute(deviceId: string): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "audioMute", command: "mute" }]);
}

export async function sendUnmute(deviceId: string): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "audioMute", command: "unmute" }]);
}

export async function sendSetInput(deviceId: string, source: string): Promise<void> {
  await stSendCommands(deviceId, [
    { capability: "mediaInputSource", command: "setInputSource", arguments: [source] },
  ]);
}

export async function sendLaunchApp(deviceId: string, appId: string): Promise<void> {
  /*
   * custom.launchapp expects [id, name, metadata] — the name argument is the
   * same package name as fallback, metadata is serialized JSON (empty "{}").
   */
  await stSendCommands(deviceId, [
    {
      capability: "custom.launchapp",
      command: "launchApp",
      arguments: [appId, appId, "{}"],
    },
  ]);
}

export async function sendPlayback(
  deviceId: string,
  command: TvPlaybackInput["command"],
): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "mediaPlayback", command }]);
}

export async function sendChannelUp(deviceId: string): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "tvChannel", command: "channelUp" }]);
}

export async function sendChannelDown(deviceId: string): Promise<void> {
  await stSendCommands(deviceId, [{ capability: "tvChannel", command: "channelDown" }]);
}
