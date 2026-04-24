/**
 * eWeLink OAuth2 authorization callback.
 *
 * Registered at `/api/v1/lights/providers/ewelink/oauth/callback` and
 * exempt from Bearer auth (the eWeLink auth server redirects a raw
 * browser here, which cannot attach Authorization headers). CSRF
 * protection comes from the one-shot `state` nonce issued by
 * `/oauth/start` on the same backend.
 *
 * On receipt of a valid `code + state`, the handler exchanges the code
 * for access + refresh tokens and stores them under the existing
 * `ewelink` provider_credentials row so the rest of the lights code
 * picks them up transparently.
 */

import type { Context } from "hono";
import { getEwelinkAppKeys } from "../lib/lights/providers/ewelink.js";
import {
  EwelinkOauthError,
  exchangeCodeForTokens,
  getEwelinkRedirectUri,
  takeEwelinkPending,
  wipePendingAuthFields,
} from "../lib/lights/providers/ewelink-oauth.js";

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

/** Receives `?code=...&state=...&region=...` from eWeLink's authorization
 * server, validates the state nonce, exchanges the code for tokens and
 * persists them. Returns HTML (this is a browser redirect target). */
export async function ewelinkOauthCallbackHandler(c: Context): Promise<Response> {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const regionQuery = c.req.query("region");
  const errorQuery = c.req.query("error");

  if (errorQuery) {
    return c.html(CALLBACK_ERROR_HTML(`eWeLink ha risposto: ${errorQuery}`), 400);
  }
  if (!code || !state) {
    return c.html(CALLBACK_ERROR_HTML("Risposta senza code o state."), 400);
  }

  const pending = takeEwelinkPending(state);
  if (!pending) {
    return c.html(
      CALLBACK_ERROR_HTML("Richiesta scaduta o non valida. Riapri il collegamento dal pannello."),
      400,
    );
  }

  const app = getEwelinkAppKeys();
  if (!app) {
    return c.html(
      CALLBACK_ERROR_HTML("EWELINK_APP_ID / EWELINK_APP_SECRET mancanti lato server."),
      500,
    );
  }
  const redirectUri = getEwelinkRedirectUri();
  if (!redirectUri) {
    return c.html(CALLBACK_ERROR_HTML("EWELINK_OAUTH_REDIRECT_URI mancante lato server."), 500);
  }

  /* Region priority: the query param echoed back by eWeLink wins, because
   * the hosted page may have redirected the user to a different region
   * than the one we suggested on /oauth/start. Fall back to the pending
   * entry otherwise. */
  const region = regionIsValid(regionQuery) ? regionQuery : pending.region;

  try {
    await exchangeCodeForTokens({
      code,
      region,
      redirectUri,
      clientId: app.appId,
      clientSecret: app.appSecret,
    });
    wipePendingAuthFields();
    return c.html(CALLBACK_SUCCESS_HTML);
  } catch (err) {
    console.error("[ewelink] oauth token exchange failed:", err);
    const detail =
      err instanceof EwelinkOauthError
        ? `${err.message} (error ${err.code})`
        : "errore interno durante lo scambio del token";
    return c.html(CALLBACK_ERROR_HTML(detail), 500);
  }
}

function regionIsValid(v: string | undefined): v is "eu" | "us" | "as" | "cn" {
  return v === "eu" || v === "us" || v === "as" || v === "cn";
}
