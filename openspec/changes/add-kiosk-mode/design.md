## Context

Il pannello vive sempre acceso a parete. Senza modalità notte, lo schermo a piena luminosità diventa fastidioso quando le luci di casa si abbassano. Senza screensaver, lo schermo statico per ore brucia (anche se LCD non OLED, è comunque "morto" visivamente). L'utente vuole un'esperienza che si adatta al ciclo della casa: attiva di giorno, calma di sera, photo display di notte/quando inattivo.

Le 3 capability sono indipendenti ma coordinate via `useKioskMode` hook + `NightModeProvider`. La complessità tecnica è nel plugin Tauri Swift bridge per la luminosità: serve un piccolo handler nativo perché iOS Web API non espone brightness control.

## Goals / Non-Goals

### Goals

1. Night mode automatico per orario configurabile, con palette/animazioni dimmate
2. Photo screensaver alimentato dal Synology
3. Brightness control nativo via plugin Tauri
4. Coordinazione automatica delle 3 cose tra loro
5. Tutto disabilitabile dalla Settings → Schermo

### Non-Goals

- **Niente light sensor / auto brightness adattivo all'ambiente**. L'iPad ha un sensore ma usarlo richiede privilegi che non abbiamo. Brightness fissa per orario.
- **Niente photo upload da app**. Le foto si caricano via SMB/AFP/Synology Photos sul NAS. L'app le legge readonly.
- **Niente face detection o AI sulle foto**. Slideshow random.
- **Niente video screensaver**.
- **Niente Apple TV-style transitions**. Solo Ken Burns + crossfade semplice.
- **Niente sync delle foto in tempo reale**. Cache 5 minuti sulla lista, refresh manuale possibile.

## Decisions

### D1. Schema settings come singola riga key/value

```sql
CREATE TABLE kiosk_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row enforced
  night_mode_enabled INTEGER NOT NULL DEFAULT 1,
  night_start_hour INTEGER NOT NULL DEFAULT 22,
  night_end_hour INTEGER NOT NULL DEFAULT 7,
  night_brightness REAL NOT NULL DEFAULT 0.25,
  screensaver_enabled INTEGER NOT NULL DEFAULT 1,
  screensaver_idle_minutes INTEGER NOT NULL DEFAULT 5,
  photos_dir TEXT NOT NULL DEFAULT '/data/photos',
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
```

Singola riga garantita dal `CHECK (id = 1)`. Più semplice di un sistema key/value generico.

### D2. NightModeProvider come Context React

**Decisione**: il `NightModeProvider` è un Context che espone `{ isNight, isManualOverride, toggleManual }`. Internamente:
- Polling ogni minuto per verificare l'ora vs `nightStartHour`/`nightEndHour`
- Effect per applicare `data-night-mode` su `<html>`
- Coordina con `useKioskMode` per la luminosità

```tsx
function NightModeProvider({ children }) {
  const { data: settings } = useKioskSettings();
  const [isNight, setIsNight] = useState(false);

  useEffect(() => {
    const tick = () => {
      const hour = new Date().getHours();
      const inRange = isInNightRange(hour, settings.nightStartHour, settings.nightEndHour);
      setIsNight(settings.nightModeEnabled && inRange);
    };
    tick();
    const interval = setInterval(tick, 60_000);
    return () => clearInterval(interval);
  }, [settings]);

  useEffect(() => {
    document.documentElement.dataset.nightMode = isNight ? 'true' : '';
  }, [isNight]);

  return <NightModeContext.Provider value={{ isNight }}>{children}</NightModeContext.Provider>;
}
```

### D3. Range cross-midnight handling

```ts
function isInNightRange(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;     // 22:00 → 23:59 (no cross)
  return hour >= start || hour < end;                       // 22:00 → 07:00 (cross)
}
```

### D4. CSS variables override file separato

**Decisione**: `apps/mobile/src/styles/night-mode.css` contiene solo `[data-night-mode="true"] { ... }` con tutte le override delle variabili CSS. Importato in `main.tsx` dopo `tokens.css` per priorità di cascade corretta.

```css
[data-night-mode="true"] {
  --color-bg: oklch(10% 0.012 60);
  --color-surface: oklch(15% 0.014 60);
  --color-text: oklch(85% 0.005 80);
  --color-accent-primary: oklch(50% 0.10 50);
  --shadow-default: oklch(5% 0.02 60 / 0.4);
  --duration-default: 600ms;  /* slower */
  --duration-micro: 400ms;
}
```

### D5. Idle detection con event listeners globali

```tsx
function useIdleDetection(timeoutMs: number) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<number>();

  useEffect(() => {
    const reset = () => {
      setIsIdle(false);
      clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setIsIdle(true), timeoutMs);
    };

    const events = ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'keydown'];
    events.forEach(e => window.addEventListener(e, reset));
    reset();

    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      clearTimeout(timerRef.current);
    };
  }, [timeoutMs]);

  return isIdle;
}
```

### D6. ScreensaverOverlay come componente top-level

**Decisione**: il `<ScreensaverOverlay>` vive a livello di `AppShell` (non dentro singole pagine), così intercetta correttamente l'idle indipendentemente dalla tab attiva. Z-index altissimo per stare sopra tutto.

