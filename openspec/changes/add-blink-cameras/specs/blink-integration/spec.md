## ADDED Requirements

### Requirement: Blink credentials are encrypted at rest

Il sistema SHALL persistere le credenziali Blink (email + password + refresh token) nel database SQLite **criptate** con AES-256-GCM. La chiave di cifratura SHALL essere letta dall'env `BLINK_ENCRYPTION_KEY` (32 byte base64), generata una sola volta dall'utente con `openssl rand -base64 32` e mantenuta solo nel `.env` del backend (mai committata, mai inviata al frontend).

#### Scenario: Save credentials encrypted
- **WHEN** l'utente invia `POST /api/v1/blink/credentials` con `{ "email": "x@y.com", "password": "secret123" }`
- **THEN** il backend SHALL criptare la password con AES-GCM usando `BLINK_ENCRYPTION_KEY`
- **AND** SHALL persistere `email` in chiaro + `password` come ciphertext base64 + IV
- **AND** SHALL fare login a Blink subito per verificare le credenziali
- **AND** in caso di successo SHALL salvare anche `refreshToken` (criptato)
- **AND** SHALL restituire `200 OK` con `{ valid: true, syncModuleId, cameraCount }`

#### Scenario: Reject without encryption key
- **GIVEN** la env `BLINK_ENCRYPTION_KEY` non è impostata
- **WHEN** un client invia POST credentials
- **THEN** il backend SHALL rispondere `500 Internal Server Error` con messaggio chiaro "BLINK_ENCRYPTION_KEY non configurata"
- **AND** SHALL loggare l'errore di setup

#### Scenario: Decrypt to use credentials
- **WHEN** il backend deve fare una chiamata API a Blink
- **THEN** SHALL leggere le credenziali criptate dal DB e decriptarle in memoria
- **AND** la versione in chiaro SHALL essere mai loggata, mai persistita altrove

### Requirement: Cameras list reflects Blink account state

Il sistema SHALL mantenere la tabella `blink_cameras` sincronizzata con lo stato dell'account Blink dell'utente. La sincronizzazione SHALL avvenire:
- Al primo login (POST credentials)
- Su `POST /api/v1/blink/cameras/sync` per refresh manuale
- Ogni 30 minuti come job background

Per ogni camera SHALL persistere: `id` (Blink camera id), `name`, `type` (`camera | doorbell`), `syncModuleId`, `isOnline`, `lastSeenAt`, `motionEnabled`, `snapshotUrl`.

#### Scenario: Initial sync after login
- **GIVEN** l'utente ha appena salvato le credenziali Blink
- **WHEN** il backend completa il login
- **THEN** SHALL chiamare `getCameras()` della libreria Blink
- **AND** SHALL inserire/aggiornare ogni camera in `blink_cameras` (upsert su id)
- **AND** SHALL marcare correttamente il `type` (la libreria Blink distingue camera vs doorbell)

#### Scenario: List cameras endpoint
- **WHEN** un client invia `GET /api/v1/blink/cameras`
- **THEN** il backend SHALL restituire array di tutte le camere persistenti
- **AND** ognuna SHALL avere `name`, `type`, `isOnline`, `snapshotUrl`

### Requirement: Snapshots are fetched on-demand

Il backend SHALL esporre `GET /api/v1/blink/cameras/:id/snapshot` che ritorna l'ultimo snapshot disponibile (o richiede uno nuovo a Blink se l'ultimo è > 5 minuti). Il client riceve un URL dell'immagine (servita dal backend stesso, non direttamente da AWS).

#### Scenario: Fresh snapshot
- **WHEN** un client invia `GET /api/v1/blink/cameras/<id>/snapshot`
- **AND** l'ultimo snapshot ha più di 5 minuti
- **THEN** il backend SHALL chiamare `requestSnapshot()` su Blink, attendere il refresh
- **AND** SHALL scaricare l'immagine, salvarla temporaneamente, ritornare l'URL del servizio interno

