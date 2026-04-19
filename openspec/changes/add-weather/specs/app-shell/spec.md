## MODIFIED Requirements

### Requirement: Header shows live date, time, weather and voice indicator

L'header dell'AppShell SHALL mostrare in modo persistente:
1. Data corrente in formato lungo italiano (es. "Martedì 7 aprile")
2. Ora corrente in formato 24h con secondi (es. "14:23")
3. **Meteo compatto**: temperatura corrente + icona meteo (recuperata via `useWeather` con TanStack Query, refetch ogni 15 min). Tap apre `WeatherPage`. Se la chiamata fallisce, mostra "—°" come fallback elegante senza errore visibile.
4. Indicatore voice always-on (placeholder per ora; sarà popolato dalla change `add-voice-control`)
5. Indicatore di connessione al backend (verde se ok, ambra se degraded, rosso se offline)

L'orologio SHALL aggiornarsi al secondo senza ricaricare componenti pesanti. Il meteo nell'header SHALL aggiornarsi in modo discreto (no spinner visibile, animazione di fade dei nuovi valori).

#### Scenario: Clock updates every second
- **WHEN** l'app è in foreground sull'iPad
- **THEN** l'ora visualizzata nell'header SHALL aggiornarsi ogni secondo
- **AND** l'aggiornamento SHALL NOT causare re-render dell'intera AppShell, solo del componente Clock

#### Scenario: Header weather shows temperature and icon
- **WHEN** l'app è connessa al backend e Open-Meteo restituisce temperature 18°C
- **THEN** l'header SHALL mostrare "18°" e l'icona meteo corrispondente
- **AND** un tap SHALL navigare a `/weather`

#### Scenario: Header weather degrades gracefully on error
- **WHEN** la query meteo fallisce e non c'è cache
- **THEN** l'header SHALL mostrare "—°" senza icona, senza messaggio di errore
- **AND** SHALL ritentare al prossimo refetch interval

#### Scenario: Backend offline indicator
- **WHEN** il backend non risponde a `GET /health` per più di 10 secondi
- **THEN** l'indicatore di connessione nell'header SHALL diventare rosso
- **AND** SHALL mostrare un tooltip "Backend non raggiungibile" al tap/hover
