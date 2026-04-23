import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/*
 * Family members: people and pets.
 * Single-table polymorphic discriminated by `kind`.
 */
export const familyMembers = sqliteTable("family_members", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["human", "pet"] }).notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  accentColor: text("accent_color"),
  birthDate: text("birth_date"),

  // human-only
  role: text("role"),

  // pet-only
  species: text("species"),
  breed: text("breed"),
  weightKg: real("weight_kg"),
  veterinaryNotes: text("veterinary_notes"),

  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

export type FamilyMemberRow = typeof familyMembers.$inferSelect;
export type NewFamilyMemberRow = typeof familyMembers.$inferInsert;

/*
 * Shopping items: shared family shopping list.
 * audit_log is serialized JSON (array of entries).
 */
export const shoppingItems = sqliteTable("shopping_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unit: text("unit").notNull().default("pz"),
  category: text("category").notNull().default("other"),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  addedAt: text("added_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  addedBy: text("added_by").references(() => familyMembers.id, {
    onDelete: "set null",
  }),
  auditLog: text("audit_log").notNull().default("[]"),
});

export type ShoppingItemRow = typeof shoppingItems.$inferSelect;
export type NewShoppingItemRow = typeof shoppingItems.$inferInsert;

/*
 * Product catalog: product dictionary for autocomplete + voice by-name lookup.
 * Pre-populated by seed at backend startup.
 */
export const productCatalog = sqliteTable("product_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category").notNull(),
  defaultUnit: text("default_unit").notNull().default("pz"),
});

export type ProductRow = typeof productCatalog.$inferSelect;

/*
 * Family calendar — categories, events, attendees join.
 */
