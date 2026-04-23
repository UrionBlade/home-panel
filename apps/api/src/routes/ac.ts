import type { AcDevice, GeCredentialsStatus, GeSetupInput } from "@home-panel/shared";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { geCredentials } from "../db/schema.js";
import { GeAuthError, loginWithCredentials } from "../lib/ge/auth.js";
import { GeNotConfiguredError, geFetchJson } from "../lib/ge/client.js";
import { geTokenStore, getCredentialsEmail } from "../lib/ge/store.js";

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

  /* Devices (live discovery against SmartHQ). */
  .get("/devices", async (c) => {
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
