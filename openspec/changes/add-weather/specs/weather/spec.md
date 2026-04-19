## ADDED Requirements

### Requirement: Default location is Besozzo with editable list

Il sistema SHALL mantenere una lista di location meteo nel database, con Besozzo (45.7595°N, 8.6608°E) come default seedato al primo avvio. L'utente SHALL poter aggiungere nuove location, modificarle, e cambiare la default tramite Settings → Meteo. Il backend SHALL accettare query con `?locationId=<id>` e fallback alla default se non specificato.

#### Scenario: Seed creates Besozzo as default
- **WHEN** il backend si avvia con DB vuoto
- **THEN** SHALL inserire una location `{ label: "Besozzo", latitude: 45.7595, longitude: 8.6608, isDefault: true }`
- **AND** subseguenti avvii NOT SHALL duplicarla

#### Scenario: User adds a second location
- **WHEN** l'utente crea via Settings una location "Casa al mare" con coordinate sue
- **THEN** il backend SHALL persistere la nuova location con `isDefault: false`
- **AND** SHALL essere disponibile via `GET /api/v1/weather/locations`

#### Scenario: Switching default
- **WHEN** l'utente marca "Casa al mare" come default
- **THEN** il backend SHALL aggiornare `isDefault = false` su Besozzo e `true` sulla nuova
- **AND** future query senza `locationId` SHALL usare "Casa al mare"

### Requirement: Open-Meteo integration with cache

Il backend SHALL integrarsi con l'API gratuita di Open-Meteo (https://api.open-meteo.com/v1/forecast) per recuperare i dati meteo. SHALL includere come parametri minimi: latitude, longitude, current, daily, timezone=Europe/Rome, lingua dei descrittori dove possibile. SHALL cachare la risposta per 15 minuti per ogni location nella tabella `weather_cache` per evitare di sbattere l'API a ogni reload UI. SHALL gestire gli errori di rete in modo graceful: se l'API non risponde, ritorna i dati cached anche se scaduti, con un campo `stale: true` nella risposta.

#### Scenario: Fresh fetch when cache empty
- **WHEN** il client chiede `GET /api/v1/weather/current?locationId=besozzo` e la cache è vuota
- **THEN** il backend SHALL chiamare Open-Meteo
- **AND** SHALL salvare il risultato in `weather_cache` con timestamp corrente
- **AND** SHALL restituire il risultato normalizzato

#### Scenario: Serve from cache when fresh
- **GIVEN** la cache contiene un payload di 5 minuti fa
- **WHEN** il client chiede di nuovo
- **THEN** il backend SHALL servire la versione cached SENZA chiamare Open-Meteo
- **AND** la risposta SHALL avere `stale: false`

#### Scenario: Stale fallback on API error
- **GIVEN** la cache è di 30 minuti fa e Open-Meteo restituisce errore
- **WHEN** il client chiede meteo
- **THEN** il backend SHALL tentare il refresh, in caso di errore SHALL servire la versione cached con `stale: true`
- **AND** SHALL loggare l'errore Open-Meteo

#### Scenario: Cache TTL is 15 minutes
- **GIVEN** la cache è di 16 minuti fa
- **WHEN** il client chiede meteo
- **THEN** il backend SHALL chiamare Open-Meteo per refresh
- **AND** SHALL aggiornare la cache

### Requirement: Current weather contains comprehensive metrics

L'endpoint `GET /api/v1/weather/current?locationId=` SHALL restituire un oggetto `CurrentWeather` con questi campi:

```ts
type CurrentWeather = {
  locationId: string;
  locationLabel: string;
  fetchedAt: string;
  stale: boolean;
  temperature: number;          // Celsius
  feelsLike: number;            // Celsius (apparent_temperature)
  humidity: number;             // 0-100
  windSpeed: number;            // km/h
  windDirection: number;        // gradi
  pressure: number;             // hPa
  precipitation: number;        // mm ultima ora
  weatherCode: number;          // WMO code
  condition: string;            // descrittore italiano: "soleggiato", "pioggia leggera", ecc.
  iconKey: string;              // chiave per il client per scegliere l'icona (es. "sunny", "rainy")
  isDay: boolean;
  sunrise: string;              // ISO timestamp
  sunset: string;               // ISO timestamp
  todayMax: number;
  todayMin: number;
};
```

#### Scenario: Current weather response includes all fields
- **WHEN** il client chiede `GET /api/v1/weather/current`
- **THEN** la risposta SHALL contenere tutti i campi documentati con valori sensati per Besozzo
- **AND** `condition` SHALL essere in italiano (es. "soleggiato", "parzialmente nuvoloso", "pioggia leggera")
- **AND** `iconKey` SHALL essere uno della enum stabile usata dal client per mappare icone

### Requirement: Daily forecast covers next 7 days

L'endpoint `GET /api/v1/weather/forecast?locationId=&days=7` SHALL restituire un array di 7 oggetti `DailyForecast`:

```ts
type DailyForecast = {
  date: string;                 // ISO date (no time)
  dayLabel: string;             // italiano abbreviato: "lun", "mar", ...
  temperatureMax: number;
  temperatureMin: number;
  precipitationSum: number;     // mm totali
  precipitationProbability: number;  // 0-100
  weatherCode: number;
  condition: string;
  iconKey: string;
  windSpeedMax: number;
  sunrise: string;
  sunset: string;
};
```

