import type {
  AcCommandInput,
  AcDeviceUpdateInput,
  AcFanSpeed,
  AcMode,
  AcSwing,
  GeCredentialsStatus,
  GeSetupInput,
} from "@home-panel/shared";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { geCredentials } from "../db/schema.js";
import { applyAcCommand, readAcState } from "../lib/ge/ac-commands.js";
import { GeAuthError, loginWithCredentials } from "../lib/ge/auth.js";
import { GeNotConfiguredError, geFetchJson } from "../lib/ge/client.js";
import {
  getAcDevice,
  listAcDevices,
  saveAcState,
  updateAcDeviceMeta,
  upsertDiscoveredDevices,
} from "../lib/ge/device-repo.js";
import { geTokenStore, getCredentialsEmail } from "../lib/ge/store.js";

/* ----- SmartHQ Digital Twin API response shape (only the fields we use) ----- */

interface SmartHqDevice {
  /** SmartHQ-internal UUID. Unique but NOT the one accepted by the
   * Brillion ERD endpoints — use `macAddress` for those. */
  deviceId: string;
  deviceType?: string;
  /** Stable hardware address. This is the "JID" the legacy Brillion v1
   * API expects in `/v1/appliance/{jid}/erd`. We adopt it as our row PK
   * so discovery, the poller and the command routes share the same id
   * space. */
  macAddress?: string;
  nickname?: string;
  model?: string;
  lastPresenceTime?: string;
  personality?: string;
}

interface SmartHqDeviceListResponse {
  total?: number;
  devices?: SmartHqDevice[];
}

function isAirConditioner(d: SmartHqDevice): boolean {
  const t = (d.deviceType ?? "").toLowerCase();
  return t.includes("airconditioner") || t.includes("ac");
}

const VALID_MODES: readonly AcMode[] = ["cool", "heat", "dry", "fan", "auto"] as const;
const VALID_FAN: readonly AcFanSpeed[] = ["auto", "low", "mid", "high"] as const;
const VALID_SWING: readonly AcSwing[] = ["off", "on"] as const;

function parseCommand(raw: unknown): AcCommandInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body JSON richiesto" };
  const body = raw as Record<string, unknown>;
  const out: AcCommandInput = {};

  if (body.power !== undefined) {
    if (typeof body.power !== "boolean") return { error: "power deve essere booleano" };
    out.power = body.power;
  }
  if (body.mode !== undefined) {
    if (!VALID_MODES.includes(body.mode as AcMode)) return { error: "mode non valido" };
    out.mode = body.mode as AcMode;
  }
  if (body.fanSpeed !== undefined) {
    if (!VALID_FAN.includes(body.fanSpeed as AcFanSpeed)) {
      return { error: "fanSpeed non valido" };
    }
    out.fanSpeed = body.fanSpeed as AcFanSpeed;
  }
  if (body.swing !== undefined) {
    if (!VALID_SWING.includes(body.swing as AcSwing)) return { error: "swing non valido" };
    out.swing = body.swing as AcSwing;
  }
  if (body.targetTemp !== undefined) {
    if (typeof body.targetTemp !== "number" || !Number.isFinite(body.targetTemp)) {
      return { error: "targetTemp deve essere numero" };
    }
    out.targetTemp = body.targetTemp;
  }

  if (Object.keys(out).length === 0) return { error: "nessun campo da aggiornare" };
  return out;
}

function parsePatch(raw: unknown): AcDeviceUpdateInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body JSON richiesto" };
  const body = raw as Record<string, unknown>;
  const out: AcDeviceUpdateInput = {};

  if ("roomId" in body) {
    const v = body.roomId;
    if (v !== null && typeof v !== "string") return { error: "roomId deve essere stringa o null" };
    out.roomId = v as string | null;
  }
  if ("nickname" in body) {
    const v = body.nickname;
    if (v !== null && typeof v !== "string") {
      return { error: "nickname deve essere stringa o null" };
    }
    out.nickname = v as string | null;
  }
  if (Object.keys(out).length === 0) return { error: "nessun campo da aggiornare" };
  return out;
}

/** Fetch the SmartHQ device list and persist a row per AC appliance.
 * Uses `macAddress` as the stable id so downstream ERD calls can reuse
 * the same string. Returns the list of mac addresses currently linked. */
async function refreshDeviceRegistry(): Promise<string[]> {
  const resp = await geFetchJson<SmartHqDeviceListResponse>(geTokenStore, "/v2/device");
  const acs = (resp.devices ?? []).filter((d) => isAirConditioner(d) && !!d.macAddress);
  upsertDiscoveredDevices(
    acs.map((d) => ({
      id: d.macAddress ?? d.deviceId,
      serial: d.macAddress ?? d.deviceId,
      model: d.model ?? null,
      nickname: d.nickname ?? null,
      lastSeenAt: d.lastPresenceTime ?? null,
    })),
  );
  return acs.map((d) => d.macAddress ?? d.deviceId);
}

/* ----- Router ----- */