```tsx
function AppShell({ children }) {
  const isIdle = useIdleDetection(SCREENSAVER_IDLE_MS);
  const settings = useKioskSettings();
  const showScreensaver = isIdle && settings.screensaverEnabled;

  return (
    <NightModeProvider>
      <div className="app-shell">
        {children}
        <AnimatePresence>
          {showScreensaver && <ScreensaverOverlay onDismiss={resetIdle} />}
        </AnimatePresence>
      </div>
    </NightModeProvider>
  );
}
```

### D7. Photo loader nel backend

**Decisione**: `apps/api/src/lib/photos-loader.ts` legge la directory all'avvio + cache in memoria per 5 minuti. Refresh on-demand con `POST /api/v1/kiosk/photos/refresh`.

```ts
let photosCache: { items: string[]; loadedAt: number } | null = null;

export async function listPhotos(): Promise<string[]> {
  const TTL = 5 * 60 * 1000;
  if (photosCache && Date.now() - photosCache.loadedAt < TTL) {
    return photosCache.items;
  }
  const files = await fs.readdir('/data/photos');
  const photos = files.filter(f => /\.(jpe?g|png|heic)$/i.test(f));
  photosCache = { items: photos, loadedAt: Date.now() };
  return photos;
}
```

### D8. Plugin Tauri brightness via Swift bridge

**Decisione**: aggiungo a `src-tauri/src/kiosk.rs` due nuovi comandi che chiamano i metodi Swift via FFI bridge.

```rust
#[tauri::command]
async fn set_brightness(level: f32) -> Result<(), String> {
  #[cfg(target_os = "ios")]
  {
    unsafe { ios_set_brightness(level.clamp(0.0, 1.0)) };
  }
  Ok(())
}

#[tauri::command]
async fn get_brightness() -> Result<f32, String> {
  #[cfg(target_os = "ios")]
  {
    Ok(unsafe { ios_get_brightness() })
  }
  #[cfg(not(target_os = "ios"))]
  Ok(1.0)
}
```

Lato Swift:
```swift
@_cdecl("ios_set_brightness")
public func ios_set_brightness(_ level: Float) {
  DispatchQueue.main.async {
    UIScreen.main.brightness = CGFloat(level)
  }
}

@_cdecl("ios_get_brightness")
public func ios_get_brightness() -> Float {
  Float(UIScreen.main.brightness)
}
```

### D9. Docker volume readonly per le foto

**Decisione**: aggiungere al `docker-compose.yml` un bind mount **readonly** della cartella foto del Synology:

```yaml
services:
  api:
    volumes:
      - ./data:/data
      - /volume1/photo/HomePanel:/data/photos:ro    # NEW
```

Il `:ro` previene scrittura accidentale dal container. L'utente carica le foto via Synology Photos / SMB / Drive sull'NAS, e il backend le legge.

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| iOS può negare brightness control in alcuni contesti | Documentato. Fallback no-op se la chiamata fallisce. |
| Foto HEIC non sono supportate da WebKit nativamente | Filtrare a `.jpg/.jpeg/.png` solo nella lista screensaver. HEIC ignorato per ora (l'utente usa JPG). |
| Volume bind path Synology cambia tra setup utenti | Documentato nel README come variabile d'ambiente `PHOTOS_HOST_PATH`, default `/volume1/photo/HomePanel`. |
| Ken Burns animation a 60fps su iPad gen 2 vs gen 3 | iPad Pro 11" gen 2 (A12Z) e gen 3 (M1) gestiscono entrambi senza problemi. Test su simulator + device reale. |
| Idle detection può confliggere con drag dei post-it | Il drag emette `mousemove`/`touchmove`, quindi resetta correttamente il timer. |
| Path traversal nelle photo URL | Sanitization rigorosa nel route handler: `path.basename()` + check directory contained. |
| Refresh foto manuale: l'utente carica nuove foto e non le vede subito | Bottone "Refresh foto" in Settings → Schermo + auto-refresh ogni 5 min |

## Migration Plan

1. Schema kiosk_settings + seed riga 1
2. Plugin Tauri esteso con set/get brightness
3. Backend photos endpoint
4. NightModeProvider + CSS file
5. ScreensaverOverlay + idle detection
6. Settings UI
7. Test su iPad real device

**Rollback**: revert. La luminosità potrebbe rimanere al valore impostato; documentare nel rollback come ripristinare manualmente da iOS Settings.

## Open Questions

1. **Quando il volume Synology è offline**: il backend gestisce graceful o crasha? — *Proposta*: graceful, lista vuota, screensaver fallback su orologio.
2. **Night mode su iPhone**: ha senso o è solo per iPad? — *Proposta*: stesso comportamento, anche su iPhone (così quando l'iPhone è in casa di sera è coerente).
3. **Configurazione fine come "weekend hours diversi"**: utile? — *Proposta*: no per ora, troppo pochi use case.
4. **Foto come tile in home invece di solo screensaver**: una tile "Album famiglia" con slideshow miniaturizzato? — *Proposta*: no, tieni separate le concerne.
