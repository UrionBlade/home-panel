## ADDED Requirements

### Requirement: All API requests require a Bearer token

Il backend SHALL rifiutare con `401 Unauthorized` ogni richiesta verso endpoint sotto `/api/*` che non presenti un header `Authorization: Bearer <token>` valido. Il token atteso è configurato tramite la variabile d'ambiente `API_TOKEN` letta all'avvio del processo. L'endpoint `/health` SHALL essere l'unica eccezione e rimanere accessibile senza token (per healthcheck Docker e Tailscale).

#### Scenario: Request without Authorization header is rejected
- **WHEN** un client invia `GET /api/v1/family` senza header `Authorization`
- **THEN** il backend SHALL rispondere `401 Unauthorized` con body JSON `{ "error": "missing_token" }`
- **AND** non SHALL eseguire alcuna logica di route

#### Scenario: Request with wrong token is rejected
- **WHEN** un client invia una richiesta con `Authorization: Bearer wrong-token`
- **AND** `wrong-token` non corrisponde a `API_TOKEN`
- **THEN** il backend SHALL rispondere `401 Unauthorized` con body JSON `{ "error": "invalid_token" }`

#### Scenario: Request with correct token proceeds
- **WHEN** un client invia una richiesta con `Authorization: Bearer <correct-token>`
- **AND** `<correct-token>` corrisponde alla env `API_TOKEN`
- **THEN** il backend SHALL eseguire la route normalmente e restituire la risposta attesa

#### Scenario: Health endpoint is accessible without token
- **WHEN** un client invia `GET /health` senza alcun header `Authorization`
- **THEN** il backend SHALL rispondere `200 OK` con il payload di health

### Requirement: API token is never logged or exposed

Il sistema SHALL trattare `API_TOKEN` come segreto. Il valore non SHALL apparire nei log applicativi, nei messaggi di errore, nelle response, né in alcuna telemetria. In sviluppo locale il file `.env` contenente `API_TOKEN` SHALL essere ignorato da git tramite `.gitignore`.

#### Scenario: Token absent from logs on auth failure
- **WHEN** una richiesta arriva con un Bearer token errato e produce un log di rejection
- **THEN** il log SHALL contenere il path, il metodo, e il motivo (`missing_token` o `invalid_token`)
- **AND** SHALL NOT contenere il valore del token presentato dal client né di `API_TOKEN`

### Requirement: Frontend automatically attaches the token to requests

Il frontend mobile SHALL fornire un wrapper centralizzato `apiClient` che legge `VITE_API_TOKEN` dalle env Vite e lo inietta automaticamente come header `Authorization: Bearer <token>` in tutte le chiamate fetch verso il backend, in modo che nessun chiamante singolo debba ricordarsi di farlo.

#### Scenario: apiClient adds Bearer header transparently
- **WHEN** un componente React invoca `apiClient.get('/api/v1/family')`
- **THEN** la richiesta HTTP risultante SHALL contenere l'header `Authorization: Bearer <VITE_API_TOKEN>`
- **AND** nessun altro codice nel componente SHALL dover gestire l'header manualmente

#### Scenario: Missing VITE_API_TOKEN fails fast in dev
- **WHEN** l'app mobile viene avviata in modalità dev senza `VITE_API_TOKEN` definita
- **THEN** `apiClient` SHALL lanciare un errore esplicito al primo utilizzo con messaggio "VITE_API_TOKEN non configurato — crea apps/mobile/.env"
- **AND** l'errore SHALL essere visibile in console e bloccare le richieste prima che partano

### Requirement: CORS is restricted but configurable

Il backend SHALL configurare CORS per accettare solo richieste da origini esplicitamente whitelistate (default: localhost di sviluppo + hostname della tailnet dell'utente). La whitelist SHALL essere configurabile tramite env `CORS_ALLOWED_ORIGINS` (lista separata da virgole). Le richieste da origini non in whitelist SHALL ricevere `403 Forbidden` su preflight OPTIONS.

#### Scenario: Origin in whitelist is allowed
- **WHEN** un client da `http://localhost:1420` invia un preflight OPTIONS
- **AND** `localhost:1420` è in `CORS_ALLOWED_ORIGINS`
- **THEN** il backend SHALL rispondere con gli header CORS appropriati che permettono la richiesta successiva

#### Scenario: Origin not in whitelist is blocked
- **WHEN** un client da `https://evil.example.com` invia un preflight OPTIONS
- **AND** `evil.example.com` non è in `CORS_ALLOWED_ORIGINS`
- **THEN** il backend SHALL rispondere senza header `Access-Control-Allow-Origin`
- **AND** il browser del client SHALL bloccare la richiesta successiva
