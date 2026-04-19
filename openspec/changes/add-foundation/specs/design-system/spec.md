## ADDED Requirements

### Requirement: Design tokens follow the Impeccable Design Context

Il sistema SHALL definire un set di design token centralizzato che riflette esattamente le scelte documentate in `.impeccable.md`: palette in OKLCH (terracotta `oklch(68% 0.15 50)`, ambra `oklch(78% 0.13 75)`, salvia `oklch(72% 0.08 150)`), neutri tinted warm, scale tipografica fluida con `clamp()`, spacing scale `[4, 8, 12, 16, 24, 32, 48, 64, 96]`, border radius scale `[4, 8, 12, 20, 32]`, ombre tinted warm, easing tokens (`easeOutQuart`, `easeOutExpo`), durations tokens (`micro: 200ms`, `default: 320ms`, `orchestration: 600ms`). I token SHALL essere espressi come variabili CSS native (`--color-accent-primary`, `--space-4`, ecc.) e consumabili sia da Tailwind 4 (via `@theme`) che da CSS custom.

#### Scenario: Tokens are exported as CSS variables
- **WHEN** un componente legge `var(--color-accent-primary)` in CSS o tramite Tailwind class `text-accent-primary`
- **THEN** il valore risolto SHALL essere `oklch(68% 0.15 50)` in light mode
- **AND** SHALL essere coerente in dark mode (lo stesso hue, eventualmente con luminosità adattata)

#### Scenario: Spacing scale is applied consistently
- **WHEN** uno sviluppatore usa `gap-4` (Tailwind) o `padding: var(--space-4)` (CSS)
- **THEN** entrambi SHALL risolvere allo stesso valore `16px`
- **AND** il sistema SHALL NOT usare valori di spacing arbitrari fuori dalla scale documentata

### Requirement: Theme switches between dark and light following the system

L'app SHALL supportare tema chiaro e scuro, con default automatico che segue `prefers-color-scheme` del sistema operativo iOS. L'utente SHALL poter forzare manualmente uno dei tre stati (`auto`, `light`, `dark`) dalle Settings; la scelta SHALL essere persistita in `localStorage` (o store Tauri equivalente) e applicata immediatamente senza ricaricare la pagina.

#### Scenario: System dark mode is respected by default
- **WHEN** l'app viene avviata su un iPad con dark mode di sistema attivo
- **AND** l'utente non ha mai cambiato la preferenza tema
- **THEN** l'interfaccia SHALL essere renderizzata con la palette dark
- **AND** i token CSS SHALL puntare ai valori dark

#### Scenario: Manual override persists across reloads
- **WHEN** l'utente seleziona "Tema chiaro" dalle Settings su un sistema in dark
- **THEN** l'interfaccia SHALL passare immediatamente a light mode
- **AND** alla riapertura dell'app SHALL essere ancora in light mode finché l'utente non sceglie un'altra opzione

### Requirement: Typography uses Fraunces and Geist Sans, never Inter

Il sistema SHALL caricare due famiglie variabili: **Fraunces** per display (`font-display`) e **Geist Sans** per body (`font-sans`). Le fonti SHALL essere self-hosted (no Google Fonts) per privacy e performance. SHALL NOT essere usate famiglie blacklisted (Inter, Roboto, Helvetica, Arial, system-ui). La scala tipografica SHALL essere fluida con `clamp()` e usare type scale 1.250 (major third) come base.

#### Scenario: Display font is Fraunces with optical sizing
- **WHEN** un titolo H1 viene renderizzato
- **THEN** il `font-family` computato SHALL essere `Fraunces`
- **AND** SHALL avere `font-optical-sizing: auto`

#### Scenario: Body font is Geist Sans
- **WHEN** un paragrafo o una label viene renderizzato senza override esplicito
- **THEN** il `font-family` computato SHALL essere `Geist Sans`
- **AND** SHALL NOT contenere fallback `Inter`, `Roboto` o `system-ui` come prima scelta

### Requirement: Reusable UI primitives cover the foundation needs

Il sistema SHALL fornire un set di componenti React primitivi riutilizzabili che ogni feature successiva consumerà invece di reinventare HTML grezzo: `Button` (varianti `primary | ghost | icon`, sizes `sm | md | lg`), `Tile` (contenitore base della home, varianti di dimensione), `Modal`, `Input`, `Select`, `Avatar` (con fallback iniziale), `IconButton`, `Toast`. Ogni primitive SHALL rispettare i design token, supportare touch target minimo 56pt sui dispositivi touch, esporre prop `aria-*` quando rilevanti, e SHALL NOT contenere valori hard-coded di colore/spacing/font.

#### Scenario: Button uses tokens, not hard-coded values
- **WHEN** uno sviluppatore legge il file sorgente di `Button.tsx`
- **THEN** SHALL NOT trovare valori hex hard-coded, pixel hard-coded, o font family hard-coded
- **AND** SHALL trovare riferimenti a classi Tailwind o CSS variable basate sui token

#### Scenario: Touch targets meet 56pt minimum
- **WHEN** un `Button` con size `md` viene renderizzato
- **THEN** la sua area cliccabile SHALL essere >= 56×56 logical pixel
- **AND** un test automatico (es. computed style assertion) SHALL verificarlo

### Requirement: Motion respects reduced-motion preferences

Il sistema SHALL fornire token di easing e durations centralizzati in `apps/mobile/src/lib/motion/`. Tutti i componenti che animano SHALL leggere questi token e SHALL usare un hook condiviso `useReducedMotion()` per ridurre le animazioni a fade puri da 120ms quando l'utente ha attivato `prefers-reduced-motion: reduce`. SHALL essere animati esclusivamente `transform` e `opacity` (mai width/height/padding/margin).

#### Scenario: Reduced motion replaces stagger with instant fade
- **WHEN** l'utente ha `prefers-reduced-motion: reduce` attivo
- **AND** la home page viene caricata
- **THEN** le tile della home SHALL apparire con un fade puro da 120ms tutte insieme
- **AND** SHALL NOT applicare nessun stagger, slide o bouncing

#### Scenario: Layout properties are not animated
- **WHEN** uno sviluppatore aggiunge un'animazione a un componente
- **AND** tenta di animare `width`, `height`, `padding` o `margin`
- **THEN** un lint rule (o code review) SHALL bloccare il PR
- **AND** SHALL suggerire l'uso di `transform: scale()` o `grid-template-rows` come alternative
