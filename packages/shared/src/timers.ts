/**
 * Timer & Alarm — tipi condivisi tra mobile e api.
 * Timer: effimeri (in-memory sul backend).
 * Alarm: persistenti (DB SQLite).
 */

export interface Timer {
  id: string;
  label: string | null;
  durationSeconds: number;
  remainingSeconds: number;
  status: "running" | "paused" | "finished";
  createdAt: string;
  finishedAt: string | null;
}

export interface Alarm {
  id: string;
  label: string;
  hour: number; // 0-23
  minute: number; // 0-59
  daysOfWeek: number[]; // 0=dom, 1=lun, ..., 6=sab. Vuoto = one-shot
  enabled: boolean;
  sound: string;
  createdAt: string;
}

export interface CreateTimerInput {
  durationSeconds: number;
  label?: string;
}

export interface CreateAlarmInput {
  label: string;
  hour: number;
  minute: number;
  daysOfWeek?: number[];
  sound?: string;
}

export interface UpdateAlarmInput {
  label?: string;
  hour?: number;
  minute?: number;
  daysOfWeek?: number[];
  enabled?: boolean;
  sound?: string;
}
