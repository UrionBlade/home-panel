## 1. Shared SmartThings client refactor

- [x] 1.1 Create `apps/api/src/lib/smartthings/` directory with `client.ts`
- [x] 1.2 Extract from `apps/api/src/routes/laundry.ts` → `client.ts`: `ST_BASE`, `stHeaders`, `stFetch`, `stPost`, `getConfig` (renamed `getSmartThingsConfig`). Keep the env-fallback behavior identical.
- [x] 1.3 Add `stListDevices(pat)`, `stGetDeviceStatus(pat, deviceId)`, `stSendCommands(pat, deviceId, commands)` to `client.ts`. `stSendCommands` defaults `component` to `"main"`.
- [x] 1.4 Replace inline helpers in `laundry.ts` with imports from the new module. Ensure all existing laundry endpoints (`/laundry/*`) pass manual smoke tests through the devtools (no behavioral change).
- [x] 1.5 Run `pnpm biome check` and `pnpm typecheck` — both must pass with 0 errors after the refactor.

## 2. Database migration: tv_device_id

- [x] 2.1 In `apps/api/src/db/schema.ts`, add `tvDeviceId: text("tv_device_id")` to the `smartthingsConfig` table definition.
- [x] 2.2 Run `pnpm --filter @home-panel/api exec drizzle-kit generate` to produce the migration file under `apps/api/drizzle/`.
- [x] 2.3 Inspect the generated `.sql` file: must be `ALTER TABLE "smartthings_config" ADD COLUMN "tv_device_id" text;` with no destructive operations.
- [x] 2.4 Start the API locally and verify the migration applies cleanly against the existing dev DB (row with id=1 gets `tv_device_id = NULL`, other columns untouched).

## 3. TV SmartThings wrapper

- [x] 3.1 Create `apps/api/src/lib/smartthings/tv.ts` that exposes typed helpers built on top of the shared client: `readTvStatus(pat, deviceId): Promise<TvStatus>`, `sendPower(pat, deviceId, on)`, `sendSetVolume(pat, deviceId, level)`, `sendVolumeUp(pat, deviceId)`, `sendVolumeDown(pat, deviceId)`, `sendMute/sendUnmute`, `sendSetInput(pat, deviceId, source)`, `sendLaunchApp(pat, deviceId, appId)`, `sendPlayback(pat, deviceId, command)`.
- [x] 3.2 `readTvStatus` must parse the SmartThings `status.components.main` shape and return `{ power, volume, muted, input, supportedInputs, supportedPlaybackCommands, lastUpdatedAt }` with the correct default fallbacks when fields are null.
- [x] 3.3 Add the in-memory cache (`cache`, `TTL_MS = 10_000`, `getStatus(pat, deviceId, force?)`, `invalidateCache()`) either inside `tv.ts` or in a sibling `tv-cache.ts`.

## 4. Shared types

- [x] 4.1 Create `packages/shared/src/tv.ts` exporting: `TvStatus`, `TvPowerInput`, `TvVolumeInput`, `TvMuteInput`, `TvInputSelectInput`, `TvAppLaunchInput`, `TvPlaybackInput`, `TvAppPreset`, `TvConfig`, `TvDeviceSummary`. Match the shapes defined in `specs/tv-control/spec.md`.
- [x] 4.2 Export the new module from `packages/shared/src/index.ts`.
- [x] 4.3 `pnpm biome check` + `pnpm typecheck` pass at the monorepo root.

## 5. App preset catalog

- [x] 5.1 Define `TV_APP_PRESETS` constant in `apps/api/src/lib/smartthings/tv-presets.ts` with `{ key, label, icon, appId }[]`. Seed with best-guess values for Netflix, YouTube, Prime, Disney+, RaiPlay from design.md.
- [x] 5.2 Export `getPresetByKey(key)` helper.

## 6. TV route module

