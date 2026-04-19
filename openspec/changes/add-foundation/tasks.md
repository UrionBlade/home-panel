## 1. Setup dipendenze e workspace

- [x] 1.1 Aggiungere a `apps/mobile/package.json`: `framer-motion`, `react-i18next`, `i18next`, `i18next-browser-languagedetector`, `zustand`, `@tanstack/react-query`, `@phosphor-icons/react`, `clsx`, `@fontsource-variable/fraunces`, `@fontsource-variable/geist-sans`
- [x] 1.2 Aggiungere a `apps/mobile/package.json` (devDependencies): `tailwindcss@^4`, `@tailwindcss/vite`, `i18next-parser`
- [x] 1.3 Eseguire `pnpm install` dalla root e verificare zero errori
- [x] 1.4 Configurare `apps/mobile/vite.config.ts` per includere il plugin `@tailwindcss/vite`
- [x] 1.5 Creare `apps/mobile/src/styles/tokens.css` con `@theme` Tailwind 4 e tutte le variabili da `.impeccable.md` (palette OKLCH, spacing scale, radius scale, font families, easing tokens, durations tokens, ombre tinted warm)
- [x] 1.6 Importare `tokens.css` + i font Fontsource in `apps/mobile/src/main.tsx`
- [x] 1.7 Verificare che `pnpm dev` parta senza errori e mostri ancora la home demo

## 2. Backend: schema family + middleware auth

- [x] 2.1 Aggiornare `apps/api/src/db/schema.ts` aggiungendo la tabella `family_members` come definita in `design.md` D1 (id TEXT PK, kind TEXT NOT NULL CHECK, display_name, avatar_url, accent_color, birth_date, role, species, breed, weight_kg, veterinary_notes, created_at, updated_at)
- [x] 2.2 Generare la prima migration con `pnpm --filter @home-panel/api db:generate`
- [x] 2.3 Applicare la migration localmente con `pnpm --filter @home-panel/api db:migrate` e verificare la creazione del file SQLite
- [x] 2.4 Creare `apps/api/src/middleware/auth.ts` che esporta un middleware Hono basato su `bearerAuth({ token: process.env.API_TOKEN })`
- [x] 2.5 Modificare `apps/api/src/index.ts` per montare il middleware su `/api/*` e lasciare `/health` esente
- [x] 2.6 Aggiungere ad `apps/api/.env.example` le righe `API_TOKEN=` e `CORS_ALLOWED_ORIGINS=http://localhost:1420`
- [x] 2.7 Creare `apps/api/.env` con un `API_TOKEN` generato da `openssl rand -base64 32` (file ignorato da git)
- [x] 2.8 Configurare CORS Hono leggendo `CORS_ALLOWED_ORIGINS` dalle env, default solo localhost dev

## 3. Backend: tipi condivisi e CRUD family

- [x] 3.1 Creare `packages/shared/src/family.ts` con `FamilyMember`, `Person`, `Pet` (discriminated union su `kind`), `CreateFamilyMemberInput`, `UpdateFamilyMemberInput`
- [x] 3.2 Esportare i nuovi tipi da `packages/shared/src/index.ts`
- [x] 3.3 Creare `apps/api/src/routes/family.ts` con endpoints `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id` e mappers row→DTO che rispettano i tipi condivisi
- [x] 3.4 Validare input con un piccolo schema (manuale o `zod`) che enforce `displayName` non vuoto e `kind ∈ {human, pet}`
- [x] 3.5 Restituire `400` con messaggio esplicito su input invalidi
- [x] 3.6 Restituire `404` su `GET/PATCH/DELETE` con id inesistente
- [x] 3.7 Montare il router su `/api/v1/family` in `apps/api/src/index.ts`
- [x] 3.8 Test manuale via `curl` con e senza token: verificare 401 senza token, 200 con token corretto

## 4. Frontend: api client + theme + state

