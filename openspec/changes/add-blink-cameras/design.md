## Context

Blink (Amazon) non offre API ufficiali pubbliche per sviluppatori. Esistono solo librerie reverse-engineered che usano la stessa API che usa l'app mobile ufficiale Blink (privata). Le più note:
- **`blinkpy`** (Python, mantenuto, ottimo per home automation) — Home Assistant lo usa
- **`node-blink-security`** (Node, vecchiotto)
- **`blink-camera`** (Node, esiste su npm con vari fork)

Questa change adopta esplicitamente un approccio **best-effort**: scegliamo la libreria Node attualmente più mantenuta, e accettiamo che possa rompersi quando Blink cambia API. Documentiamo nel README che la feature può essere temporaneamente non funzionante e va aggiornata tramite update.

Il videocitofono è il caso d'uso prioritario perché interrompe la routine ("qualcuno suona alla porta"). La latenza max di 10s nel polling è il compromesso tra "sembrare vivace" e "non sbattere l'API Blink troppo".

## Goals / Non-Goals

### Goals

1. Login Blink + sync cameras
2. Snapshot on-demand
3. Live view via HLS
4. Motion clip download + storage Synology + retention 30gg
5. Doorbell interrupting overlay con audio bidirezionale
6. SSE per push events realtime
7. Settings UI per setup credenziali
8. Tutto dietro security: credenziali criptate, no leak, accesso solo via tailnet

### Non-Goals

- **Niente recording continuo 24/7**. Blink non lo offre nativamente, troppi hack richiesti.
- **Niente integrazione con altri brand di telecamere** (Reolink, Ubiquiti, ecc.). Solo Blink in questa change.
- **Niente analisi AI dei video** (rilevamento volti, persone, animali). Solo visualizzazione.
- **Niente notifica push fuori app** (APNs). Le notifiche arrivano solo se l'app è in foreground (limitazione iOS background mode + scope progetto).
- **Niente integrazione con HomeKit/Alexa**.
- **Niente moduli di sicurezza extra** (allarme, sensori finestra). Quelli vivono in `add-home-security-module` futuro.

## Decisions

### D1. Libreria Blink: TBD in implementazione

**Decisione**: in implementazione valutiamo:
1. **`blinkpy` via subprocess** — usare la libreria Python più solida via child process Node. Stabile ma fastidioso da bundlare in container.
2. **Node port di blinkpy** — esiste un porting parziale, da valutare freshness.
3. **Implementazione custom dei endpoint Blink** — leggendo il sorgente di blinkpy. Più lavoro ma niente dipendenze fragile.

**Proposta iniziale**: opzione 3 (custom). I main endpoint Blink sono ~10 chiamate HTTP, ben documentate dall'engineering reverse di blinkpy. Implementiamo un client minimal ad-hoc che fa solo quello che ci serve (login, list cameras, snapshot, live, motion clips).

### D2. Crittografia credenziali AES-GCM

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encrypt(plaintext: string, key: Buffer): { ciphertext: string; iv: string; tag: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}
```

Chiave da `process.env.BLINK_ENCRYPTION_KEY` (32 bytes, base64). Documentato nel README come generare con `openssl rand -base64 32`.

### D3. Server-Sent Events per push realtime

**Decisione**: usare SSE invece di WebSocket. Hono ha supporto nativo per SSE via `streamSSE`. Vantaggi:
- One-way (server → client) basta per i nostri eventi
- HTTP standard, niente upgrade handshake
- Riconnessione automatica nativa nel browser
- Più semplice di WebSocket

```ts
import { streamSSE } from 'hono/streaming';

app.get('/api/v1/sse', (c) => {
  return streamSSE(c, async (stream) => {
    eventEmitter.on('blink:doorbell-pressed', async (event) => {
      await stream.writeSSE({
        event: 'blink:doorbell-pressed',
        data: JSON.stringify(event),
        id: String(Date.now()),
      });
    });

    // Heartbeat
    while (true) {
      await stream.writeSSE({ event: 'heartbeat', data: 'ping' });
      await stream.sleep(30_000);
    }
  });
});
```

**Alternative considerate**:
- *WebSocket*: bidirezionale, ma overkill per il nostro caso
- *Long polling*: meno efficiente

### D4. Polling intervals separati

**Decisione**: due polling separati con interval diversi:
- **Doorbell poller**: ogni 10 secondi (latenza accettabile per "ehi qualcuno è alla porta")
- **Motion sync**: ogni 5 minuti (l'utente non ha bisogno di vedere subito i clip motion)

Entrambi sono `setInterval` lanciati al boot del backend se le credenziali Blink sono presenti.

### D5. Storage clip su volume Synology

```yaml
# docker-compose.yml
services:
  api:
    volumes:
      - ./data:/data
      - /volume1/photo/HomePanel:/data/photos:ro
      - /volume1/docker/home-panel/blink_clips:/data/blink_clips    # NEW
