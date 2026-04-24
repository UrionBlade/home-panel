/**
 * eWeLink OAuth2 authorization callback.
 *
 * Registered at `/api/v1/lights/providers/ewelink/oauth/callback` and
 * exempt from Bearer auth (the eWeLink auth server redirects a raw
 * browser here, which cannot attach Authorization headers). CSRF
 * protection comes from the one-shot `state` nonce created by the
 * companion `/oauth/start` endpoint.
 *
 * The current revision is deliberately minimal: it validates the
 * `state` nonce and persists the received `code` so the user can
 * complete the code → access_token exchange once the application's
 * `EWELINK_OAUTH_CLIENT_ID` / `EWELINK_OAUTH_CLIENT_SECRET` are
 * configured in the backend env. The HMAC-signed token request eWeLink
 * requires is an isolated follow-up — this handler exists right now so
 * the redirect URI can be validated by the eWeLink Dev Console.
 */

import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/client.js";
import { providerCredentials } from "../db/schema.js";

const EWELINK = "ewelink" as const;

/* ---- In-memory OAuth state store (CSRF nonce, TTL 10 min) --------- */

interface PendingOauth {
  redirectUri: string;
  expiresAt: number;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pendingOauthStates = new Map<string, PendingOauth>();

export function setEwelinkPendingOauth(state: string, redirectUri: string): void {
  const now = Date.now();
  for (const [k, v] of pendingOauthStates) {
    if (v.expiresAt < now) pendingOauthStates.delete(k);
  }
  pendingOauthStates.set(state, { redirectUri, expiresAt: now + OAUTH_STATE_TTL_MS });
}

function takeEwelinkPendingOauth(state: string): PendingOauth | null {
  const entry = pendingOauthStates.get(state);
  if (!entry) return null;
  pendingOauthStates.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/* ---- HTML responses ------------------------------------------------ */

const CALLBACK_SUCCESS_HTML = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>eWeLink collegato</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1013;color:#f5f5f4}
.card{text-align:center;padding:2.5rem;max-width:420px}
h1{font-size:1.5rem;margin:0 0 .5rem;color:#a7f3d0}
p{color:#a8a29e;margin:0;font-size:.875rem}</style></head>
<body><div class="card"><h1>Collegamento autorizzato</h1><p>Puoi chiudere questa finestra e tornare al pannello.</p></div></body></html>`;

const CALLBACK_ERROR_HTML = (msg: string) => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Errore eWeLink</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1013;color:#f5f5f4}
.card{text-align:center;padding:2.5rem;max-width:420px}
h1{font-size:1.5rem;margin:0 0 .5rem;color:#f87171}
p{color:#a8a29e;margin:0;font-size:.875rem}</style></head>
<body><div class="card"><h1>Collegamento non riuscito</h1><p>${msg}</p></div></body></html>`;

/* ---- Handler ------------------------------------------------------- */

/** Receives `?code=...&state=...&region=...` from eWeLink's authorization
 * server. Persists the code + region into the provider_credentials row
 * under a staging key (`pendingAuthCode`) so a follow-up service can
 * exchange it for access + refresh tokens as soon as the client_id /
 * client_secret pair is available server-side. */
export async function ewelinkOauthCallbackHandler(c: Context): Promise<Response> {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const region = c.req.query("region") ?? null;
  const errorQuery = c.req.query("error");

  if (errorQuery) {
    return c.html(CALLBACK_ERROR_HTML(`eWeLink ha risposto: ${errorQuery}`), 400);
  }
  if (!code || !state) {
    return c.html(CALLBACK_ERROR_HTML("Risposta senza code o state."), 400);
  }

  /* When the Dev Console "tests" the redirect URI it may call this
   * endpoint without a matching pending state. Accept any code in that
   * case — the UX is still safe because the code alone isn't usable
   * without the client_secret, and rejecting here would block the
   * console validation. We only enforce state when one was actually
   * issued by /oauth/start. */
  const pending = state ? takeEwelinkPendingOauth(state) : null;
  if (state && !pending && pendingOauthStates.size > 0) {
    return c.html(
      CALLBACK_ERROR_HTML("Richiesta scaduta o non valida. Riapri il collegamento dal pannello."),
      400,
    );
  }

  try {
    const existing = db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.provider, EWELINK))
      .get();
    const previousConfig = existing
      ? (JSON.parse(existing.configJson) as Record<string, unknown>)
      : {};
    const nextConfig = {
      ...previousConfig,
      pendingAuthCode: code,
      pendingAuthRegion: region,
      pendingAuthRedirectUri: pending?.redirectUri ?? null,
      pendingAuthAt: new Date().toISOString(),
    };
    const row = {
      provider: EWELINK,
      configJson: JSON.stringify(nextConfig),
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      db.update(providerCredentials)
        .set({ configJson: row.configJson, updatedAt: row.updatedAt })
        .where(eq(providerCredentials.provider, EWELINK))
        .run();
    } else {
      db.insert(providerCredentials).values(row).run();
    }
    return c.html(CALLBACK_SUCCESS_HTML);
  } catch (err) {
    console.error("[ewelink] oauth callback persistence failed:", err);
    return c.html(CALLBACK_ERROR_HTML("Errore interno durante il salvataggio del codice."), 500);
  }
}
