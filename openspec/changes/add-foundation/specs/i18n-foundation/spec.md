## ADDED Requirements

### Requirement: Italian is the default and only initial language

Il sistema SHALL inizializzare `react-i18next` con italiano (`it`) come unica lingua attiva al momento di `add-foundation`. SHALL NOT essere proposto un selettore di lingua nelle Settings finché non verranno aggiunte altre lingue in una change futura. La struttura dei file di traduzione SHALL essere predisposta per supportare lingue aggiuntive senza refactoring.

#### Scenario: i18n bootstrap initializes Italian
- **WHEN** l'app viene avviata
- **THEN** `i18next` SHALL essere configurato con `lng: 'it'` e `fallbackLng: 'it'`
- **AND** SHALL caricare i namespace iniziali (`common`, `family`, `settings`, `errors`)

#### Scenario: Future languages can be added without refactor
- **WHEN** in una change futura viene aggiunto inglese
- **THEN** SHALL essere sufficiente creare `apps/mobile/src/locales/en/` con i file paralleli a `it/`
- **AND** aggiungere `en` al config di `i18next` senza toccare i call site di `t()`

### Requirement: Translations are organized by namespace per domain

Il sistema SHALL organizzare le traduzioni per namespace funzionale invece di un unico file `it.json` monolitico. Ogni namespace SHALL corrispondere a un'area del prodotto (es. `common`, `settings`, `family`, `errors`, e in futuro `shopping`, `calendar`, `weather`, `voice`). I namespace SHALL essere caricati on-demand per evitare bundle size eccessivo.

#### Scenario: Family namespace contains family-related strings
- **WHEN** un componente in `apps/mobile/src/components/family/` chiama `t('member.add', { ns: 'family' })`
- **THEN** la stringa risolta SHALL provenire da `apps/mobile/src/locales/it/family.json`
- **AND** la chiave SHALL essere `member.add` con valore "Aggiungi membro"

### Requirement: i18n provides a useTranslation hook helper

Il sistema SHALL esporre un hook `useT(namespace)` che wrappa `useTranslation` per fornire una API più ergonomica e type-safe. L'hook SHALL preferibilmente esporre tipi TypeScript generati a partire dai file JSON di traduzione, in modo che `t('member.invalid_key')` causi un errore di compilazione.

#### Scenario: Wrong key fails at compile time
- **WHEN** uno sviluppatore scrive `const { t } = useT('family'); t('member.this_key_does_not_exist')`
- **THEN** il TypeScript checker SHALL segnalare un errore al build/lint time
- **AND** il PR SHALL essere bloccato finché la chiave non viene corretta

#### Scenario: Hook returns t and i18n
- **WHEN** un componente chiama `const { t, i18n } = useT('common')`
- **THEN** `t` SHALL essere la funzione di traduzione bound al namespace `common`
- **AND** `i18n` SHALL essere l'istanza globale per cambiare lingua o leggere lo stato corrente