#### Scenario: Cached snapshot
- **WHEN** l'ultimo snapshot ha < 5 minuti
- **THEN** il backend SHALL servire quello cached senza chiamare Blink

### Requirement: Motion clips are synced and stored on Synology

Il sistema SHALL pollare l'API Blink ogni **5 minuti** (configurable) per nuovi motion events. Per ogni nuovo evento SHALL:
1. Scaricare il clip MP4
2. Salvarlo in `/data/blink_clips/<camera_id>/<event_id>.mp4` (volume montato sul Synology)
3. Generare e salvare una thumbnail JPEG
4. Inserire un record in `blink_motion_clips`

Il polling SHALL essere implementato come job in `setInterval` nel backend, avviato all'avvio se le credenziali Blink sono presenti.

#### Scenario: New motion clip is downloaded
- **GIVEN** la camera "Esterno" ha 1 nuovo motion event
- **WHEN** il job di sync gira
- **THEN** SHALL scaricare l'MP4 in `/data/blink_clips/<id>/<event-id>.mp4`
- **AND** SHALL salvare un record in `blink_motion_clips` con `localPath`, `recordedAt`, `durationSec`, `fileSizeBytes`
- **AND** SHALL generare una thumbnail JPEG

#### Scenario: Already-downloaded clip is skipped
- **WHEN** il job rileva un motion event con id già presente in `blink_motion_clips`
- **THEN** SHALL skippare il download
- **AND** SHALL non duplicare

#### Scenario: Sync errors don't crash
- **WHEN** Blink restituisce errore o il file non scarica
- **THEN** il job SHALL loggare l'errore
- **AND** SHALL marcare il clip come "to retry" (campo `lastErrorAt`)
- **AND** SHALL continuare con gli altri eventi

### Requirement: Clips older than 30 days are auto-deleted

Il sistema SHALL eseguire un job di cleanup ogni notte alle 03:00 (cron-like) che cancella i clip MP4 e thumbnail dei `blink_motion_clips` con `recordedAt` più vecchio di **30 giorni** (configurabile dall'utente in Settings → Telecamere → Retention). Le righe SHALL essere rimosse dal database insieme al file fisico.

#### Scenario: Cleanup removes old clips
- **GIVEN** ci sono 100 clip nel DB, di cui 20 più vecchi di 30 giorni
- **WHEN** il job notturno gira
- **THEN** SHALL cancellare i 20 file MP4 + thumbnails dal volume
- **AND** SHALL rimuovere i 20 record dal DB
- **AND** SHALL loggare "Cleanup: 20 clip rimossi, ~XGB liberati"

#### Scenario: Configurable retention
- **WHEN** l'utente cambia il retention da 30 a 60 giorni
- **THEN** il job successivo SHALL applicare il nuovo valore
- **AND** SHALL non cancellare clip < 60 giorni

### Requirement: Live view streams via HLS

Il backend SHALL esporre `GET /api/v1/blink/cameras/:id/live` che:
1. Richiede a Blink di avviare lo stream live
2. Restituisce un URL m3u8 (HLS) o il body diretto dello stream
3. Il client usa HLS.js per riprodurre

Lo stream Blink termina automaticamente dopo ~30 secondi (limite Blink). Il client SHALL gestire la riconnessione automatica se l'utente vuole continuare a guardare.

#### Scenario: Start live view
- **WHEN** un client invia `GET /api/v1/blink/cameras/<id>/live`
- **THEN** il backend SHALL chiamare `startLiveStream()` di Blink
- **AND** SHALL restituire `{ url: "https://...m3u8", expiresAt: <30s da ora> }`

#### Scenario: Stream auto-expires
- **WHEN** il client riproduce lo stream e arriva a 30s
- **THEN** Blink SHALL terminare lo stream
- **AND** il client SHALL mostrare un bottone "Continua" per richiedere un nuovo stream
