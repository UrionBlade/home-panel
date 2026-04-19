## 1. Schema e seed

- [x] 1.1 Aggiungere a `apps/api/src/db/schema.ts` `weather_locations` (con unique index su is_default=1) e `weather_cache`
- [x] 1.2 Generare e applicare la migration
- [x] 1.3 Creare `apps/api/src/db/seed-besozzo-location.ts` con Besozzo (45.7595, 8.6608) come default
- [x] 1.4 Chiamare il seed all'avvio backend (idempotente)

## 2. Tipi condivisi

- [x] 2.1 Creare `packages/shared/src/weather.ts` con `WeatherLocation`, `CurrentWeather`, `DailyForecast`, `WeatherAlert`, `IconKey` (stringa enum), `VoiceWeatherResponse`
- [x] 2.2 Esportare da `packages/shared/src/index.ts`

## 3. Backend: Open-Meteo wrapper

- [x] 3.1 Creare `apps/api/src/lib/open-meteo.ts` con `fetchOpenMeteo(lat, lng)` che chiama l'API con tutti i campi documentati
- [x] 3.2 Implementare mapping `weatherCodeToIconKey(code, isDay)` con i 6 stati
- [x] 3.3 Implementare mapping `weatherCodeToConditionItalian(code)` con descrittori italiani
- [x] 3.4 Implementare `deriveAlerts(current, daily)` da soglie locali (vento >50, precip >20, temp <0 o >35)
- [x] 3.5 Implementare `normalizeOpenMeteoResponse(raw, location)` che ritorna `{ current: CurrentWeather, daily: DailyForecast[] }`
- [ ] 3.6 Test unit del normalizer con sample fixture JSON

## 4. Backend: cache layer

- [x] 4.1 Creare `apps/api/src/lib/weather-cache.ts` con `getCached(locationId)`, `setCached(locationId, payload)`, `isFresh(fetchedAt, ttl=15min)`
- [x] 4.2 Implementare `getOrFetchWeather(locationId)` che applica la logica fresh / stale fallback
- [ ] 4.3 Test unit con date mockate

## 5. Backend: router

- [x] 5.1 Creare `apps/api/src/routes/weather.ts` con sub-router
- [x] 5.2 CRUD `/locations` con vincolo "una sola default"
- [x] 5.3 `GET /current?locationId=` con fallback a default
- [x] 5.4 `GET /forecast?locationId=&days=7` con clamp a 14
- [x] 5.5 `GET /voice?when=now|today|tomorrow|weekend` con generazione voiceText italiano
- [x] 5.6 Registrare il router in `apps/api/src/index.ts`

## 6. Frontend: hook di dominio

- [x] 6.1 Creare `apps/mobile/src/lib/hooks/useWeather.ts` con `useCurrentWeather(locationId?)`, `useForecast(locationId?, days?)`, `useWeatherLocations()`, mutation `useCreateLocation`, `useUpdateLocation`, `useDeleteLocation`, `useSetDefaultLocation`
- [x] 6.2 Configurare `staleTime: 5*60*1000` e `refetchInterval: 15*60*1000`
- [x] 6.3 QueryKey `['weather', 'current'|'forecast', locationId]`

## 7. Frontend: componenti weather

- [x] 7.1 Creare `apps/mobile/src/components/weather/WeatherIcon.tsx` con switch su iconKey + 6 SVG inline (clear, cloudy, rain, snow, thunderstorm, fog), versioni day/night per clear
- [x] 7.2 Creare `MetricRow.tsx` con icona Phosphor + label + valore (umidità %, vento km/h, sunrise time, sunset time)
- [x] 7.3 Creare `ForecastStrip.tsx` con 7 mini-card affiancate (dayLabel + WeatherIcon size sm + max°/min°)
- [x] 7.4 Creare `AlertBanner.tsx` con sfondo tinted warning, titolo + descrizione

## 8. Frontend: tile home grande

- [x] 8.1 Creare `apps/mobile/src/components/home-tiles/WeatherTile.tsx`
- [x] 8.2 Top section: temperatura giant in Fraunces + WeatherIcon size lg + condizione italiana
- [x] 8.3 MetricRow con umidità, vento, sunrise, sunset
- [x] 8.4 AlertBanner se ci sono alert
- [x] 8.5 ForecastStrip con i prossimi 7 giorni
- [x] 8.6 Tap → navigate `/weather`
- [x] 8.7 Aggiornare `HomePage.tsx` per includere `<WeatherTile />` (occupando ~3-4 colonne)

## 9. Frontend: header weather

- [x] 9.1 Creare `apps/mobile/src/components/layout/HeaderWeather.tsx` con `useCurrentWeather()` + render compatto (icona + temp)
- [x] 9.2 Sostituire il placeholder meteo in `AppHeader.tsx` con `<HeaderWeather />`
- [x] 9.3 Tap → navigate `/weather`
- [x] 9.4 Fallback graceful "—°" su errore senza popup

## 10. Frontend: pagina dettaglio

- [x] 10.1 Creare `apps/mobile/src/pages/WeatherPage.tsx` con header location + selettore (se >1)
- [x] 10.2 Sezione "Adesso" dettagliata con feels-like, pressione, direzione vento (icona freccia ruotata via CSS transform)
- [x] 10.3 Sezione "Prossimi 7 giorni" come lista di card
- [x] 10.4 AlertBanner in alto se presenti
- [x] 10.5 Footer con timestamp ultimo refresh + bottone "Aggiorna" (invalida query con `?force=true`)
- [x] 10.6 Aggiungere route `/weather` in `router.tsx`

## 11. Settings: gestione location

- [x] 11.1 Aggiungere a `SettingsPage.tsx` sezione "Meteo → Località"
- [x] 11.2 Lista location + bottoni per edit/delete/set-default
- [x] 11.3 Form aggiungi con label + lat/lng (input numeric con ricerca semplice da nome via Open-Meteo Geocoding API opzionale)

## 12. i18n

- [x] 12.1 Creare `apps/mobile/src/locales/it/weather.json` con stringhe (titoli, descrittori condizioni, label metric, alert types)

## 13. Validazione

- [x] 13.1 `pnpm typecheck && pnpm lint` verde
- [ ] 13.2 Test live: `curl /api/v1/weather/current` restituisce dati Besozzo reali da Open-Meteo
- [ ] 13.3 Test cache: chiamare 2 volte di fila, verificare che la seconda venga servita da cache
- [ ] 13.4 Test fallback: spegnere internet, verificare che il backend serva la stale cache senza crash
- [ ] 13.5 Test tile: caricare la home, verificare temperatura grande + 4 metric + forecast strip
- [ ] 13.6 Test alert simulato (forzare un weatherCode di pioggia forte)
- [ ] 13.7 Test voice: `curl /voice?when=tomorrow` restituisce stringa italiana sensata
- [ ] 13.8 `openspec validate add-weather` verde
