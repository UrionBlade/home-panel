## Why

Il meteo è una delle prime informazioni che l'utente vuole vedere alla mattina ("piove oggi? servono il giubbino?") e una delle query vocali più frequenti ("Ok casa, che tempo fa?"). Attualmente l'header dell'AppShell ha solo uno slot placeholder per il meteo (definito in `add-foundation`). Questa change lo popola con dati reali, aggiunge una tile home grande con i dettagli, e una pagina dettaglio con forecast 7 giorni.

Open-Meteo è perfetta per il caso d'uso: gratis senza API key, no limit di chiamate, dati di alta qualità per l'Europa, supporta italiano nei descrittori, niente leak di privacy verso Google/Apple.

## What Changes

- Modello dati `weather_locations` (id, label, latitude, longitude, isDefault, createdAt) — di default seedato con Besozzo (45.7595°N, 8.6608°E)
- Modello dati `weather_cache` (locationId, fetchedAt, payload JSON) per evitare di sbattere Open-Meteo a ogni reload
- Servizio backend `weatherService.ts` che chiama Open-Meteo API, normalizza la risposta in tipi condivisi, gestisce cache (TTL 15 minuti)
- Endpoint `/api/v1/weather/current?locationId=` (corrente), `/forecast?locationId=&days=7` (7 giorni daily), `/locations` (CRUD locations), `/today` (voice-friendly)
- Componente `WeatherTile` in home: tile grande (~3-4 colonne del mosaico) con: temperatura corrente in display tipografico Fraunces giant, condizione + icona, max/min oggi, umidità + vento + sunrise/sunset come row di metric piccole, banner allerte se presenti, mini-strip dei prossimi 7 giorni
- Pagina dettaglio meteo `WeatherPage` (raggiungibile dal tap sulla tile) con vista completa
- Hook di dominio `useWeather()`
- Predisposizione voice: "che tempo fa", "che tempo farà domani", "che tempo farà nel weekend"

## Capabilities

### New Capabilities

- `weather`: schema locations + cache, integrazione Open-Meteo, tile home, pagina dettaglio, hook di dominio

### Modified Capabilities

- `app-shell`: lo slot meteo dell'header passa da placeholder a dato reale (delta su `Requirement: Header shows live date, time, weather placeholder, and voice indicator`)

## Impact

**Codice nuovo**:
- `apps/api/src/db/schema.ts` — `weather_locations`, `weather_cache`
- `apps/api/src/db/seed-besozzo-location.ts` — seed con Besozzo come location default
- `apps/api/src/routes/weather.ts`
- `apps/api/src/lib/open-meteo.ts` — wrapper API + normalizzazione
- `packages/shared/src/weather.ts` — `WeatherLocation`, `CurrentWeather`, `DailyForecast`, `WeatherAlert`, `VoiceWeatherResponse`
- `apps/mobile/src/components/home-tiles/WeatherTile.tsx`
- `apps/mobile/src/pages/WeatherPage.tsx`
- `apps/mobile/src/components/weather/` — `WeatherIcon`, `ForecastStrip`, `MetricRow`, `AlertBanner`
- `apps/mobile/src/lib/hooks/useWeather.ts`
- `apps/mobile/src/components/layout/HeaderWeather.tsx` (sostituisce il placeholder)
- `apps/mobile/src/locales/it/weather.json`

**Codice modificato**:
- `apps/api/src/index.ts` — registra router weather
- `apps/mobile/src/components/layout/AppHeader.tsx` — usa `<HeaderWeather />`
- `apps/mobile/src/pages/HomePage.tsx` — aggiunge `<WeatherTile />`

**Dipendenze aggiunte**: nessuna (Open-Meteo si chiama via fetch nativo). Eventualmente `lucide-weather-icons` o un set di SVG custom per le icone meteo (decisione in design.md).

**Migration**: nuove tabelle. Seed Besozzo idempotente.

**Nessun breaking change**.
