/**
 * Routines — user-defined automations.
 *
 * A routine pairs a trigger (time schedule, cron expression, voice phrase or a
 * manual button) with an ordered list of steps to run. Steps can target any
 * device family the panel integrates with (lights, AC, cameras, Spotify, TV,
 * shopping, timers) plus a handful of "meta" actions (delay, speak).
 *
 * Server-only actions run inline on the API. Client-only actions (speak a
 * custom response, play a sound on the kiosk) are accumulated in the run
 * result and pushed to the panel via SSE for scheduled triggers, or returned
 * to the voice caller for voice triggers.
 */

// ---------- Triggers ----------

/** Time-of-day trigger with weekday filter. `daysOfWeek` uses JS `Date.getDay`
 * semantics (0 = Sunday, 6 = Saturday). Empty array = every day. */
export interface RoutineTriggerTime {
  type: "time";
  hour: number; // 0..23
  minute: number; // 0..59
  daysOfWeek: number[];
}

/** Standard 5-field cron expression (minute hour dom month dow). Timezone is
 * the server's local time. */
export interface RoutineTriggerCron {
  type: "cron";
  expr: string;
}

/** Fires when the voice assistant hears any of `phrases` (case/diacritic
 * insensitive, keyword-matched against the raw transcript). */
export interface RoutineTriggerVoice {
  type: "voice";
  phrases: string[];
}

/** Only runs via the "Run now" button or `POST /routines/:id/run`. */
export interface RoutineTriggerManual {
  type: "manual";
}

export type RoutineTrigger =
  | RoutineTriggerTime
  | RoutineTriggerCron
  | RoutineTriggerVoice
  | RoutineTriggerManual;

// ---------- Actions ----------

/** Every action the runtime knows how to execute. The `params` shape is
 * per-action; see `RoutineStep` for the strongly-typed union. */
export type RoutineActionType =
  // Lights
  | "light.set" // one light on/off
  | "light.toggle" // one light
  | "lights.room" // all lights in a room
  | "lights.all" // every adopted light
  // Air conditioner
  | "ac.power"
  | "ac.set_mode"
  | "ac.set_temp"
  | "ac.set_fan"
  // Cameras (Blink)
  | "blink.arm" // one camera
  | "blink.disarm" // one camera
  | "blink.arm_all"
  | "blink.disarm_all"
  // Spotify
  | "spotify.play"
  | "spotify.pause"
  | "spotify.next"
  | "spotify.previous"
  | "spotify.volume"
  | "spotify.play_uri"
  // TV (SmartThings)
  | "tv.power"
  | "tv.volume"
  | "tv.mute"
  | "tv.launch_app"
  // Shopping
  | "shopping.add"
  // Timer
  | "timer.start"
  | "timer.stop_all"
  // Meta
  | "delay"
  | "voice.speak";

type OnOff = "on" | "off";

/** A single step inside a routine. Discriminated on `action`. */
export type RoutineStep =
  | { action: "light.set"; params: { lightId: string; state: OnOff }; continueOnError?: boolean }
  | { action: "light.toggle"; params: { lightId: string }; continueOnError?: boolean }
  | { action: "lights.room"; params: { roomId: string; state: OnOff }; continueOnError?: boolean }
  | { action: "lights.all"; params: { state: OnOff }; continueOnError?: boolean }
  | {
      action: "ac.power";
      params: { deviceId: string; power: boolean };
      continueOnError?: boolean;
    }
  | {
      action: "ac.set_mode";
      params: { deviceId: string; mode: "cool" | "heat" | "dry" | "fan" | "auto" };
      continueOnError?: boolean;
    }
  | {
      action: "ac.set_temp";
      params: { deviceId: string; targetTemp: number };
      continueOnError?: boolean;
    }
  | {
      action: "ac.set_fan";
      params: { deviceId: string; fanSpeed: "auto" | "low" | "mid" | "high" };
      continueOnError?: boolean;
    }
  | { action: "blink.arm"; params: { cameraId: string }; continueOnError?: boolean }
  | { action: "blink.disarm"; params: { cameraId: string }; continueOnError?: boolean }
  | { action: "blink.arm_all"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "blink.disarm_all"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "spotify.play"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "spotify.pause"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "spotify.next"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "spotify.previous"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "spotify.volume"; params: { volumePercent: number }; continueOnError?: boolean }
  | { action: "spotify.play_uri"; params: { contextUri: string }; continueOnError?: boolean }
  | { action: "tv.power"; params: { on: boolean }; continueOnError?: boolean }
  | { action: "tv.volume"; params: { level: number }; continueOnError?: boolean }
  | { action: "tv.mute"; params: { muted: boolean }; continueOnError?: boolean }
  | { action: "tv.launch_app"; params: { appId: string }; continueOnError?: boolean }
  | { action: "shopping.add"; params: { name: string }; continueOnError?: boolean }
  | {
      action: "timer.start";
      params: { durationSeconds: number; label?: string | null };
      continueOnError?: boolean;
    }
  | { action: "timer.stop_all"; params?: Record<string, never>; continueOnError?: boolean }
  | { action: "delay"; params: { ms: number }; continueOnError?: boolean }
  | { action: "voice.speak"; params: { text: string }; continueOnError?: boolean };

// ---------- Routine entity ----------

export interface Routine {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  enabled: boolean;
  trigger: RoutineTrigger;
  /** Optional sentence the voice assistant will speak before client steps
   * run. When a routine is voice-triggered, this replaces the default ack. */
  voiceResponse: string | null;
  steps: RoutineStep[];
  lastRunAt: string | null;
  lastRunStatus: "success" | "error" | null;
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /routines — id/timestamps are server-assigned. */
export interface RoutineCreateInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  enabled?: boolean;
  trigger: RoutineTrigger;
  voiceResponse?: string | null;
  steps: RoutineStep[];
}

/** Body for PATCH /routines/:id — every field optional. */
export type RoutineUpdateInput = Partial<RoutineCreateInput>;

// ---------- Execution ----------

/** Per-step outcome returned by POST /routines/:id/run. Failed steps carry
 * their error message; successful ones just report `ok: true`. */
export interface RoutineStepResult {
  index: number;
  action: RoutineActionType;
  ok: boolean;
  error?: string;
  /** Set only for `voice.speak` so the voice caller knows what to say without
   * inspecting `clientActions` for ordering. */
  spokenText?: string;
}

/** Actions the server couldn't complete by itself — the panel (or voice
 * client) must execute them. Ordering mirrors the original `steps` array. */
export type RoutineClientAction = { action: "voice.speak"; text: string };

/** Body returned by POST /routines/:id/run. */
export interface RoutineRunResult {
  routineId: string;
  startedAt: string;
  finishedAt: string;
  steps: RoutineStepResult[];
  /** Voice / kiosk steps the caller is responsible for playing. Empty array
   * when the routine is pure server-side. */
  clientActions: RoutineClientAction[];
  overallOk: boolean;
}

/** Subset of routines exposed to the voice parser: only voice-triggered,
 * enabled routines, stripped down to what the parser needs. Served at
 * GET /routines/voice-triggers. */
export interface RoutineVoiceTrigger {
  routineId: string;
  name: string;
  phrases: string[];
}
