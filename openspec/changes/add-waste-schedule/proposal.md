## Why

L'utente vuole sapere ogni sera "cosa porto fuori stasera per far ritirare domani". Oggi consulta un PDF cartaceo (`BESOZZO.pdf` letto da me, calendario 2026 della Convenzione Rifiuti Sesto). La feature deve mostrare in home la lista dei sacchi del giorno + supportare lookup vocale ("Ok casa, cosa porto fuori stasera?"). Junker non ha API pubblica documentata, quindi pianifichiamo:
1. **Modello di regole locali** che riproduce la logica del calendario PDF (cadenza fissa con anchor date)
2. **Import ICS opzionale** se mai trovassimo un URL del Comune
3. **Override di festività** per gestire i giorni in cui Natale/Pasqua/1° Maggio sposta la raccolta

Dal PDF ho già estratto le regole base che valgono per tutto il 2026.

## What Changes

- Modello dati `waste_types` (id, nome, colore Phosphor-compatibile, icona, attivo): seed iniziale con i 6 tipi confermati dall'utente per Besozzo (`secco`, `umido`, `plastica`, `vetro_lattine`, `carta`, `verde`) + bonus opzionale `pannolini`
- Modello dati `waste_rules` con: `id`, `wasteTypeId` (FK), `pattern` (JSON con `freq`, `interval`, `byWeekday`, `anchorDate`, `endsOn`), `expositionTime` (default "20:00")
- Modello dati `waste_exceptions` per override puntuali (es. raccolta plastica del 25/12 spostata al 23/12): `id`, `wasteTypeId`, `originalDate`, `replacementDate`, `reason`
- CRUD backend `/api/v1/waste/types`, `/rules`, `/exceptions`, `/calendar?from=&to=` (ritorna istanze concrete per range)
- **Pre-popolamento Besozzo 2026** via seed con le regole estratte dal PDF
- Endpoint `/today` e `/tomorrow` voice-friendly (lista nomi italiani dei sacchi da portare fuori)
- Supporto **import ICS** opzionale: campo `icsUrl` nelle Settings → Spazzatura, refresh schedulato che scarica e converte gli eventi ICS in `waste_exceptions` o regole nuove
- Pagina Spazzatura con: configurazione tipi/regole/eccezioni + visualizzazione del calendario di raccolta (vista mese con badge colorati)
- Tile home **dinamica**: mostra i sacchi da portare fuori "stasera" (se siamo dopo le 16:00) o "domani" (se siamo prima)
- Hook di dominio `useWasteSchedule()`
- Predisposizione voice: "cosa porto fuori stasera", "cosa si butta domani", "quando si butta il vetro"

## Capabilities

### New Capabilities

- `waste-schedule`: schema tipi/regole/eccezioni, expander cadenza, CRUD, import ICS, tile home, pagina configurazione

### Modified Capabilities

(Nessuna — la pagina Spazzatura non era nel router della foundation perché non era nelle 6 tab principali; vive nel sub-route `/settings/waste`. Aggiungiamo solo una sezione in Settings.)

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — `waste_types`, `waste_rules`, `waste_exceptions`
- `apps/api/src/db/seed-besozzo-2026.ts` — seed con i 6 tipi + le regole estratte dal PDF
- `apps/api/src/routes/waste.ts` — router CRUD + `/calendar`
- `apps/api/src/lib/waste-expander.ts` — calcola istanze concrete per range applicando rules - exceptions
- `apps/api/src/lib/ics-import.ts` — fetch + parse ICS, conversion in eccezioni o nuove rules
- `apps/api/src/jobs/refresh-ics.ts` — job schedulato (cron-like) per refresh ICS opzionale
- `packages/shared/src/waste.ts` — tipi `WasteType`, `WasteRule`, `WasteException`, `WasteCollectionDay`
- `apps/mobile/src/components/home-tiles/WasteTile.tsx`
- `apps/mobile/src/components/settings/WasteSettings.tsx` (con sub-componenti `WasteTypeList`, `WasteRuleEditor`, `WasteExceptionList`, `IcsImportSection`)
- `apps/mobile/src/lib/hooks/useWasteSchedule.ts`
- `apps/mobile/src/locales/it/waste.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router waste + bootstrap job ICS se URL configurato
- `apps/mobile/src/pages/SettingsPage.tsx` — aggiunge sezione Spazzatura
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `<WasteTile />`

**Dipendenze aggiunte**:
- `node-ical` (parser ICS standard, MIT)
- `node-cron` o usa `setInterval` semplice per il job schedulato

**Migration**: nuove tabelle. Seed Besozzo idempotente.

**Nessun breaking change**.
