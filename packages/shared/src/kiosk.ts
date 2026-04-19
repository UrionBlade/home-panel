/**
 * Kiosk mode — tipi condivisi per modalità notte e salvaschermo.
 */

export interface KioskSettings {
  nightModeEnabled: boolean;
  nightStartHour: number;
  nightEndHour: number;
  nightBrightness: number;
  screensaverEnabled: boolean;
  screensaverIdleMinutes: number;
  photosDir: string;
}

export interface UpdateKioskSettingsInput {
  nightModeEnabled?: boolean;
  nightStartHour?: number;
  nightEndHour?: number;
  nightBrightness?: number;
  screensaverEnabled?: boolean;
  screensaverIdleMinutes?: number;
}

export interface KioskPhoto {
  filename: string;
  url: string;
}
