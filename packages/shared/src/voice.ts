/**
 * Voice control — tipi condivisi tra mobile e api.
 * Infrastruttura frontend per il controllo vocale (plugin nativo iOS in arrivo).
 */

export type VoiceStatus = "disabled" | "idle" | "listening" | "processing" | "speaking" | "error";

export interface VoiceSettings {
  enabled: boolean;
  sensitivity: number;
  preferredTtsVoice: string | null;
}

export interface UpdateVoiceSettingsInput {
  enabled?: boolean;
  sensitivity?: number;
  preferredTtsVoice?: string | null;
}

export type VoiceIntent =
  | "add_to_shopping"
  | "remove_from_shopping"
  | "read_shopping"
  | "add_event"
  | "read_today_events"
  | "read_tomorrow_events"
  | "read_waste_today"
  | "read_waste_tomorrow"
  | "read_weather"
  | "read_weather_tomorrow"
  | "set_timer"
  | "stop_timer"
  | "add_postit"
  | "routine_morning"
  | "routine_night"
  | "cancel"
  | "what_time"
  | "what_date"
  | "search_recipe"
  | "greeting"
  | "how_are_you"
  | "thank_you"
  | "joke"
  | "compliment"
  | "who_are_you"
  | "help"
  | "music_play"
  | "music_pause"
  | "music_next"
  | "music_previous"
  | "music_volume";

export interface ParsedCommand {
  intent: VoiceIntent;
  entities: Record<string, string>;
  confidence: number;
  raw: string;
}
