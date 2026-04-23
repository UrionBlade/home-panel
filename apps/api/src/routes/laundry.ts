import type {
  LaundryAppliance,
  LaundryApplianceType,
  LaundryCommandInput,
  LaundryStatus,
  SmartThingsAssignInput,
  SmartThingsConfig,
  SmartThingsDevice,
} from "@home-panel/shared";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { smartthingsConfig } from "../db/schema.js";
import {
  exchangeCodeForTokens,
  getSmartThingsConfig,
  isSmartThingsConfigured,
  SmartThingsHttpError,
  stFetch,
  stPost,
} from "../lib/smartthings/client.js";

/** OAuth2 scopes requested from the SmartApp at authorization time.
 * Matches the minimum needed to list devices, read state and command
 * washer / dryer / TV. */
const ST_OAUTH_SCOPES = ["r:devices:*", "x:devices:*", "r:locations:*"];
const ST_AUTHORIZE_URL = "https://api.smartthings.com/oauth/authorize";

/* ----- In-memory OAuth state store (CSRF nonce, TTL 10 min) ----- */
interface PendingStOauth {
  redirectUri: string;
  expiresAt: number;
}
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pendingOauthStates = new Map<string, PendingStOauth>();

function setPendingOauth(state: string, redirectUri: string) {
  const now = Date.now();
  for (const [k, v] of pendingOauthStates) {
    if (v.expiresAt < now) pendingOauthStates.delete(k);
  }
  pendingOauthStates.set(state, { redirectUri, expiresAt: now + OAUTH_STATE_TTL_MS });
}
function takePendingOauth(state: string): PendingStOauth | null {
  const entry = pendingOauthStates.get(state);
  if (!entry) return null;
  pendingOauthStates.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/* ---- In-memory cache for polling ---- */
let applianceCache: LaundryAppliance[] = [];
let lastPoll = 0;
const POLL_INTERVAL = 30_000; // 30s

/* Local alias preserving the historical helper name inside this module. */
const getConfig = getSmartThingsConfig;

function detectType(capabilities: string[]): LaundryApplianceType | "unknown" {
  if (capabilities.includes("washerOperatingState")) return "washer";
  if (capabilities.includes("dryerOperatingState")) return "dryer";
  return "unknown";
}

async function fetchDeviceStatus(
  deviceId: string,
  type: LaundryApplianceType,
): Promise<LaundryAppliance | null> {
  try {
    // Fetch device info + status in parallel
    const [info, status] = await Promise.all([
      stFetch<{ deviceId: string; label: string; name: string }>(`/devices/${deviceId}`),
      stFetch<{
        components: Record<
          string,
          Record<string, Record<string, { value: unknown; timestamp: string }>>
        >;
      }>(`/devices/${deviceId}/status`),
    ]);

    const main = status.components?.main ?? {};

    const stateCapability = type === "washer" ? "washerOperatingState" : "dryerOperatingState";
    const jobKey = type === "washer" ? "washerJobState" : "dryerJobState";
    const modeCapability = type === "washer" ? "washerMode" : "dryerMode";

    const opState = main[stateCapability];
    const switchState = main.switch;
    const remoteCtrl = main.remoteControlStatus;
    const modeState = main[modeCapability];
    const powerReport = main.powerConsumptionReport;

    // Base fields
    const machineState = (opState?.machineState?.value as string) ?? "stop";
    const jobState = (opState?.[jobKey]?.value as string) ?? "none";
    const completionTime = (opState?.completionTime?.value as string) ?? null;
    const power = switchState?.switch?.value === "on";
    const remoteControlEnabled = remoteCtrl?.remoteControlEnabled?.value === "true";
    const timestamp = opState?.machineState?.timestamp ?? new Date().toISOString();

    // Program / mode
    const mode =
      (modeState?.washerMode?.value as string) ?? (modeState?.dryerMode?.value as string) ?? null;

    // Washer-only fields
    const waterTemp = main.washerWaterTemperature;
    const spinLvl = main.washerSpinLevel;
    const rinse = main.washerRinseCycles;
    const waterTemperature = (waterTemp?.washerWaterTemperature?.value as string) ?? null;
    const spinLevel = (spinLvl?.washerSpinLevel?.value as string) ?? null;
    const rinseCyclesRaw = rinse?.washerRinseCycles?.value;
    const rinseCycles = typeof rinseCyclesRaw === "number" ? rinseCyclesRaw : null;

    // Energy consumption
    let energyWh: number | null = null;
    const powerVal = powerReport?.powerConsumption?.value;
    if (
      powerVal &&
      typeof powerVal === "object" &&
      "energy" in (powerVal as Record<string, unknown>)
    ) {
      energyWh = (powerVal as { energy: number }).energy ?? null;
    }

    return {
      id: deviceId,
      name: info.label || info.name,
      type,
      machineState: machineState as LaundryAppliance["machineState"],
      jobState: jobState as LaundryAppliance["jobState"],
      completionTime: completionTime && completionTime !== "none" ? completionTime : null,
      power,
      remoteControlEnabled,
      mode,
      waterTemperature: type === "washer" ? waterTemperature : null,
      spinLevel: type === "washer" ? spinLevel : null,
      rinseCycles: type === "washer" ? rinseCycles : null,
      energyWh,
      updatedAt: timestamp,
    };
  } catch (err) {
    console.error(`[laundry] errore polling ${deviceId}:`, err);
    return null;
  }
}

/** Auto-discovery: if the PAT exists but devices are not assigned, search and assign */
async function autoAssignDevices(): Promise<{
  washerDeviceId: string | null;
  dryerDeviceId: string | null;
}> {
  try {
    const data = await stFetch<{
      items: Array<{
        deviceId: string;
        name: string;
        label: string;
        components: Array<{ capabilities: Array<{ id: string }> }>;
      }>;
    }>("/devices");

    let washerDeviceId: string | null = null;
    let dryerDeviceId: string | null = null;

    for (const d of data.items) {
      const caps = d.components.flatMap((comp) => comp.capabilities.map((cap) => cap.id));
      const type = detectType(caps);
      if (type === "washer" && !washerDeviceId) washerDeviceId = d.deviceId;
      if (type === "dryer" && !dryerDeviceId) dryerDeviceId = d.deviceId;
    }

    if (washerDeviceId || dryerDeviceId) {
      const existing = db.select().from(smartthingsConfig).get();
      const updates = {
        washerDeviceId,
        dryerDeviceId,
        updatedAt: new Date().toISOString(),
      };
      if (existing) {
        db.update(smartthingsConfig).set(updates).run();
      } else {
        db.insert(smartthingsConfig).values(updates).run();
      }
      console.log(`[laundry] auto-assign: washer=${washerDeviceId}, dryer=${dryerDeviceId}`);
    }

    return { washerDeviceId, dryerDeviceId };
  } catch (err) {
    console.error("[laundry] auto-assign fallito:", err);
    return { washerDeviceId: null, dryerDeviceId: null };
  }
}

async function pollAppliances(): Promise<LaundryAppliance[]> {
  const config = getConfig();
  if (!isSmartThingsConfigured() || !config) return [];

  // Auto-assign if device IDs are missing
  let { washerDeviceId, dryerDeviceId } = {
    washerDeviceId: config.washerDeviceId,
    dryerDeviceId: config.dryerDeviceId,
  };
  if (!washerDeviceId && !dryerDeviceId) {
    const assigned = await autoAssignDevices();
    washerDeviceId = assigned.washerDeviceId;
    dryerDeviceId = assigned.dryerDeviceId;
  }

  const tasks: Promise<LaundryAppliance | null>[] = [];
  if (washerDeviceId) {
    tasks.push(fetchDeviceStatus(washerDeviceId, "washer"));
  }
  if (dryerDeviceId) {
    tasks.push(fetchDeviceStatus(dryerDeviceId, "dryer"));
  }

  const results = await Promise.all(tasks);
  return results.filter((a): a is LaundryAppliance => a !== null);
}

let pollPromise: Promise<LaundryAppliance[]> | null = null;

async function getCachedAppliances(): Promise<LaundryAppliance[]> {
  const now = Date.now();
  if (now - lastPoll > POLL_INTERVAL) {
    if (!pollPromise) {
      // Capture the local promise, update cache + lastPoll ONLY on completion
      // to prevent concurrent requests from seeing lastPoll updated
      // before the fetch finishes.
      const current = pollAppliances()
        .then((result) => {
          applianceCache = result;
          lastPoll = Date.now();
          return result;
        })
        .finally(() => {
          pollPromise = null;
        });
      pollPromise = current;
    }
    return pollPromise;
  }
  return applianceCache;
}

/* ---- Routes ---- */

export const laundryRouter = new Hono()

  /* Current washer/dryer state */
  .get("/status", async (c) => {
    if (!isSmartThingsConfigured()) {
      return c.json<LaundryStatus>({ configured: false, appliances: [] });
    }
    const appliances = await getCachedAppliances();
    return c.json<LaundryStatus>({ configured: true, appliances });
  })

  /* Force refresh (invalidate cache) */
  .post("/refresh", async (c) => {
    applianceCache = await pollAppliances();
    lastPoll = Date.now();
    return c.json({ ok: true, appliances: applianceCache });
  })

  /* SmartThings config */
  .get("/config", (c) => {
    const config = getConfig();
    return c.json<SmartThingsConfig>({
      configured: isSmartThingsConfigured(),
      washerDeviceId: config?.washerDeviceId ?? null,
      dryerDeviceId: config?.dryerDeviceId ?? null,
      washerRoomId: config?.washerRoomId ?? null,
      dryerRoomId: config?.dryerRoomId ?? null,
    });
  })

  /* Start the SmartThings OAuth dance. The client passes the public
   * redirect URI (must match the one registered on the SmartApp) and
   * receives an `authorizationUrl` to open in an external browser. */
  .post("/oauth/start", async (c) => {
    const clientId = process.env.SMARTTHINGS_CLIENT_ID;
    if (!clientId) {
      return c.json({ error: "SMARTTHINGS_CLIENT_ID mancante nel .env del backend" }, 500);
    }

    const body = (await c.req.json().catch(() => null)) as { redirectUri?: string } | null;
    const redirectUri = body?.redirectUri?.trim();
    if (!redirectUri) {
      return c.json({ error: "redirectUri obbligatorio" }, 400);
    }
    try {
      const parsed = new URL(redirectUri);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return c.json({ error: "redirectUri deve usare http(s)" }, 400);
      }
    } catch {
      return c.json({ error: "redirectUri non valido" }, 400);
    }

    const state = crypto.randomUUID();
    setPendingOauth(state, redirectUri);

    const authorize = new URL(ST_AUTHORIZE_URL);
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("scope", ST_OAUTH_SCOPES.join(" "));
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("state", state);

    return c.json({ authorizationUrl: authorize.toString(), state });
  })

  /* Disconnect (clear config) */
  .delete("/config", (c) => {
    db.delete(smartthingsConfig).run();
    applianceCache = [];
    lastPoll = 0;
    return c.json({ ok: true });
  })

  /* List SmartThings devices (for washer/dryer selection) */
  .get("/devices", async (c) => {
    if (!isSmartThingsConfigured()) {
      return c.json({ error: "SmartThings non configurato" }, 400);
    }

    const data = await stFetch<{
      items: Array<{
        deviceId: string;
        name: string;
        label: string;
        components: Array<{
          capabilities: Array<{ id: string }>;
        }>;
      }>;
    }>("/devices");

    const devices: SmartThingsDevice[] = data.items
      .map((d) => {
        const caps = d.components.flatMap((comp) => comp.capabilities.map((cap) => cap.id));
        const type = detectType(caps);
        return {
          deviceId: d.deviceId,
          name: d.name,
          label: d.label || d.name,
          type,
        };
      })
      .filter((d) => d.type === "washer" || d.type === "dryer");

    return c.json(devices);
  })

  /* Assign washer/dryer devices */
  .patch("/config/devices", async (c) => {
    if (!isSmartThingsConfigured()) {
      return c.json({ error: "SmartThings non configurato" }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as SmartThingsAssignInput | null;
    if (!body) {
      return c.json({ error: "body required" }, 400);
    }

    const updates: Record<string, string | null> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.washerDeviceId !== undefined) updates.washerDeviceId = body.washerDeviceId;
    if (body.dryerDeviceId !== undefined) updates.dryerDeviceId = body.dryerDeviceId;
    if (body.washerRoomId !== undefined) {
      updates.washerRoomId = body.washerRoomId ? body.washerRoomId.trim() || null : null;
    }
    if (body.dryerRoomId !== undefined) {
      updates.dryerRoomId = body.dryerRoomId ? body.dryerRoomId.trim() || null : null;
    }

    db.update(smartthingsConfig).set(updates).run();

    // Reset cache to force a new poll
    applianceCache = [];
    lastPoll = 0;

    return c.json({ ok: true });
  })

  /* Send command (start/stop/pause) to a device */
  .post("/command", async (c) => {
    const config = getConfig();
    if (!isSmartThingsConfigured() || !config) {
      return c.json({ error: "SmartThings non configurato" }, 400);
    }

    const body = (await c.req.json().catch(() => null)) as LaundryCommandInput | null;
    if (!body?.deviceId || !body?.command) {
      return c.json({ error: "deviceId e command richiesti" }, 400);
    }

    const commandMap: Record<string, { capability: string; command: string }> = {
      start: { capability: "washerOperatingState", command: "start" },
      stop: { capability: "washerOperatingState", command: "stop" },
      pause: { capability: "washerOperatingState", command: "pause" },
    };

    const mappedCommand = commandMap[body.command];
    if (!mappedCommand) {
      return c.json({ error: `command '${body.command}' non supportato` }, 400);
    }

    // Determine whether it's a washer or dryer
    const isWasher = body.deviceId === config.washerDeviceId;
    const capability = isWasher
      ? mappedCommand.capability
      : mappedCommand.capability.replace("washer", "dryer");

    try {
      await stPost(`/devices/${body.deviceId}/commands`, {
        commands: [
          {
            component: "main",
            capability,
            command: mappedCommand.command,
          },
        ],
      });

      // Invalidate cache for immediate refresh
      applianceCache = [];
      lastPoll = 0;

      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore invio comando" }, 500);
    }
  });

/* ----- Public callback ----- */

const CALLBACK_SUCCESS_HTML = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>SmartThings collegato</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1013;color:#f5f5f4}
.card{text-align:center;padding:2.5rem;max-width:400px}
h1{font-size:1.5rem;margin:0 0 .5rem}
p{color:#a8a29e;margin:0}
.check{font-size:3rem;margin-bottom:1rem}</style></head>
<body><div class="card"><div class="check">&#10003;</div>
<h1>SmartThings collegato</h1>
<p>Puoi tornare al pannello, la connessione &egrave; attiva.</p></div></body></html>`;

const CALLBACK_ERROR_HTML = (msg: string) => `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Errore collegamento SmartThings</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f1013;color:#f5f5f4}
.card{text-align:center;padding:2.5rem;max-width:420px}
h1{font-size:1.5rem;margin:0 0 .5rem;color:#f87171}
p{color:#a8a29e;margin:0;font-size:.875rem}</style></head>
<body><div class="card"><h1>Collegamento non riuscito</h1><p>${msg}</p></div></body></html>`;

export const laundryOauthCallbackRouter = new Hono().get("/", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const errorQuery = c.req.query("error");

  if (errorQuery) {
    return c.html(CALLBACK_ERROR_HTML(`SmartThings ha risposto: ${errorQuery}`), 400);
  }
  if (!code || !state) {
    return c.html(CALLBACK_ERROR_HTML("Risposta senza code o state."), 400);
  }

  const pending = takePendingOauth(state);
  if (!pending) {
    return c.html(
      CALLBACK_ERROR_HTML("Richiesta scaduta o non valida. Riapri il collegamento dal pannello."),
      400,
    );
  }

  try {
    await exchangeCodeForTokens({ code, redirectUri: pending.redirectUri });
    /* Reset any cached appliance state so the next poll uses the new token. */
    applianceCache = [];
    lastPoll = 0;
    return c.html(CALLBACK_SUCCESS_HTML);
  } catch (err) {
    console.error("[laundry] SmartThings token exchange failed:", err);
    const detail =
      err instanceof SmartThingsHttpError && err.status === 400
        ? "code non valido o scaduto"
        : "errore interno durante lo scambio del token";
    return c.html(CALLBACK_ERROR_HTML(detail), 500);
  }
});

/* ----- SmartThings SmartApp lifecycle webhook -----
 *
 * SmartThings requires every registered SmartApp to expose a Target URL
 * that answers the lifecycle handshake. We only care about the OAuth
 * authorization flow; the lifecycle calls are acknowledged but not
 * otherwise processed. PING is the one call that _must_ echo the
 * challenge verbatim — the initial "Verify App" step fails without it.
 */

interface StLifecycleRequest {
  lifecycle: string;
  executionId?: string;
  pingData?: { challenge: string };
  confirmationData?: { appId?: string; confirmationUrl?: string };
  [key: string]: unknown;
}

export const smartthingsWebhookRouter = new Hono().post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as StLifecycleRequest | null;
  if (!body?.lifecycle) {
    return c.json({ error: "body mancante" }, 400);
  }
  switch (body.lifecycle) {
    case "PING":
      /* Registration handshake — echo the challenge so SmartThings knows
       * the Target URL is actually ours. */
      return c.json({ pingData: { challenge: body.pingData?.challenge ?? "" } });
    case "CONFIRMATION":
      /* "App confirmation" step used for enterprise flows; we don't hit
       * the confirmationUrl because the public consumer OAuth flow
       * doesn't require it. Returning 200 keeps SmartThings happy. */
      return c.json({ targetUrl: c.req.url });
    case "CONFIGURATION":
    case "INSTALL":
    case "UPDATE":
    case "UNINSTALL":
    case "EVENT":
    case "OAUTH_CALLBACK":
      /* Not used by this integration — we only consume the device API
       * with the user's OAuth token, no SmartApp-style event wiring. */
      return c.json({});
    default:
      return c.json({});
  }
});