#### Scenario: Forecast returns 7 days
- **WHEN** il client chiede `GET /api/v1/weather/forecast?days=7`
- **THEN** la risposta SHALL essere un array di 7 elementi
- **AND** il primo elemento SHALL essere oggi
- **AND** i `dayLabel` SHALL essere in italiano

#### Scenario: Days clamped to 14 max
- **WHEN** il client chiede `?days=20`
- **THEN** il backend SHALL limitare a 14 giorni e restituire 14 elementi
- **AND** SHALL NON lanciare errore (clamping silenzioso)

### Requirement: Weather alerts surface significant warnings

Il sistema SHALL recuperare le allerte meteo da Open-Meteo (campo `weather_alerts` se disponibile, altrimenti derivare da soglie: vento >50km/h, precipitazione >20mm, temp <0 o >35) e restituirle come array `alerts: WeatherAlert[]` nella response del current. Ogni alert SHALL avere `severity: 'info' | 'warning' | 'severe'`, `title` italiano, `description`, `validUntil`.

#### Scenario: High wind triggers warning
- **GIVEN** Open-Meteo riporta windSpeed = 65 km/h
- **WHEN** il client chiede current
- **THEN** la risposta SHALL contenere un alert `{ severity: 'warning', title: 'Vento forte', description: 'Raffiche fino a 65 km/h previste', validUntil: <timestamp> }`

#### Scenario: No alerts when weather is calm
- **WHEN** il meteo è calmo (vento basso, no precipitazioni, temp normale)
- **THEN** `alerts` SHALL essere `[]`

### Requirement: Voice endpoint returns natural Italian description

Il backend SHALL esporre `GET /api/v1/weather/voice?when=now|today|tomorrow|weekend` che restituisce:

```json
{
  "voiceText": "A Besozzo ci sono 18 gradi, parzialmente nuvoloso. Massima 22, minima 14. Domani pioggia leggera al pomeriggio."
}
```

Il voiceText SHALL essere generato server-side concatenando temperatura, condizione, max/min, e (per `tomorrow`/`weekend`) anche un cenno alla previsione.

#### Scenario: Voice now
- **WHEN** il client chiede `?when=now`
- **THEN** il backend SHALL generare una stringa con "A `<location>` ci sono `<temp>` gradi, `<condition>`. Massima `<max>`, minima `<min>`."

#### Scenario: Voice tomorrow
- **WHEN** il client chiede `?when=tomorrow`
- **THEN** il backend SHALL generare una stringa con "Domani a `<location>` `<condition>`. Temperature tra `<min>` e `<max>` gradi. `<eventuali alert>`"

### Requirement: Home tile is large with metrics row and forecast strip

L'home page SHALL contenere una `WeatherTile` di dimensione **grande** (~3-4 colonne nel mosaico) che mostra:
- **Top section**: temperatura corrente in Fraunces giant (font-size clamp 6rem-10rem), accanto icona meteo grande, sotto la condizione italiana
- **Metric row**: 4 metriche piccole con icone Phosphor (umidità, vento km/h, sunrise time, sunset time)
- **Banner allerta**: se `alerts.length > 0`, banner con il primo alert severità più alta, sfondo tinted warning
- **Forecast strip**: riga orizzontale con i prossimi 7 giorni, ognuno con dayLabel + icona piccola + max/min
- Tap sulla tile SHALL navigare alla pagina `WeatherPage`

L'aggiornamento SHALL essere live: TanStack Query con `staleTime: 5 minuti` e `refetchInterval: 15 minuti`.

#### Scenario: Tile shows current temperature prominently
- **WHEN** il meteo corrente è 18°C e parzialmente nuvoloso
- **THEN** la tile SHALL mostrare "18°" in display tipografico Fraunces grande
- **AND** SHALL mostrare l'icona meteo corrispondente
- **AND** SHALL mostrare la stringa "Parzialmente nuvoloso"

#### Scenario: Forecast strip shows 7 days
- **WHEN** la tile viene renderizzata
- **THEN** la riga forecast SHALL mostrare 7 mini-card con dayLabel + icona + max/min
- **AND** ognuna SHALL essere visualmente compatta ma leggibile da 3 metri

#### Scenario: Alert banner is prominent
- **GIVEN** è attivo un alert severità "warning"
- **WHEN** la tile viene renderizzata
- **THEN** SHALL mostrare un banner sopra le metriche con sfondo `oklch(70% 0.15 70)` (ambra warning) e testo in italiano
- **AND** SHALL essere visivamente distinguibile

### Requirement: Detail page provides full forecast and history

La pagina `WeatherPage` SHALL fornire una vista più dettagliata raggiungibile dalla tile:
- Header con location label corrente + selettore (se ci sono più location)
- Sezione "Adesso" con temperature feels-like, pressione, direzione vento (con icona freccia ruotata)
- Sezione "Prossimi 7 giorni" come lista di card con tutti i dettagli daily
- Allerte come banner in alto se presenti
- Footer con "Ultimo aggiornamento HH:MM" e bottone "Aggiorna"

#### Scenario: Detail page shows pressure and feels-like
- **WHEN** l'utente apre la pagina meteo
- **THEN** SHALL vedere temperature feels-like, pressione hPa, direzione vento con icona freccia che ruota in base ai gradi

#### Scenario: Refresh button forces fetch
- **WHEN** l'utente preme "Aggiorna"
- **THEN** la query SHALL essere invalidata e una nuova chiamata SHALL essere fatta al backend
- **AND** SHALL bypassare la cache (header `Cache-Control: no-cache` o param `force=true`)
