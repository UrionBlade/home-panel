import type {
  LaundryAppliance,
  LaundryApplianceType,
  LaundryCommandInput,
  LaundryStatus,
  SmartThingsAssignInput,
  SmartThingsConfig,
  SmartThingsDevice,
  SmartThingsSetupInput,
} from "@home-panel/shared";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { smartthingsConfig } from "../db/schema.js";

const ST_BASE = "https://api.smartthings.com/v1";

/* ---- Cache in-memory per il polling ---- */
let applianceCache: LaundryAppliance[] = [];
let lastPoll = 0;
const POLL_INTERVAL = 30_000; // 30s

/* ---- Helpers SmartThings ---- */

function getConfig() {
  const row = db.select().from(smartthingsConfig).get();
  // Fallback a env var se non configurato dalla UI
  if (!row?.pat && process.env.SMARTTHINGS_PAT) {
    return {
      ...(row ?? { id: 1, washerDeviceId: null, dryerDeviceId: null, updatedAt: "" }),
      pat: process.env.SMARTTHINGS_PAT,
    };
  }
  return row;
}

function stHeaders(pat: string) {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/json",
  };
}

async function stFetch<T>(pat: string, path: string): Promise<T> {
  const res = await fetch(`${ST_BASE}${path}`, { headers: stHeaders(pat) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SmartThings ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function stPost<T>(pat: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ST_BASE}${path}`, {
    method: "POST",
    headers: { ...stHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SmartThings ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function detectType(capabilities: string[]): LaundryApplianceType | "unknown" {
  if (capabilities.includes("washerOperatingState")) return "washer";
  if (capabilities.includes("dryerOperatingState")) return "dryer";
  return "unknown";
}

async function fetchDeviceStatus(
  pat: string,
  deviceId: string,
  type: LaundryApplianceType,
): Promise<LaundryAppliance | null> {
  try {
    // Fetch device info + status in parallel
    const [info, status] = await Promise.all([
      stFetch<{ deviceId: string; label: string; name: string }>(pat, `/devices/${deviceId}`),
      stFetch<{
        components: Record<
          string,
          Record<string, Record<string, { value: unknown; timestamp: string }>>
        >;
      }>(pat, `/devices/${deviceId}/status`),
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

    // Campi base
    const machineState = (opState?.machineState?.value as string) ?? "stop";
    const jobState = (opState?.[jobKey]?.value as string) ?? "none";
    const completionTime = (opState?.completionTime?.value as string) ?? null;
    const power = switchState?.switch?.value === "on";
    const remoteControlEnabled = remoteCtrl?.remoteControlEnabled?.value === "true";
    const timestamp = opState?.machineState?.timestamp ?? new Date().toISOString();

    // Programma / modo
    const mode =
      (modeState?.washerMode?.value as string) ?? (modeState?.dryerMode?.value as string) ?? null;

    // Campi solo lavatrice
    const waterTemp = main.washerWaterTemperature;
    const spinLvl = main.washerSpinLevel;
    const rinse = main.washerRinseCycles;
    const waterTemperature = (waterTemp?.washerWaterTemperature?.value as string) ?? null;
    const spinLevel = (spinLvl?.washerSpinLevel?.value as string) ?? null;
    const rinseCyclesRaw = rinse?.washerRinseCycles?.value;
    const rinseCycles = typeof rinseCyclesRaw === "number" ? rinseCyclesRaw : null;

    // Consumo energetico
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

/** Auto-discovery: se il PAT c'è ma i device non sono assegnati, cerca e assegna */
async function autoAssignDevices(pat: string): Promise<{
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
    }>(pat, "/devices");

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
  if (!config?.pat) return [];

  // Auto-assign se mancano device IDs
  let { washerDeviceId, dryerDeviceId } = {
    washerDeviceId: config.washerDeviceId,
    dryerDeviceId: config.dryerDeviceId,
  };
  if (!washerDeviceId && !dryerDeviceId) {
    const assigned = await autoAssignDevices(config.pat);
    washerDeviceId = assigned.washerDeviceId;
    dryerDeviceId = assigned.dryerDeviceId;
  }

  const tasks: Promise<LaundryAppliance | null>[] = [];
  if (washerDeviceId) {
    tasks.push(fetchDeviceStatus(config.pat, washerDeviceId, "washer"));
  }
  if (dryerDeviceId) {
    tasks.push(fetchDeviceStatus(config.pat, dryerDeviceId, "dryer"));
  }

  const results = await Promise.all(tasks);
  return results.filter((a): a is LaundryAppliance => a !== null);
}

let pollPromise: Promise<LaundryAppliance[]> | null = null;

async function getCachedAppliances(): Promise<LaundryAppliance[]> {
  const now = Date.now();
  if (now - lastPoll > POLL_INTERVAL) {
    if (!pollPromise) {
      pollPromise = pollAppliances().finally(() => {
        pollPromise = null;
      });
    }
    applianceCache = await pollPromise;
    lastPoll = now;
  }
  return applianceCache;
}

/* ---- Routes ---- */

export const laundryRouter = new Hono()

  /* Stato corrente lavatrice/asciugatrice */
  .get("/status", async (c) => {
    const config = getConfig();
    if (!config?.pat) {
      return c.json<LaundryStatus>({ configured: false, appliances: [] });
    }
    const appliances = await getCachedAppliances();
    return c.json<LaundryStatus>({ configured: true, appliances });
  })

  /* Forza refresh (invalida cache) */
  .post("/refresh", async (c) => {
    applianceCache = await pollAppliances();
    lastPoll = Date.now();
    return c.json({ ok: true, appliances: applianceCache });
  })

  /* Config SmartThings */
  .get("/config", (c) => {
    const config = getConfig();
    return c.json<SmartThingsConfig>({
      configured: !!config?.pat,
      washerDeviceId: config?.washerDeviceId ?? null,
      dryerDeviceId: config?.dryerDeviceId ?? null,
    });
  })

  /* Setup PAT */
  .post("/config", async (c) => {
    const body = (await c.req.json().catch(() => null)) as SmartThingsSetupInput | null;
    if (!body?.pat?.trim()) {
      return c.json({ error: "pat required" }, 400);
    }

    // Verifica che il PAT sia valido
    try {
      await stFetch(body.pat.trim(), "/devices?capability=washerOperatingState");
    } catch {
      return c.json({ error: "PAT non valido o scaduto" }, 400);
    }

    const existing = getConfig();
    if (existing) {
      db.update(smartthingsConfig)
        .set({ pat: body.pat.trim(), updatedAt: new Date().toISOString() })
        .run();
    } else {
      db.insert(smartthingsConfig)
        .values({ pat: body.pat.trim(), updatedAt: new Date().toISOString() })
        .run();
    }

    // Reset cache
    applianceCache = [];
    lastPoll = 0;

    return c.json({ ok: true });
  })

  /* Disconnetti (cancella config) */
  .delete("/config", (c) => {
    db.delete(smartthingsConfig).run();
    applianceCache = [];
    lastPoll = 0;
    return c.json({ ok: true });
  })

  /* Lista device SmartThings (per selezione lavatrice/asciugatrice) */
  .get("/devices", async (c) => {
    const config = getConfig();
    if (!config?.pat) {
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
    }>(config.pat, "/devices");

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

  /* Assegna device lavatrice/asciugatrice */
  .patch("/config/devices", async (c) => {
    const config = getConfig();
    if (!config?.pat) {
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

    db.update(smartthingsConfig).set(updates).run();

    // Reset cache per forzare nuovo poll
    applianceCache = [];
    lastPoll = 0;

    return c.json({ ok: true });
  })

  /* Invia comando (start/stop/pause) a un dispositivo */
  .post("/command", async (c) => {
    const config = getConfig();
    if (!config?.pat) {
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

    // Determina se è lavatrice o asciugatrice
    const isWasher = body.deviceId === config.washerDeviceId;
    const capability = isWasher
      ? mappedCommand.capability
      : mappedCommand.capability.replace("washer", "dryer");

    try {
      await stPost(config.pat, `/devices/${body.deviceId}/commands`, {
        commands: [
          {
            component: "main",
            capability,
            command: mappedCommand.command,
          },
        ],
      });

      // Invalida cache per refresh immediato
      applianceCache = [];
      lastPoll = 0;

      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore invio comando" }, 500);
    }
  });