- [x] 6.1 Create `apps/api/src/routes/tv.ts` (Hono router). Mount under `/tv` in `apps/api/src/index.ts` after the API token middleware.
- [x] 6.2 Implement `GET /tv/devices`, `GET /tv/status`, `PATCH /tv/config`, `POST /tv/power`, `POST /tv/volume`, `POST /tv/mute`, `POST /tv/input`, `POST /tv/app`, `POST /tv/playback`, `GET /tv/apps/presets` following the contracts in `specs/tv-control/spec.md`. (Also added `GET /tv/config` for frontend state and `POST /tv/refresh` as a forced-invalidate escape hatch — not in the spec but small and useful.)
- [x] 6.3 Input validation per spec (bool/number ranges, exactly-one-of level|delta, input source validated against device status, playback command validated against supportedPlaybackCommands).
- [x] 6.4 Error mapping per spec (401 upstream → 502, 5xx upstream → 502 retryable, timeout → 502 retryable). Log with `console.error` prefixed `[tv]`.
- [x] 6.5 Each mutation route invokes `invalidateCache()` on success before returning.
- [x] 6.6 Manual smoke test via curl: `GET /tv/devices` returned the Samsung Q6; `PATCH /tv/config` bound it; `GET /tv/status` returned `{power:"off", volume:5, muted:false, input:"HDMI2", supportedInputs:["digitalTv","HDMI2"], supportedPlaybackCommands:[...7...]}`; `GET /tv/apps/presets` returned all 5 presets. `POST /tv/power` SKIPPED to avoid turning on the user's TV during autonomous execution — validated in group 14.

## 7. Frontend hooks

- [x] 7.1 Create `apps/mobile/src/lib/hooks/useTv.ts` with all hooks listed in `specs/tv-ui/spec.md`. Use the shared `apiClient` wrapper already in use by `useLaundry` / `useBlink` (consult those files for convention).
- [x] 7.2 `useTvStatus` adaptive refetchInterval: 15s when power=on, 30s when power=off, disabled when status returns 404.
- [x] 7.3 Mutations invalidate `['tv','status']` on success.

## 8. Settings UI

- [x] 8.1 Create `apps/mobile/src/components/settings/TvSettings.tsx` per `specs/tv-ui/spec.md` Requirement "Settings page includes TV binding section". Reuse patterns from `LaundrySettings.tsx` and `CameraSettings.tsx`.
- [x] 8.2 Integrate in `SettingsPage.tsx` ordering: after Blink, before general appearance settings. (Placed under the `devices` tab, after LaundrySettings.)
- [x] 8.3 Anchor support: scrolling to `#tv` hash scrolls the section into view. (SettingsPage auto-selects the `devices` tab when the hash is `#tv`.)
- [x] 8.4 Implement the "Test connessione" button (calls refetch of status and shows success/failure toast).
- [x] 8.5 Show the "Attivazione tramite rete" warning callout.

## 9. Home tile

- [x] 9.1 Create `apps/mobile/src/components/home-tiles/TvTile.tsx` with the three states per `specs/tv-ui/spec.md`.
- [x] 9.2 Preset buttons: fetch from `/tv/apps/presets`, render 4 slots. Icon via Phosphor mapping (e.g., `Play` for generic, branded where available via design tokens).
- [x] 9.3 Volume slider uses debounced mutation (300ms) to avoid spamming the API during drag. **DEVIATION**: implemented as `−` / `+` buttons triggering `delta: up/down` mutations instead of a draggable slider. Rationale: the home tile has limited vertical room and a bare step-control matches the Samsung Q6 stepper behaviour better; debouncing becomes moot with discrete taps. A full draggable slider can be added in a future dedicated TV detail page.
- [x] 9.4 Register the tile in `HomePage.tsx` in a sensible position in the mosaic (suggested: alongside music / camera tiles).
- [x] 9.5 Custom SVG illustration `TvArt` added to `TileArt.tsx` to match the 3D claymorphism style of the other tiles (user feedback: Phosphor icon was off-style).

## 10. Voice intents