```

L'utente deve creare la cartella `/volume1/docker/home-panel/blink_clips` sul Synology prima del primo deploy. Documentato nel README.

### D6. Cleanup retention via setInterval cron-like

**Decisione**: niente librerie cron complesse. Job semplice che gira ogni 6 ore e controlla quale clip rimuovere.

```ts
async function cleanupOldClips() {
  const cutoff = Date.now() - settings.retentionDays * 24 * 60 * 60 * 1000;
  const oldClips = await db.select().from(blinkMotionClips).where(lt(blinkMotionClips.recordedAt, new Date(cutoff)));
  for (const clip of oldClips) {
    await fs.unlink(clip.localPath).catch(() => {});
    await fs.unlink(clip.thumbnailPath).catch(() => {});
    await db.delete(blinkMotionClips).where(eq(blinkMotionClips.id, clip.id));
  }
  console.log(`Cleanup: removed ${oldClips.length} clips`);
}

setInterval(cleanupOldClips, 6 * 60 * 60 * 1000);
```

### D7. HLS player con hls.js

**Decisione**: usare `hls.js` (https://github.com/video-dev/hls.js) sul frontend. Safari iOS supporta nativamente HLS via `<video>` ma per uniformità usiamo HLS.js per gestire la riconnessione e gli eventi custom.

```tsx
import Hls from 'hls.js';

useEffect(() => {
  if (!videoRef.current) return;
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(videoRef.current);
    hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play());
    return () => hls.destroy();
  } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
    videoRef.current.src = streamUrl;
    videoRef.current.play();
  }
}, [streamUrl]);
```

### D8. Doorbell sound bundled

**Decisione**: il file audio del campanello è un asset bundlato in `apps/mobile/public/sounds/doorbell.mp3`. ~30KB. L'utente può sostituirlo con un suo file caricando uno alternativo via Settings (TBD se aggiungere questa feature).

### D9. Two-way audio Blink

**Decisione**: il videocitofono Blink supporta audio bidirezionale tramite la stessa libreria che fa il live view. Implementazione richiede:
1. WebRTC o protocollo nativo Blink (da verificare in libreria)
2. Permesso microfono iOS (lo abbiamo già richiesto per voice control)
3. Push-to-talk gesture sul bottone

Se la libreria scelta non supporta two-way, fallback a "solo audio in entrata".

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Blink rompe l'API e la libreria smette di funzionare | Documentato nel README come "best-effort". Update del client custom richiesto. Eventualmente fallback a snapshot manuali. |
| Credenziali in chiaro nel DB se la chiave AES viene persa | Documentazione chiara: backup della env `BLINK_ENCRYPTION_KEY`. Senza di essa, l'utente deve re-loggare. |
| Polling 10s troppo aggressivo per Blink rate limit | Backoff esponenziale su rate limit error. Se Blink restituisce 429, raddoppia l'interval temporaneamente. |
| Clip MP4 grandi possono saturare il volume Synology | Cleanup retention 30gg + monitor space disponibile (futuro). |
| HLS player su iPad WKWebView può avere bug rari | Test su simulator + device. Fallback a `<video>` nativo se HLS.js fallisce. |
| Two-way audio richiede setup WebRTC complesso | Se troppo complesso, fallback a "solo audio in entrata" (vedi camera + senti chi suona, ma non puoi rispondere). Documentato come limitazione. |
| Doorbell auto-dismiss 60s può perdere call importanti | L'evento è persistito nel DB come "missed", l'utente lo vede dopo nei clip. |
| SSE può chiudersi su iOS in background | OK, SSE è solo per quando l'app è in foreground. Background mode `audio` non aiuta qui. |
| BlinkPy port stale | Se la libreria che scegliamo non è mantenuta, scriviamo client custom seguendo l'engineering reverse pubblico. |

## Migration Plan

1. Schema + migration
2. Crittografia credenziali (test unit)
3. Client custom Blink (start con login + listCameras)
4. Snapshot endpoint
5. Motion clip sync job + cleanup
6. SSE endpoint + doorbell poller
7. Frontend: hook + CameraTile + LiveViewPlayer + ClipsBrowser
8. DoorbellOverlay con SSE listener
9. Settings → Telecamere
10. Test E2E con account Blink reale dell'utente
11. Volume Synology + deploy

**Rollback**: revert. Le credenziali criptate restano nel DB ma il client smette di usarle. Cleanup manuale del volume blink_clips se necessario.

## Open Questions

1. **Quale libreria Blink finale**: in implementazione, dopo aver testato `blinkpy` via subprocess vs custom client. Per ora propongo custom client minimal.
2. **Two-way audio funziona davvero?** Da verificare nel videocitofono Blink fisico dell'utente. Se no, fallback solo-listen.
3. **Push notification fuori app**: APNs richiede Apple Developer Program + setup server-side complesso. Non in scope per ora. Quando l'iPhone è fuori app, l'utente non riceve notifica del videocitofono. Limitazione documentata.
4. **Motion clip thumbnail generation**: usare ffmpeg via child process? Aggiunge dipendenza al container Docker (FROM con ffmpeg). Da decidere.
5. **Backup retention**: aggiungere export manuale dei clip a cartella diversa del Synology prima del cleanup automatico? — *Proposta*: no, l'utente fa backup standard del NAS.