export const eventCategories = sqliteTable("event_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type EventCategoryRow = typeof eventCategories.$inferSelect;

export const calendarSources = sqliteTable("calendar_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  type: text("type", { enum: ["ics", "caldav"] })
    .notNull()
    .default("ics"),
  color: text("color").notNull().default("#4A90D9"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastSyncAt: text("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(30),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type CalendarSourceRow = typeof calendarSources.$inferSelect;

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  allDay: integer("all_day", { mode: "boolean" }).notNull().default(false),
  location: text("location"),
  categoryId: text("category_id").references(() => eventCategories.id, {
    onDelete: "set null",
  }),
  recurrenceRule: text("recurrence_rule"), // JSON nullable
  reminderMinutes: integer("reminder_minutes"),
  sourceId: text("source_id").references(() => calendarSources.id, {
    onDelete: "cascade",
  }),
  externalId: text("external_id"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type EventRow = typeof events.$inferSelect;

export const eventAttendees = sqliteTable("event_attendees", {
  eventId: text("event_id")
    .notNull()
    .references(() => events.id, { onDelete: "cascade" }),
  familyMemberId: text("family_member_id")
    .notNull()
    .references(() => familyMembers.id, { onDelete: "cascade" }),
});

/*
 * Waste schedule — waste types, recurrence rules, holiday exceptions.
 * Seeded with Besozzo 2026 rules (extracted from the municipality PDF).
 */
export const wasteTypes = sqliteTable("waste_types", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  containerType: text("container_type", { enum: ["bag", "bin"] }).notNull(),
  expositionInstructions: text("exposition_instructions"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type WasteTypeRow = typeof wasteTypes.$inferSelect;

export const wasteRules = sqliteTable("waste_rules", {
  id: text("id").primaryKey(),
  wasteTypeId: text("waste_type_id")
    .notNull()
    .references(() => wasteTypes.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(), // JSON
  expositionTime: text("exposition_time").notNull().default("20:00"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type WasteRuleRow = typeof wasteRules.$inferSelect;

export const wasteExceptions = sqliteTable("waste_exceptions", {
  id: text("id").primaryKey(),
  wasteTypeId: text("waste_type_id")
    .notNull()
    .references(() => wasteTypes.id, { onDelete: "cascade" }),
  originalDate: text("original_date"),
  replacementDate: text("replacement_date"),
  reason: text("reason"),
  source: text("source", { enum: ["manual", "ics"] })
    .notNull()
    .default("manual"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type WasteExceptionRow = typeof wasteExceptions.$inferSelect;

/*
 * Weather — locations + cache.
 */
export const weatherLocations = sqliteTable("weather_locations", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type WeatherLocationRow = typeof weatherLocations.$inferSelect;

export const weatherCache = sqliteTable("weather_cache", {
  locationId: text("location_id")
    .primaryKey()
    .references(() => weatherLocations.id, { onDelete: "cascade" }),
  fetchedAt: text("fetched_at").notNull(),
  payload: text("payload").notNull(),
});
export type WeatherCacheRow = typeof weatherCache.$inferSelect;

/*
 * Post-it board — sticky notes freely dragged on the board.
 */
export const postits = sqliteTable("postits", {
  id: text("id").primaryKey(),
  title: text("title"),
  body: text("body"),
  color: text("color", {
    enum: ["amber", "terracotta", "sage", "sand", "mauve", "ochre"],
  }).notNull(),
  posX: real("pos_x").notNull().default(0.5),
  posY: real("pos_y").notNull().default(0.5),
  rotation: real("rotation").notNull().default(0),
  zIndex: integer("z_index").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type PostitRow = typeof postits.$inferSelect;
export type NewPostitRow = typeof postits.$inferInsert;

/*
 * Voice settings — voice control configuration.
 * Singleton: single row with id = 1.
 */
export const voiceSettings = sqliteTable("voice_settings", {
  id: integer("id").primaryKey().default(1),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  sensitivity: real("sensitivity").notNull().default(0.5),
  preferredTtsVoice: text("preferred_tts_voice"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type VoiceSettingsRow = typeof voiceSettings.$inferSelect;

/*
 * Kiosk settings — night mode and screensaver configuration.
 * Singleton: single row with id = 1.
 */
export const kioskSettings = sqliteTable("kiosk_settings", {
  id: integer("id").primaryKey().default(1),
  nightModeEnabled: integer("night_mode_enabled", { mode: "boolean" }).notNull().default(true),
  nightStartHour: integer("night_start_hour").notNull().default(22),
  nightEndHour: integer("night_end_hour").notNull().default(7),
  nightBrightness: real("night_brightness").notNull().default(0.25),
  screensaverEnabled: integer("screensaver_enabled", { mode: "boolean" }).notNull().default(true),
  screensaverIdleMinutes: integer("screensaver_idle_minutes").notNull().default(5),
  photosDir: text("photos_dir").notNull().default("/data/photos"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type KioskSettingsRow = typeof kioskSettings.$inferSelect;

/*
 * Blink — credentials, cameras, motion clips.
 */
export const blinkCredentials = sqliteTable("blink_credentials", {
  id: integer("id").primaryKey().default(1),
  email: text("email"),
  encryptedPassword: text("encrypted_password"),
  encryptedToken: text("encrypted_token"),
  accountId: text("account_id"),
  region: text("region").default("u014"),
  // Hardware ID needed for Blink OAuth token refresh.
  hardwareId: text("hardware_id"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type BlinkCredentialsRow = typeof blinkCredentials.$inferSelect;
export type NewBlinkCredentialsRow = typeof blinkCredentials.$inferInsert;

export const blinkCameras = sqliteTable("blink_cameras", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  networkId: text("network_id"),
  model: text("model"),
  serialNumber: text("serial_number"),
  firmwareVersion: text("firmware_version"),
  /** Blink device family: "camera" (outdoor/indoor), "owl" (Mini), "doorbell". */
  deviceType: text("device_type", { enum: ["camera", "owl", "doorbell"] })
    .notNull()
    .default("camera"),
  /** Per-device motion detection enabled flag. Distinct from "armed" network state. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  status: text("status", { enum: ["online", "offline"] })
    .notNull()
    .default("online"),
  batteryLevel: text("battery_level"),
  thumbnailUrl: text("thumbnail_url"),
  lastMotionAt: text("last_motion_at"),
  /** Nullable room assignment. Not a FK — if the room is deleted the camera
   * simply becomes unassigned (client shows "Senza stanza"). */
  roomId: text("room_id"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type BlinkCameraRow = typeof blinkCameras.$inferSelect;
export type NewBlinkCameraRow = typeof blinkCameras.$inferInsert;

export const blinkMotionClips = sqliteTable("blink_motion_clips", {
  id: text("id").primaryKey(),
  cameraId: text("camera_id")
    .notNull()
    .references(() => blinkCameras.id, { onDelete: "cascade" }),
  recordedAt: text("recorded_at").notNull(),
  durationSeconds: integer("duration_seconds"),
  thumbnailPath: text("thumbnail_path"),
  clipPath: text("clip_path"),
  localPath: text("local_path"),
  downloadedAt: text("downloaded_at"),
  /** Tombstone: set when the user deletes a clip so the Blink sync won't
   * re-insert it and the downloader won't re-fetch the media file. */
  deletedAt: text("deleted_at"),
  viewed: integer("viewed", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type BlinkMotionClipRow = typeof blinkMotionClips.$inferSelect;
export type NewBlinkMotionClipRow = typeof blinkMotionClips.$inferInsert;

/*
 * Alarms — persistent alarms.
 * Timers are ephemeral and managed in-memory in the backend.
 */
export const alarms = sqliteTable("alarms", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  hour: integer("hour").notNull(),
  minute: integer("minute").notNull(),
  daysOfWeek: text("days_of_week").notNull().default("[]"), // JSON array
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sound: text("sound").notNull().default("default"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type AlarmRow = typeof alarms.$inferSelect;
export type NewAlarmRow = typeof alarms.$inferInsert;

/*
 * Recipes — family recipe book with favorites and URL import.
 */
export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  imageUrl: text("image_url"),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  servings: integer("servings"),
  difficulty: text("difficulty", { enum: ["facile", "medio", "difficile"] }),
  ingredients: text("ingredients").notNull().default("[]"),
  // JSON array di `{ text, images[] }` (vedi RecipeStep nei tipi shared).
  // For backward compat the backend also accepts plain strings.
  steps: text("steps").notNull().default("[]"),
  tags: text("tags").notNull().default("[]"),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  // "Tips" from the source site (e.g. GialloZafferano)
  tips: text("tips"),
  // "Storage tips" from the source site
  conservation: text("conservation"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type RecipeRow = typeof recipes.$inferSelect;
export type NewRecipeRow = typeof recipes.$inferInsert;

/*
 * Spotify — OAuth PKCE credentials (singleton, id = 1).
 */
export const spotifyCredentials = sqliteTable("spotify_credentials", {
  id: integer("id").primaryKey().default(1),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: text("expires_at"), // ISO timestamp
  displayName: text("display_name"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type SpotifyCredentialsRow = typeof spotifyCredentials.$inferSelect;

/*
 * SmartThings — PAT credentials and device IDs for washer/dryer.
 * Singleton: single row with id = 1.
 */
export const smartthingsConfig = sqliteTable("smartthings_config", {
  id: integer("id").primaryKey().default(1),
  /** Legacy Personal Access Token. Samsung capped new PATs at 24h in
   * December 2024, so we moved to OAuth2. Kept nullable for backward
   * compatibility with pre-migration rows; new rows never set it. */
  pat: text("pat"),
  /** OAuth2 access token from accounts.smartthings.com. */
  accessToken: text("access_token"),
  /** OAuth2 refresh token — rolls on every refresh, good for 30 days from
   * last use so the polling loop keeps it alive indefinitely. */
  refreshToken: text("refresh_token"),
  /** ISO timestamp when accessToken expires. */
  expiresAt: text("expires_at"),
  washerDeviceId: text("washer_device_id"),
  dryerDeviceId: text("dryer_device_id"),
  tvDeviceId: text("tv_device_id"),
  /* Per-device room assignments. The SmartThings config is singleton so the
   * room references are inlined here instead of in a separate join table. */
  washerRoomId: text("washer_room_id"),
  dryerRoomId: text("dryer_room_id"),
  tvRoomId: text("tv_room_id"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type SmartThingsConfigRow = typeof smartthingsConfig.$inferSelect;

/*
 * Lights — provider-agnostic switch/dimmer rows. One row per physical fixture,
 * linked to a device_id on a chosen provider (eWeLink, Shelly, Tasmota, ...).
 * UI treats all lights the same; only the backend dispatch cares about the
 * provider.
 */
export const lights = sqliteTable("lights", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Legacy free-text room label; kept for pre-migration data. New code
   * assigns rooms via `roomId` instead. */
  room: text("room"),
  /** Nullable room assignment — not a FK; deleting a room leaves the light
   * orphaned (client shows it under "Senza stanza"). */
  roomId: text("room_id"),
  /** Provider id, e.g. "ewelink". Must match one registered in
   * apps/api/src/lib/lights/providers/*. */
  provider: text("provider").notNull(),
  /** Device id as seen by the provider. For eWeLink this is the deviceid
   * string returned by the list API. */
  deviceId: text("device_id").notNull(),
  /** Last known "on" / "off" state reported by the provider. */
  lastState: text("last_state", { enum: ["on", "off", "unknown"] })
    .notNull()
    .default("unknown"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type LightRow = typeof lights.$inferSelect;
export type NewLightRow = typeof lights.$inferInsert;

/*
 * Provider credentials — one row per provider, JSON config is provider-specific.
 *
 * For "ewelink" the config shape is:
 *   { email: string, password: string, region: "eu" | "us" | "as" | "cn",
 *     accessToken?: string, refreshToken?: string, expiresAt?: string }
 *
 * Credentials are stored as plain JSON: the SQLite file lives on the NAS and
 * is not exposed externally, same threat model as the rest of .env secrets.
 */
/*
 * Rooms: named spaces inside the house. Free-form list managed entirely via
 * Settings → Stanze. Devices (lights, TV, laundry, AC, cameras…) reference a
 * room by id so the UI and voice can group/route them ("accendi il
 * condizionatore del salotto").
 *
 * The `icon` column stores a Phosphor icon name (e.g. `bed`, `couch`,
 * `cooking-pot`). It's free-form text — the client validates against a
 * known palette rather than a DB enum so the icon set can evolve without
 * migrations.
 */
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type RoomRow = typeof rooms.$inferSelect;
export type NewRoomRow = typeof rooms.$inferInsert;

export const providerCredentials = sqliteTable("provider_credentials", {
  provider: text("provider").primaryKey(),
  configJson: text("config_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type ProviderCredentialsRow = typeof providerCredentials.$inferSelect;

/*
 * GE Appliances (Comfort / SmartHQ) — OAuth2 ROPC credentials.
 * Singleton: single row with id = 1.
 *
 * Only tokens and the login email are persisted. The password transits in
 * RAM during the initial POST /config and is discarded once the first token
 * pair is obtained. When the refresh token eventually dies the user
 * re-enters credentials from the Settings UI.
 */
export const geCredentials = sqliteTable("ge_credentials", {
  id: integer("id").primaryKey().default(1),
  email: text("email"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  /** ISO timestamp when the access token expires. */
  expiresAt: text("expires_at"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type GeCredentialsRow = typeof geCredentials.$inferSelect;
export type NewGeCredentialsRow = typeof geCredentials.$inferInsert;

/*
 * GE Appliances devices — air conditioners discovered via the GE cloud.
 * One row per physical appliance. `lastState` is a JSON blob matching
 * `AcState` from the shared package; the schema keeps it opaque so new
 * features (presets, timers, ...) don't require migrations.
 */
export const geDevices = sqliteTable("ge_devices", {
  id: text("id").primaryKey(),
  /** GE serial number / JID, stable per unit. */
  serial: text("serial").notNull(),
  model: text("model"),
  nickname: text("nickname"),
  /** Nullable room assignment — same semantics as other device roomId
   * fields (null = "Senza stanza", stale ids silently orphaned). */
  roomId: text("room_id"),
  /** Last known AcState serialised as JSON. Null until first poll succeeds. */
  lastState: text("last_state"),
  lastSeenAt: text("last_seen_at"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type GeDeviceRow = typeof geDevices.$inferSelect;
export type NewGeDeviceRow = typeof geDevices.$inferInsert;
