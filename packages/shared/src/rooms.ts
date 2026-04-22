/**
 * Rooms — named spaces that group devices across providers.
 *
 * The panel-wide concept: lights, TV, laundry, cameras, air conditioners…
 * eventually reference a `roomId`, so the UI can surface per-room views and
 * voice commands like "ok casa accendi il condizionatore del salotto" can
 * resolve to the right device.
 *
 * Rooms are purely organisational — no provider-specific semantics. The
 * only taxonomy we enforce is a free-form icon name (from the Phosphor
 * icon palette) which the mobile client validates against its known set.
 */

export interface Room {
  id: string;
  name: string;
  /** Phosphor icon name, e.g. `bed`, `couch`, `cooking-pot`. Null = default. */
  icon: string | null;
  /** 0-based sort order; lower values render first. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoomInput {
  name: string;
  icon?: string | null;
  sortOrder?: number;
}

export interface UpdateRoomInput {
  name?: string;
  icon?: string | null;
  sortOrder?: number;
}
