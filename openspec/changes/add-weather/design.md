## Context

Open-Meteo è il servizio meteo gratuito de-facto per il 2026: https://open-meteo.com. Niente API key, niente limit per uso non commerciale, dati di alta qualità basati su modelli numerici (ECMWF, ICON, GFS), supporto eccellente per l'Europa. Restituisce JSON pulito.

Per Besozzo (45.7595°N, 8.6608°E):
```
GET https://api.open-meteo.com/v1/forecast?latitude=45.7595&longitude=8.6608&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day,precipitation,surface_pressure&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&timezone=Europe/Rome&forecast_days=7
```

I `weather_code` sono codici WMO (https://open-meteo.com/en/docs#weather_variable_documentation), mapp a icone via lookup table.

## Goals / Non-Goals

### Goals

1. Integrazione Open-Meteo robusta con cache 15 minuti
2. Fallback graceful su errori
3. Tile home grande con metric row + forecast strip
4. Pagina dettaglio con tutti i dettagli
5. Voice text italiano pre-renderizzato
6. Header dell'AppShell aggiornato con temperatura compatta
7. Multi-location supportate (default Besozzo, l'utente può aggiungere altre)

### Non-Goals

- **Niente hourly forecast**. L'utente ha scelto solo daily.
- **Niente radar/mappe**. Open-Meteo non lo offre nativamente, e non è in scope.
- **Niente cronologia**. Solo current + forecast 7gg.
- **Niente notifiche push** per allerte. Vivono in voice control e overlay in app.
- **Niente API key alternative** (OpenWeather, WeatherAPI). Open-Meteo è gratis e basta.

## Decisions

### D1. Schema location + cache

```sql
CREATE TABLE weather_locations (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE UNIQUE INDEX idx_weather_default ON weather_locations(is_default) WHERE is_default = 1;

CREATE TABLE weather_cache (
  location_id TEXT NOT NULL REFERENCES weather_locations(id) ON DELETE CASCADE,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL,        -- JSON normalizzato
  PRIMARY KEY (location_id)
);
```

Una sola riga di cache per location (overwrite su refresh). L'unique index su `is_default = 1` garantisce che solo una location sia default.

### D2. Wrapper Open-Meteo con normalizzazione

**Decisione**: `apps/api/src/lib/open-meteo.ts` espone `fetchWeather(lat, lng)` che chiama Open-Meteo, parse la risposta, e ritorna l'oggetto già normalizzato nei tipi `CurrentWeather` + `DailyForecast[]` definiti in `@home-panel/shared`.

La normalizzazione include:
- Mapping `weather_code` → `iconKey` ("clear", "cloudy", "rain", "snow", "thunderstorm", "fog")
- Mapping `weather_code` → italiano "soleggiato", "parzialmente nuvoloso", ecc.
- Calcolo allerte da soglie locali se Open-Meteo non le offre
- Conversione unità se necessario

### D3. Cache in DB con TTL 15 min, fallback stale

**Decisione**: la cache vive in `weather_cache` come singola riga per location. Il flow è:
1. Read cache
2. Se `fetchedAt > now - 15min`, return cache fresh (`stale: false`)
3. Altrimenti tentativo refresh: in successo, write cache + return; in errore, return cache stale (`stale: true`) con log

**Alternative considerate**:
- *In-memory cache (Map)*: persa al restart del backend, peggior UX
- *Redis*: dipendenza esterna, overkill per single-user
- *No cache*: ogni reload sbatte Open-Meteo, va contro lo spirito del free tier

### D4. Icone meteo: SVG custom curato vs libreria

**Decisione**: usare un piccolo set di SVG custom inline (~6 stati: clear, cloudy, rain, snow, thunderstorm, fog), disegnati in modo coerente con `.impeccable.md` (linee morbide, colori warm/accent). Niente librerie esterne (`weather-icons`, `meteocons`) perché ognuna ha uno stile proprio che potrebbe non matchare.

**Implementazione**: `apps/mobile/src/components/weather/WeatherIcon.tsx` con switch su `iconKey` + leggero parametro `isDay` per rendering luna invece di sole quando appropriato.

**Alternative considerate**:
- *Phosphor Icons*: ha icone meteo decenti, ma poco diversificate per gli stati
- *meteocons.com*: bellissime ma stile loro
- *react-icons*: dipendenza grossa per 6 icone

### D5. Forecast strip a 7 giorni come riga orizzontale

**Decisione**: la strip nel `WeatherTile` mostra 7 mini-card affiancate con `dayLabel` (lun/mar/mer/...), icona piccola, e `max°/min°`. Su iPad sta su una riga; su iPhone scroll orizzontale.

### D6. Voice text con coniugazione semplice

**Decisione**: il backend genera `voiceText` con template fissi per `now`, `today`, `tomorrow`, `weekend`. Non c'è NLG complesso, solo string interpolation con valori arrotondati.

```ts
function voiceText({ when, current, forecast, location }) {
  if (when === 'now') {
    return `A ${location.label} ci sono ${Math.round(current.temperature)} gradi, ${current.condition}. Massima ${Math.round(current.todayMax)}, minima ${Math.round(current.todayMin)}.`;
  }
  // ... etc
}
```

### D7. AppHeader weather come componente isolato

**Decisione**: `HeaderWeather.tsx` è un componente piccolo che usa `useCurrentWeather()` con TanStack Query. È isolato perché vive nell'header dell'AppShell che è sempre montato — re-render eccessivi degli altri elementi sarebbero costosi.

```tsx
function HeaderWeather() {
  const { data, isError } = useCurrentWeather();
  if (isError || !data) return <span>—°</span>;
  return (
    <button onClick={() => navigate('/weather')}>
      <WeatherIcon iconKey={data.iconKey} size="sm" />
      <span>{Math.round(data.temperature)}°</span>
    </button>
  );
}
```

## Risks / Trade-offs

| Rischio | Mitigazione |
|---|---|
| Open-Meteo cambia API o impone API key | Open-Meteo è stable e ha versioning. In caso peggiore, il wrapper è isolato in un solo file (`open-meteo.ts`), facile da riscrivere. |
| Connettività intermittente in casa | Cache 15 min + fallback stale + indicatore "—°" elegante. Niente popup di errore. |
| Allerte da soglie locali sono naive | Funzionano per gli alert "evidenti" (vento forte, pioggia intensa). Per allerte ufficiali serve un'API dedicata (Protezione Civile), che è fuori scope. |
| Icone meteo SVG custom richiedono design effort | 6 icone in totale, ~30 minuti di implementazione. Vale la pena per la coerenza visiva. |
| Multi-location aggiunge complessità che non serve | Default Besozzo, l'utente può ignorare la feature. CRUD completo per future-proofing. |
| Pagina dettaglio è "yet another weather app" | Differenziazione tramite tipografia Fraunces e palette warm. Lascia respirare i numeri grandi. |

## Migration Plan

1. Generare migration Drizzle per le 2 tabelle, applicare
2. Implementare `seedBesozzoLocation` idempotente
3. Implementare `open-meteo.ts` wrapper + test con curl
4. Implementare router con cache logic
5. Implementare voice endpoint
6. Implementare hook + componenti UI
7. Sostituire il placeholder nell'AppHeader
8. Aggiungere WeatherTile alla home
9. Implementare WeatherPage
10. Test con simulazione di errori di rete

**Rollback**: revert. Tabelle rimangono inutilizzate.

## Open Questions

1. **Set icone**: 6 SVG bastano? Lo verifichiamo in implementazione, eventualmente espandiamo.
2. **Allerte ufficiali Protezione Civile**: aggiungere un secondo provider per le warning ufficiali italiane? — *Proposta*: no in questa change, eventuale estensione futura.
3. **Multi-location nella tile home**: mostrare solo la default o uno switcher? — *Proposta*: solo default, lo switcher vive nella WeatherPage detail.
4. **Refresh del cache automatico**: oltre al fetch on-demand, vale la pena schedulare un refresh proattivo ogni 15 minuti? — *Proposta*: no, on-demand basta. Non vogliamo background work inutile.