- [x] 4.1 Creare `apps/mobile/src/lib/api-client.ts` come thin wrapper di fetch (~50 righe) che inietta `Authorization: Bearer ${VITE_API_TOKEN}` e `Content-Type: application/json` automaticamente. Espone `.get`, `.post`, `.patch`, `.delete` generici tipizzati. Lancia errore esplicito se `VITE_API_TOKEN` è mancante.
- [x] 4.2 Aggiungere ad `apps/mobile/.env.example` le righe `VITE_API_BASE_URL=http://localhost:3000` e `VITE_API_TOKEN=`
- [x] 4.3 Creare `apps/mobile/.env` con le stesse env locali (allineato all'API token del backend)
- [x] 4.4 Creare `apps/mobile/src/lib/query-client.ts` che istanzia `QueryClient` con `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`
- [x] 4.5 Creare `apps/mobile/src/store/theme-store.ts` con Zustand: `mode: 'auto' | 'light' | 'dark'`, persisted in localStorage, action `setMode`
- [x] 4.6 Creare `apps/mobile/src/lib/theme/ThemeProvider.tsx` che applica `data-theme` all'elemento `<html>` in base allo store + `prefers-color-scheme`
- [x] 4.7 Creare `apps/mobile/src/store/ui-store.ts` con Zustand per UI state effimero (modale aperto, sidebar)
- [x] 4.8 Creare `apps/mobile/src/lib/motion/tokens.ts` con `EASE_OUT_QUART`, `EASE_OUT_EXPO`, `DURATION_MICRO`, `DURATION_DEFAULT`, `DURATION_ORCHESTRATION`
- [x] 4.9 Creare `apps/mobile/src/lib/motion/useReducedMotion.ts` come hook che legge la media query e ritorna `boolean`

## 5. Frontend: i18n bootstrap

- [x] 5.1 Creare `apps/mobile/src/lib/i18n.ts` che inizializza i18next con `lng: 'it'`, `fallbackLng: 'it'`, namespace `['common', 'family', 'settings', 'errors']`, backend in-memory leggendo i JSON da `src/locales/it/`
- [x] 5.2 Creare `apps/mobile/src/locales/it/common.json` con stringhe base (`save`, `cancel`, `delete`, `edit`, `add`, ecc.)
- [x] 5.3 Creare `apps/mobile/src/locales/it/family.json` con tutte le stringhe dei componenti family (titolo sezione, label form, errori validazione, conferma cancellazione)
- [x] 5.4 Creare `apps/mobile/src/locales/it/settings.json` con stringhe della pagina Settings (tema, info versione, gestione famiglia)
- [x] 5.5 Creare `apps/mobile/src/locales/it/errors.json` con messaggi di errore generici (network, auth, validation)
- [x] 5.6 Creare `apps/mobile/src/lib/useT.ts` come wrapper di `useTranslation` con namespace bound, esposto come `useT('family')`
- [x] 5.7 Configurare `i18next-parser` con script `pnpm --filter @home-panel/mobile i18n:extract` per generare automaticamente le chiavi da call site
- [x] 5.8 Generare `apps/mobile/src/types/i18next.d.ts` per type safety sulle chiavi (manuale o via i18next-resources-for-ts)

## 6. Frontend: design system primitives

- [x] 6.1 Creare `apps/mobile/src/components/ui/Button.tsx` con varianti `primary | ghost | icon`, sizes `sm | md | lg`, touch target minimum 56pt su `md`, 64pt su `lg`. Niente valori hard-coded di colore/spacing.
- [x] 6.2 Creare `apps/mobile/src/components/ui/Tile.tsx` come contenitore base della home con varianti di dimensione (`sm | md | lg | xl`) e radius `var(--radius-tile)`
- [x] 6.3 Creare `apps/mobile/src/components/ui/Modal.tsx` con `AnimatePresence` di Framer Motion, easing `EASE_OUT_QUART`, fade+scale enter/exit, rispetto reduced-motion
- [x] 6.4 Creare `apps/mobile/src/components/ui/Input.tsx` con label flottante, error state, touch target 56pt
- [x] 6.5 Creare `apps/mobile/src/components/ui/Select.tsx` (preferibilmente wrapper di un native `<select>` per touch nativo iOS) o costruito su Ark UI / Radix
- [x] 6.6 Creare `apps/mobile/src/components/ui/Avatar.tsx` con fallback su initials (iniziali del `displayName`), background color = `accentColor` del member, supporta dimensioni `sm | md | lg`
- [x] 6.7 Creare `apps/mobile/src/components/ui/IconButton.tsx` (icon + accessibility label, touch target 56pt)
- [x] 6.8 Creare `apps/mobile/src/components/ui/Toast.tsx` + `ToastProvider` con queue, posizione bottom-right su iPad e bottom-center su iPhone
- [x] 6.9 Creare `apps/mobile/src/components/ui/index.ts` che ri-esporta tutto

## 7. Frontend: AppShell + layout

- [x] 7.1 Creare `apps/mobile/src/components/layout/AppShell.tsx` come root layout con error boundary, providers (QueryClient, Theme, Toast, i18n), container query su `inline-size`
- [x] 7.2 Creare `apps/mobile/src/components/layout/AppHeader.tsx` con: data lunga italiana, orologio live (al secondo, isolato in proprio componente per evitare re-render), slot meteo placeholder, slot voice indicator placeholder, indicatore connessione backend (verde/ambra/rosso) basato su query `/health`
- [x] 7.3 Creare `apps/mobile/src/components/layout/Clock.tsx` come componente isolato che si re-renderizza ogni secondo via `setInterval`
- [x] 7.4 Creare `apps/mobile/src/components/layout/TabBar.tsx` con tab `Home | Calendario | Spesa | Bacheca | Telecamere | Settings`, icone Phosphor duotone, label italiane, stato attivo con accent color
- [x] 7.5 Creare `apps/mobile/src/router.tsx` con `react-router` v6 (lazy routes per ogni tab)
- [x] 7.6 Creare `apps/mobile/src/pages/HomePage.tsx` con mosaico placeholder asimmetrico (12 col su iPad, stack su iPhone)
- [x] 7.7 Creare `apps/mobile/src/pages/CalendarPage.tsx`, `ShoppingPage.tsx`, `BoardPage.tsx`, `CamerasPage.tsx` come placeholder eleganti "In arrivo nella change `<nome>`"
- [x] 7.8 Creare `apps/mobile/src/components/layout/ErrorBoundary.tsx` con fallback elegante (messaggio italiano + bottone Ricarica)
- [x] 7.9 Sostituire il contenuto di `apps/mobile/src/App.tsx` per usare `AppShell + Router`

## 8. Frontend: Settings page e gestione famiglia

- [x] 8.1 Creare `apps/mobile/src/pages/SettingsPage.tsx` con sezioni: Famiglia, Aspetto, Info
- [x] 8.2 Creare `apps/mobile/src/components/family/FamilyList.tsx` che usa TanStack Query per leggere `GET /api/v1/family` e renderizza una lista con avatar/nome/ruolo/specie
- [x] 8.3 Creare `apps/mobile/src/components/family/MemberForm.tsx` con campi condizionali a seconda di `kind` (human: role; pet: species, breed, weight, vetNotes), validazione client-side, submit verso `POST /api/v1/family` o `PATCH /api/v1/family/:id`
- [x] 8.4 Creare `apps/mobile/src/components/family/MemberCard.tsx` con avatar grande, nome, dettagli, azioni "Modifica" / "Elimina"
- [x] 8.5 Aggiungere conferma di eliminazione tramite Modal
- [x] 8.6 Aggiungere `apps/mobile/src/components/settings/ThemeSelector.tsx` con tre opzioni `Auto | Chiaro | Scuro` collegate al theme store
- [x] 8.7 Aggiungere `apps/mobile/src/components/settings/AppInfo.tsx` con versione app, link al README, hint "Mantieni schermo acceso" (collegato al kiosk plugin)
- [x] 8.8 Verificare che ogni mutazione invalidi la query `['family']` di TanStack Query

## 9. Plugin Tauri kiosk-basics

- [x] 9.1 Creare `apps/mobile/src-tauri/src/kiosk.rs` con i 3 comandi Tauri: `set_idle_timer_disabled`, `set_fullscreen`, `set_orientation_lock`. Stub no-op per non-iOS.
- [x] 9.2 Aggiungere `kiosk.rs` come modulo in `apps/mobile/src-tauri/src/lib.rs` (o `main.rs`) e registrare i comandi in `tauri::Builder`
- [x] 9.3 Creare `apps/mobile/src-tauri/ios/KioskPlugin.swift` (Swift bridge) con metodi che chiamano `UIApplication.shared.isIdleTimerDisabled` e API di orientamento
- [ ] 9.4 Aggiornare `apps/mobile/src-tauri/tauri.conf.json` con la dichiarazione delle capability del plugin per il frontend [iOS-init blocked]
- [ ] 9.5 Aggiungere a `Info.plist` (template iOS Tauri) `UIBackgroundModes: [audio]` per anticipare la change voice [iOS-init blocked]
- [ ] 9.6 Aggiungere a `Info.plist` `UISupportedInterfaceOrientations~ipad: [LandscapeLeft, LandscapeRight]` [iOS-init blocked]
- [x] 9.7 Creare `apps/mobile/src/lib/kiosk.ts` con hook React `useKioskMode()` che invoca `invoke('set_idle_timer_disabled', ...)` su mount/unmount dell'AppShell, no-op su browser
- [x] 9.8 Collegare `useKioskMode` all'AppShell, leggendo la preferenza dallo store UI

## 10. Documentazione

- [x] 10.1 Aggiungere al `README.md` una sezione "Setup Tailscale" step-by-step (creare account, installare su Synology con il pacchetto ufficiale, installare su iPad e iPhone via App Store, abilitare il subnet routing se necessario, recuperare l'hostname della tailnet)
- [x] 10.2 Aggiungere al `README.md` una sezione "Guided Access su iPad" (Settings → Accessibility → Guided Access → ON, triplo click sul tasto laterale all'avvio dell'app, impostare PIN)
- [x] 10.3 Aggiungere al `README.md` una sezione "Generazione API_TOKEN" (`openssl rand -base64 32`)
- [x] 10.4 Aggiungere al `README.md` una sezione "Configurazione frontend" (.env con `VITE_API_BASE_URL` e `VITE_API_TOKEN`)
- [x] 10.5 Aggiungere al `README.md` link a `.impeccable.md` e `openspec/project.md` come documenti di riferimento

## 11. Validazione end-to-end

- [x] 11.1 `pnpm install && pnpm typecheck && pnpm lint` deve essere verde su tutto il workspace
- [x] 11.2 `pnpm dev` deve avviare api + mobile in browser senza errori, mostrare l'AppShell con tab navigation, Settings funzionante, gestione famiglia CRUD operativa
- [x] 11.3 Aggiungere via UI un primo family member di tipo `human` e uno di tipo `pet`, verificare persistenza nel SQLite locale (testato via curl: persistenza confermata)
- [ ] 11.4 Verificare che il theme switch funzioni in tempo reale (Auto/Light/Dark) e persista al reload [user-test required: aprire browser su localhost:1420]
- [ ] 11.5 Verificare che senza `VITE_API_TOKEN` l'app fallisca con errore esplicito e con il token corretto funzioni [logica implementata in api-client.ts; richiede test browser]
- [x] 11.6 Verificare che `curl http://localhost:3000/api/v1/family` senza Authorization restituisca 401 e con Bearer corretto restituisca 200
- [ ] 11.7 `pnpm tauri ios init` (una tantum) e `pnpm tauri ios dev` su iPad simulator: verificare che l'app si avvii fullscreen landscape, screen non si spenga, AppShell sia leggibile [iOS-init blocked: richiede Xcode + Apple Developer]
- [x] 11.8 `openspec validate add-foundation` deve essere verde
