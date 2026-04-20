# Home Panel — Claude instructions

## Language rules

- **All code and code comments must be written in English.** No exceptions.
- **User-facing UI copy must be localized** via `i18next` (namespaces in `apps/mobile/src/locales/{it,en}/*.json`). Never hardcode Italian (or English) strings in components — always go through `useT(namespace)` / `t("key")`.
- **Conversations with the user stay in Italian** (see global user instruction). This only affects what you write back in chat, not code.
- **Commit messages: English**, imperative mood (e.g. `fix: ...`, `feat: ...`, `chore: ...`).

## Voice assistant responses

Responses spoken by the voice assistant live under `voice.responses.*` in both locale files. The assistant is called "Casa" in IT and "Home" in EN. Do not hardcode response strings in `apps/mobile/src/lib/voice/intentHandlers.ts` — always use `vt(...)` / `vtArray(...)`.

## Architecture quick reference

- `apps/api` — Hono + Drizzle + SQLite. Routes under `src/routes/*.ts`, shared DB schema in `src/db/schema.ts`. Background schedulers are started explicitly from `src/index.ts`.
- `apps/mobile` — React + Vite + Tauri. Pages in `src/pages/`, shared hooks in `src/lib/hooks/`, TanStack Query for server state, Zustand for UI state, Tailwind 4.
- `packages/shared` — TypeScript types shared between API and mobile. No runtime code.

## Conventions

- No `any` unless strictly necessary. Prefer `unknown` + narrowing.
- No non-null assertions (`!`). Use explicit null checks or optional chaining.
- Keep `biome.json` strict — do not downgrade rules to warn/off to make the check pass; fix the code instead.
- Error responses from API: `{ error: string }` with appropriate HTTP status.
- SQLite date columns: store ISO-8601 strings, never epoch numbers.

## Testing & validation

Before committing non-trivial changes:
1. `pnpm biome check` — must pass with 0 errors
2. `pnpm typecheck` — must pass across all workspaces
3. For UI changes, test in the browser via `pnpm dev` and verify the golden path plus one edge case.
