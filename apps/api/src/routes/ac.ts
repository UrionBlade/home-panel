import type { AcDevice, GeCredentialsStatus } from "@home-panel/shared";
import { Hono } from "hono";
import { buildAuthorizationUrl, exchangeCodeForTokens, GeAuthError } from "../lib/ge/auth.js";
import { GeNotConfiguredError, geFetchJson } from "../lib/ge/client.js";
import { geTokenStore, getCredentialsEmail } from "../lib/ge/store.js";

/* ----- In-memory state store for the OAuth dance (TTL 10 min) ----- */

interface PendingState {
  redirectUri: string;
  expiresAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map<string, PendingState>();

function setPendingState(state: string, redirectUri: string): void {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (v.expiresAt < now) pendingStates.delete(k);
  }
  pendingStates.set(state, { redirectUri, expiresAt: now + STATE_TTL_MS });
}

function takePendingState(state: string): PendingState | null {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/* ----- SmartHQ Digital Twin API response shape (only the fields we use) ----- */

interface SmartHqDevice {
  deviceId: string;
  deviceType: string;
  serial: string;
  nickname?: string;
  model?: string;
  lastPresenceTime?: string;
}

interface SmartHqDeviceListResponse {
  total: number;
  devices: SmartHqDevice[];
}

function toAcDevice(d: SmartHqDevice): AcDevice {
  return {
    id: d.deviceId,
    serial: d.serial,
    model: d.model ?? null,
    nickname: d.nickname ?? null,
    roomId: null,
    state: null,
    lastSeenAt: d.lastPresenceTime ?? null,
  };
}

/** HTML shown to the user in the external browser after a successful
 * callback. Intentionally minimal — the panel's own UI picks up the new
 * status via polling `/config`. */
const CALLBACK_SUCCESS_HTML = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>GE Appliances collegato</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1013;color:#f5f5f4}
.card{text-align:center;padding:2.5rem;max-width:400px}
h1{font-size:1.5rem;margin:0 0 .5rem}
p{color:#a8a29e;margin:0}
.check{font-size:3rem;margin-bottom:1rem}
</style></head>
<body><div class="card">
<div class="check">✓</div>
<h1>GE Appliances collegato</h1>
<p>Puoi tornare al pannello, la connessione è attiva.</p>
</div></body></html>`;

const CALLBACK_ERROR_HTML = (msg: string) => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Errore collegamento GE</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1013;color:#f5f5f4}
.card{text-align:center;padding:2.5rem;max-width:420px}
h1{font-size:1.5rem;margin:0 0 .5rem;color:#f87171}
p{color:#a8a29e;margin:0;font-size:.875rem}
</style></head>
<body><div class="card">
<h1>Collegamento non riuscito</h1>
<p>${msg}</p>
</div></body></html>`;

/* ----- Router ----- */

export const acRouter = new Hono()

  /* Current link status — polled by the UI while the user is completing
   * the browser OAuth flow. */
  .get("/config", (c) => {
    const tokens = geTokenStore.loadTokens();
    const body: GeCredentialsStatus = {
      configured: !!tokens,
      email: getCredentialsEmail(),
    };
    return c.json(body);
  })

  /* Disconnect — wipe tokens + devices (cascade handled manually, no FK). */
  .delete("/config", (c) => {
    geTokenStore.clearTokens();
    return c.json({ ok: true });
  })

  /* Start the OAuth dance. Body carries the redirectUri computed by the
   * client (backend public URL + callback path) so the server doesn't need
   * to know its own externally reachable address. */
  .post("/oauth/start", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { redirectUri?: string } | null;
    const redirectUri = body?.redirectUri?.trim();
    if (!redirectUri) {
      return c.json({ error: "redirectUri obbligatorio" }, 400);
    }
    try {
      // Reject anything that isn't http/https — prevents using this
      // endpoint as an open redirect to custom schemes.
      const parsed = new URL(redirectUri);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return c.json({ error: "redirectUri deve usare http(s)" }, 400);
      }
    } catch {
      return c.json({ error: "redirectUri non valido" }, 400);
    }

    const state = crypto.randomUUID();
    setPendingState(state, redirectUri);

    const authorizationUrl = buildAuthorizationUrl({ redirectUri, state });
    return c.json({ authorizationUrl, state });
  });

/* ----- Public callback (registered separately in index.ts so the auth
 * middleware can be bypassed — Brillion redirects a raw browser here). ----- */

export const acOauthCallbackRouter = new Hono().get("/", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const errorQuery = c.req.query("error");

  if (errorQuery) {
    return c.html(CALLBACK_ERROR_HTML(`GE ha risposto: ${errorQuery}`), 400);
  }
  if (!code || !state) {
    return c.html(CALLBACK_ERROR_HTML("Risposta senza code o state."), 400);
  }

  const pending = takePendingState(state);
  if (!pending) {
    return c.html(
      CALLBACK_ERROR_HTML("Richiesta scaduta o non valida. Riapri il collegamento dal pannello."),
      400,
    );
  }

  try {
    const tokens = await exchangeCodeForTokens({
      code,
      redirectUri: pending.redirectUri,
    });
    geTokenStore.saveTokens(tokens);
    return c.html(CALLBACK_SUCCESS_HTML);
  } catch (err) {
    console.error("[ac] token exchange failed:", err);
    const detail =
      err instanceof GeAuthError && err.body
        ? err.body.replace(/[<>]/g, "")
        : "token exchange fallito";
    return c.html(CALLBACK_ERROR_HTML(detail), 500);
  }
});

/* ----- Devices (live discovery against SmartHQ) ----- */

acRouter.get("/devices", async (c) => {
  try {
    const resp = await geFetchJson<SmartHqDeviceListResponse>(geTokenStore, "/v2/device");
    const devices = resp.devices.map(toAcDevice);
    return c.json(devices);
  } catch (err) {
    if (err instanceof GeNotConfiguredError) {
      return c.json({ error: "GE Appliances non configurato" }, 400);
    }
    if (err instanceof GeAuthError) {
      return c.json({ error: `GE API errore ${err.status ?? "?"}` }, 502);
    }
    console.error("[ac] device listing failed:", err);
    return c.json({ error: "errore interno" }, 500);
  }
});