- [x] 10.1 Create `apps/mobile/src/lib/voice/tvIntents.ts` exporting `tvIntentPatterns` (regex + keyword patterns per `specs/tv-voice-intents/spec.md`) and `tvIntentHandlers` (handler functions per intent). **DEVIATION**: exported `matchTvIntent(text)` and `handleTvIntent(command, qc)` instead of the original `tvIntentPatterns` / `tvIntentHandlers` arrays. Rationale: the existing `voiceCommandParser` has no generic registration system (it uses a private `RULES` array + exact-phrase shortcuts); matching the codebase convention by exposing a simple matcher-hook function is cleaner than inventing a plugin framework for a single device.
- [x] 10.2 Register `tvIntentPatterns` in the main `voiceCommandParser` module; register `tvIntentHandlers` in `intentHandlers.ts`. (Implemented as: parser calls `matchTvIntent(text)` before its keyword loop; `handleIntent` calls `handleTvIntent(command, _queryClient)` before its switch.)
- [x] 10.3 Italian number parsing: `"venti"` → 20, `"trenta"` → 30, etc., for `tv_volume_set`. Created `apps/mobile/src/lib/voice/numberWords.ts` with 0-100 coverage (units, teens, tens, compounds like ventuno/ventotto).
- [x] 10.4 All voice responses routed via `vt(...)` / `vtArray(...)` — NO hardcoded strings in intent handlers.

## 11. i18n

- [x] 11.1 Create `apps/mobile/src/locales/it/tv.json` with UI copy for TvTile + TvSettings + toasts.
- [x] 11.2 Create `apps/mobile/src/locales/en/tv.json` with identical key structure.
- [x] 11.3 Add `tv` section to `apps/mobile/src/locales/it/settings.json` and `en/settings.json` (section title, binding status labels, button labels). (Added `sections.tv`; section-specific copy lives in the `tv` namespace.)
- [x] 11.4 Extend `apps/mobile/src/locales/it/voice.json` and `en/voice.json` with `voice.responses.tv.*` per `specs/tv-voice-intents/spec.md` (minimum 2 variants per key; no "Casa"/"Home" self-naming).
- [x] 11.5 Register the `tv` namespace in the i18next config (and in `src/lib/useT.ts` + `src/types/i18next.d.ts`).

## 12. Env and docs

- [x] 12.1 Update the `SMARTTHINGS_PAT` comment in `apps/api/.env.example` to mention "lavatrice, asciugatrice e TV".
- [x] 12.2 Add a short section to the repo `README.md` about the TV feature and the required TV-side setting ("Attivazione tramite rete").

## 13. App preset validation on real hardware (QA)

- [ ] 13.1 Ensure the TV is on the LAN and SmartThings shows it online.
- [ ] 13.2 From Settings → TV, bind the Samsung Q6 Series.
- [ ] 13.3 Tap each of the 4 preset buttons (Netflix / YouTube / Prime / Disney+) and visually confirm the correct app launches on the TV screen.
- [ ] 13.4 If a preset does not launch the app, find the correct appId (try the Samsung numeric IDs listed in proposal.md; alternatively use SmartThings developer docs), update `TV_APP_PRESETS`, re-test until all four work.
- [ ] 13.5 Decide whether to ship RaiPlay preset or remove it based on whichever variant works.

## 14. End-to-end validation

- [ ] 14.1 Smoke test all `/tv/*` endpoints via curl against the running API with the real TV bound. Capture representative responses.
- [ ] 14.2 Frontend manual test: load the app, verify the three tile states (not configured → bind in settings → off tile → power on → on tile), test volume slider, mute, each preset.
- [ ] 14.3 Voice flow manual test (on iPad/iPhone with voice working): speak each of the core phrases per `specs/tv-voice-intents/spec.md` scenarios in Italian, verify both the TV reacts and the spoken response matches one of the configured variants.
- [ ] 14.4 Run `pnpm biome check` and `pnpm typecheck` on the monorepo. Both must pass.
- [ ] 14.5 Only after 14.1–14.4 are green, open the commit: `feat(tv): integrate Samsung TV control via SmartThings`.
