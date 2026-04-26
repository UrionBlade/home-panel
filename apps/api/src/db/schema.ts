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

  /** Speaker recognition profile. Serialised JSON of
   * `{ samples: number[][]; centroid: number[] }` — empty / null when the
   * member has not enrolled their voice yet. The centroid is recomputed
   * on every enrol/delete so cosine matches at identify time are O(1)
   * per member. */
  voiceEmbedding: text("voice_embedding"),

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
  /** Nome assegnato dall'app Blink ufficiale — lo rispettiamo per la
   * sincronizzazione, ma il pannello espone `nickname` come override
   * locale quando l'utente rinomina la camera dalla Casa. */
  name: text("name").notNull(),
  /** Nome custom dato dall'utente dal pannello. Null = mostra `name`. */
  nickname: text("nickname"),
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
  /* Nickname override: quando popolati il pannello li usa al posto del
   * label SmartThings. Null = mostra il label originale del provider. */
  washerNickname: text("washer_nickname"),
  dryerNickname: text("dryer_nickname"),
  tvNickname: text("tv_nickname"),
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
 * Generic IP cameras — any RTSP-capable device (CamHiPro / Anpviz /
 * Reolink / Dahua / ONVIF compatibile). Credenziali RTSP restano sul
 * backend: il client non vede mai user/password. Gli snapshot vengono
 * generati on-demand via ffmpeg e serviti come JPEG, lo streaming live
 * è un loop di snapshot (semplice, funziona in ogni browser, niente
 * hls.js).
 *
 * `streamPath` è il path del main stream (1080p di solito, es "/11"),
 * `substreamPath` quello del sub (640x352 tipico, es "/12"). Se entrambi
 * sono popolati il client può scegliere quale richiedere; per default
 * usiamo il substream per risparmiare banda sul pannello iPad.
 */