export const acRouter = new Hono()

  /* Current link status. */
  .get("/config", (c) => {
    const tokens = geTokenStore.loadTokens();
    const body: GeCredentialsStatus = {
      configured: !!tokens,
      email: getCredentialsEmail(),
    };
    return c.json(body);
  })

  /* Initial login: credentials in, tokens + email persisted server-side.
   * Same endpoint is reused when the refresh token eventually dies — the
   * UI just prompts the user to re-enter the password. */
  .post("/config", async (c) => {
    const body = (await c.req.json().catch(() => null)) as GeSetupInput | null;
    if (!body?.email?.trim() || !body.password) {
      return c.json({ error: "email e password richiesti" }, 400);
    }
    const email = body.email.trim();

    try {
      const tokens = await loginWithCredentials({ email, password: body.password });
      geTokenStore.saveTokens(tokens);
      /* Remember the email for the "Connected as X" UI hint. The token
       * store doesn't touch it so we write directly. */
      const existing = db.select().from(geCredentials).get();
      if (existing) {
        db.update(geCredentials).set({ email, updatedAt: new Date().toISOString() }).run();
      }
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof GeAuthError) {
        /* 400 covers "bad credentials / MFA / terms" — all user-actionable.
         * 502 covers anything else (GE server flaky, HTML changed). */
        const status = err.status === 200 || err.status === 400 ? 400 : 502;
        return c.json({ error: err.message }, status);
      }
      console.error("[ac] login failed:", err);
      return c.json({ error: "errore interno durante il login GE" }, 500);
    }
  })

  /* Disconnect — wipe tokens. Device rows survive (they carry the room
   * assignment made by the user) but will report stale state until next
   * link. Wiping them too would lose user configuration on a reconnect. */
  .delete("/config", (c) => {
    geTokenStore.clearTokens();
    return c.json({ ok: true });
  })

  /* Devices: refresh the registry from SmartHQ (upsert into DB preserving
   * user metadata), then return the DB-backed view which carries roomId
   * and last polled state. Refresh failures are non-fatal — we log and
   * fall back to the DB so a flaky cloud call or a single bad row can't
   * black-hole the tile. */
  .get("/devices", async (c) => {
    if (!geTokenStore.loadTokens()) {
      return c.json({ error: "GE Appliances non configurato" }, 400);
    }
    try {
      await refreshDeviceRegistry();
    } catch (err) {
      if (err instanceof GeNotConfiguredError) {
        return c.json({ error: "GE Appliances non configurato" }, 400);
      }
      console.warn(
        "[ac] discovery/upsert failed, falling back to DB:",
        err instanceof Error ? err.message : err,
      );
    }
    return c.json(listAcDevices());
  })

  /* Local metadata update (roomId / nickname). Goes through the DB only,
   * no GE call. */
  .patch("/devices/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    const parsed = parsePatch(body);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    const updated = updateAcDeviceMeta(id, parsed);
    if (!updated) return c.json({ error: "dispositivo non trovato" }, 404);
    return c.json(updated);
  })

  /* Send a command to the appliance and refresh its state. We write all
   * specified ERDs sequentially, then poll once to return the resulting
   * state so the UI can reconcile its optimistic update. */
  .post("/devices/:id/command", async (c) => {
    const id = c.req.param("id");
    const device = getAcDevice(id);
    if (!device) return c.json({ error: "dispositivo non trovato" }, 404);

    const body = await c.req.json().catch(() => null);
    const parsed = parseCommand(body);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);

    try {
      await applyAcCommand(geTokenStore, id, parsed);
      /* GE takes a beat to apply the command before `/erd` reflects it.
       * We don't block the request on a read-your-writes loop — the
       * scheduler will converge within ~60s. Return the optimistic
       * merge so the UI has something to show immediately. */
      const optimistic = {
        ...(device.state ?? {
          power: false,
          mode: "cool" as AcMode,
          currentTemp: null,
          targetTemp: 24,
          fanSpeed: "auto" as AcFanSpeed,
          swing: "off" as AcSwing,
          updatedAt: new Date().toISOString(),
        }),
        ...(parsed.power !== undefined && { power: parsed.power }),
        ...(parsed.mode !== undefined && { mode: parsed.mode }),
        ...(parsed.fanSpeed !== undefined && { fanSpeed: parsed.fanSpeed }),
        ...(parsed.swing !== undefined && { swing: parsed.swing }),
        ...(parsed.targetTemp !== undefined && { targetTemp: parsed.targetTemp }),
        updatedAt: new Date().toISOString(),
      };
      saveAcState(id, optimistic);
      return c.json({ ok: true, state: optimistic });
    } catch (err) {
      if (err instanceof GeNotConfiguredError) {
        return c.json({ error: "GE Appliances non configurato" }, 400);
      }
      console.error("[ac] command failed:", err);
      return c.json({ error: "errore invio comando" }, 502);
    }
  });

/** Invoked by the poller. Exposed here so the scheduler can trigger a
 * fresh fetch per device without duplicating the listing logic. */
export async function pollAcDevice(id: string): Promise<void> {
  const state = await readAcState(geTokenStore, id);
  saveAcState(id, state);
}
