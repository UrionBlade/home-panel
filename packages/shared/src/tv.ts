/**
 * TV control — types shared between the API and the mobile client.
 *
 * The backend talks to a Samsung OCF TV via SmartThings. See
 * `apps/api/src/routes/tv.ts` for the concrete contract.
 */

/** Snapshot of the bound TV's current state (as known by SmartThings). */
export interface TvStatus {
  /** Whether the set is on (switch capability). */
  power: "on" | "off";
  /** Volume 0-100. `null` when the TV has never reported one. */
  volume: number | null;
  /** Mute state (audioMute capability). */
  muted: boolean;
  /** Active input source (mediaInputSource). `null` while off/unknown. */
  input: string | null;
  /** Inputs the TV reports as supported. */
  supportedInputs: string[];
  /** Playback commands supported by the TV (mediaPlayback). */
  supportedPlaybackCommands: string[];
  /** ISO-8601 timestamp of the most recent field update. */
  lastUpdatedAt: string;
}

/** Config exposed to the frontend. */
export interface TvConfig {
  /** True when SmartThings PAT is known (shared with laundry). */
  smartThingsConfigured: boolean;
  /** Device id bound as the TV, or null. */
  tvDeviceId: string | null;
  /** Room assignment for the bound TV, nullable. */
  tvRoomId: string | null;
  /** Nome custom scelto dal pannello, null = usa il label SmartThings. */
  tvNickname: string | null;
}

/** A Samsung OCF TV visible to the configured PAT. */
export interface TvDeviceSummary {
  deviceId: string;
  /** Human label ("Samsung Q6 Series (49)"). */
  label: string;
  /** Raw name from SmartThings ("[TV] Samsung Q6 Series (49)"). */
  name: string;
  manufacturer: string | null;
}

/** Body of PATCH /tv/config. Null unbinds. All fields optional — send only
 * what changes. */
export interface TvConfigUpdateInput {
  tvDeviceId?: string | null;
  tvRoomId?: string | null;
  tvNickname?: string | null;
}

/** Body of POST /tv/power. */
export interface TvPowerInput {
  on: boolean;
}

/** Body of POST /tv/volume — exactly one field must be set. */
export interface TvVolumeInput {
  /** Absolute volume 0-100. */
  level?: number;
  /** Relative change. */
  delta?: "up" | "down";
}

/** Body of POST /tv/mute. `"toggle"` flips the current state. */
export interface TvMuteInput {
  muted: boolean | "toggle";
}

/** Body of POST /tv/input. `source` must be one of TvStatus.supportedInputs. */
export interface TvInputSelectInput {
  source: string;
}

/** Body of POST /tv/app — Tizen package name (org.tizen.netflix-app, …). */
export interface TvAppLaunchInput {
  appId: string;
}

/** Body of POST /tv/channel — relative change only. */
export interface TvChannelInput {
  delta: "up" | "down";
}

/** Body of POST /tv/playback. */
export interface TvPlaybackInput {
  command: "play" | "pause" | "stop" | "fastForward" | "rewind" | "next" | "previous";
}

/** Shortcut shown to the user (home tile + voice). */
export interface TvAppPreset {
  /** Stable key referenced by voice intents ("netflix"). */
  key: string;
  /** Display label ("Netflix"). */
  label: string;
  /** Phosphor icon name used by the mobile client. */
  icon: string;
  /** Tizen package name posted to custom.launchapp. */
  appId: string;
}