export const ipCameras = sqliteTable("ip_cameras", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(554),
  username: text("username"),
  password: text("password"),
  streamPath: text("stream_path").notNull().default("/11"),
  substreamPath: text("substream_path").default("/12"),
  /** Nullable room assignment — stesse semantiche degli altri device. */
  roomId: text("room_id"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type IpCameraRow = typeof ipCameras.$inferSelect;
export type NewIpCameraRow = typeof ipCameras.$inferInsert;

/*
 * IP camera recordings — clip MP4 generate dal backend via ffmpeg
 * -c copy (niente transcoding, CPU quasi zero). Una riga per clip,
 * file su disco nel volume BLINK_CLIPS_DIR/ipcam/.
 */
export const ipCameraRecordings = sqliteTable("ip_camera_recordings", {
  id: text("id").primaryKey(),
  cameraId: text("camera_id").notNull(),
  /** Path relativo al BLINK_CLIPS_DIR (mount Docker). */
  filePath: text("file_path").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds"),
  sizeBytes: integer("size_bytes"),
  /** Etichetta opzionale ("campanello suona", "movimento cortile"). */
  label: text("label"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type IpCameraRecordingRow = typeof ipCameraRecordings.$inferSelect;
export type NewIpCameraRecordingRow = typeof ipCameraRecordings.$inferInsert;

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

/*
 * Routines — user-defined automations ("scenes").
 *
 * A routine links a trigger (time/cron schedule, voice phrase, manual button)
 * to an ordered list of action steps (turn lights on, arm cameras, speak a
 * custom response, ...). Triggers and steps are kept as JSON blobs to avoid
 * a schema migration every time we introduce a new action type — the runtime
 * validates them against the discriminated unions in `@home-panel/shared`.
 *
 * `lastRunStatus` reflects the most recent execution ("success" | "error"),
 * `lastRunError` carries the failure message when applicable so the UI can
 * surface it without consulting logs.
 */
export const routines = sqliteTable("routines", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Phosphor icon name (free-form, client-validated). */
  icon: text("icon"),
  /** Accent color for tiles/list items. */
  color: text("color"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Discriminator for triggerConfig JSON. */
  triggerType: text("trigger_type", { enum: ["time", "cron", "voice", "manual"] })
    .notNull()
    .default("manual"),
  /** Shape depends on triggerType; see RoutineTrigger in shared. */
  triggerConfig: text("trigger_config").notNull().default("{}"),
  /** Optional text the voice assistant says before/after the steps run.
   * Empty string = silent. */
  voiceResponse: text("voice_response"),
  /** JSON array of RoutineStep objects. */
  steps: text("steps").notNull().default("[]"),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status", { enum: ["success", "error"] }),
  lastRunError: text("last_run_error"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type RoutineRow = typeof routines.$inferSelect;
export type NewRoutineRow = typeof routines.$inferInsert;

/*
 * Zigbee devices — mirror of the Z2M `bridge/devices` topic with
 * home-panel additions (room assignment, last-seen). One row per
 * paired device (the coordinator itself is filtered out at insert
 * time). State payloads are kept as opaque JSON so we don't migrate
 * every time a new sensor model brings new fields.
 */
export const zigbeeDevices = sqliteTable("zigbee_devices", {
  ieeeAddress: text("ieee_address").primaryKey(),
  friendlyName: text("friendly_name").notNull(),
  vendor: text("vendor"),
  model: text("model"),
  description: text("description"),
  /** EndDevice | Router | Coordinator. */
  type: text("type"),
  /** Last full state payload from the device topic. JSON object. */
  lastStateJson: text("last_state_json").notNull().default("{}"),
  /** Battery percent extracted from the last state, when available. */
  battery: integer("battery"),
  linkQuality: integer("link_quality"),
  availability: text("availability", { enum: ["online", "offline", "unknown"] })
    .notNull()
    .default("unknown"),
  lastSeenAt: text("last_seen_at"),
  /** Nullable room assignment — same semantics as other device tables
   * (null = "Senza stanza", stale ids silently orphaned). */
  roomId: text("room_id"),
  /** When true, this device contributes to the alarm: an open/triggered
   * state event will fire `alarm:triggered` if `alarm_state.armed` is on.
   * Defaults to true so newly-paired sensors are protected by default. */
  armed: integer("armed", { mode: "boolean" }).notNull().default(true),
  /** Optional override for the projected DeviceKind. Z2M's description
   * for an Aqara contact sensor says "door & window" so the auto
   * heuristic is unreliable; this column lets the user pick explicitly
   * (porta vs finestra vs sirena vs presa). Null = keep the default. */
  kindOverride: text("kind_override"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type ZigbeeDeviceRow = typeof zigbeeDevices.$inferSelect;
export type NewZigbeeDeviceRow = typeof zigbeeDevices.$inferInsert;

/*
 * Alarm system state — singleton (id = 1) with the global armed flag.
 * The semantics are intentionally simple: when `armed` is true, any
 * trigger event from a participating device generates an alarm_event
 * row and pushes `alarm:triggered` over SSE. Disarming clears the
 * "armed" flag and silences pending notifications.
 */
export const alarmState = sqliteTable("alarm_state", {
  id: integer("id").primaryKey().default(1),
  armed: integer("armed", { mode: "boolean" }).notNull().default(false),
  armedAt: text("armed_at"),
  /** Free-text mode label ("home" / "away" / "night") for future
   * use — the current MVP is binary armed/disarmed. */
  mode: text("mode").notNull().default("away"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type AlarmStateRow = typeof alarmState.$inferSelect;

/*
 * Alarm events — audit log of every armed-state trigger. Acknowledgement
 * is tracked per-event so the panel can show a counter of unread
 * incidents until the user explicitly clears them.
 */
export const alarmEvents = sqliteTable("alarm_events", {
  id: text("id").primaryKey(),
  ieeeAddress: text("ieee_address").notNull(),
  friendlyName: text("friendly_name").notNull(),
  /** Discriminator: "contact_open" | "motion" | "tamper" | "leak" | "manual". */
  kind: text("kind").notNull(),
  triggeredAt: text("triggered_at").notNull(),
  acknowledgedAt: text("acknowledged_at"),
  /** Snapshot of the state payload that fired the event. JSON. */
  payload: text("payload").notNull().default("{}"),
});
export type AlarmEventRow = typeof alarmEvents.$inferSelect;
export type NewAlarmEventRow = typeof alarmEvents.$inferInsert;

/*
 * Push notification tokens — one row per (device, platform). Populated
 * by the panel app the first time it boots and gets an APNs token from
 * iOS; the backend uses these to fan out alarm notifications when the
 * panel is closed/backgrounded and the in-app SSE banner can't reach
 * the user.
 */
export const pushTokens = sqliteTable("push_tokens", {
  id: text("id").primaryKey(),
  /** Hex-encoded APNs token (or FCM token for future Android). */
  token: text("token").notNull().unique(),
  /** "ios" today; reserved for "android"/"web" later. */
  platform: text("platform", { enum: ["ios", "android", "web"] })
    .notNull()
    .default("ios"),
  /** Free-text label for the device list ("iPhone Matteo", "iPad cucina"). */
  label: text("label"),
  /** Optional bind to a family member so the panel can show whose
   * device is registered. Null = anonymous. */
  familyMemberId: text("family_member_id").references(() => familyMembers.id, {
    onDelete: "set null",
  }),
  /** Last time this token was refreshed by the app. Used to prune
   * stale tokens after N months of silence. */
  lastSeenAt: text("last_seen_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});
export type PushTokenRow = typeof pushTokens.$inferSelect;
export type NewPushTokenRow = typeof pushTokens.$inferInsert;
