import type {
  PushDevice,
  PushDevicesResponse,
  PushRegisterInput,
  PushRegisterResponse,
  PushTestInput,
} from "@home-panel/shared";
import { Hono } from "hono";
import type { PushTokenRow } from "../db/schema.js";
import { isApnsConfigured, sendApnsBatch } from "../lib/push/apns.js";
import {
  listTokens,
  registerToken,
  removeTokenById,
  removeTokenByValue,
} from "../lib/push/store.js";

function toDevice(row: PushTokenRow): PushDevice {
  return {
    id: row.id,
    token: row.token,
    platform: row.platform,
    label: row.label,
    familyMemberId: row.familyMemberId,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
  };
}

export const pushRouter = new Hono()

  /** Register a device token. Idempotent — same token returns same row. */
  .post("/register", async (c) => {
    const body = (await c.req.json().catch(() => null)) as PushRegisterInput | null;
    if (!body || typeof body.token !== "string" || !body.token) {
      return c.json({ error: "token (string) richiesto" }, 400);
    }
    const row = registerToken({
      token: body.token,
      platform: body.platform,
      label: body.label ?? null,
      familyMemberId: body.familyMemberId ?? null,
    });
    return c.json<PushRegisterResponse>({
      device: toDevice(row),
      apnsConfigured: isApnsConfigured(),
    });
  })

  .get("/devices", (c) => {
    return c.json<PushDevicesResponse>({
      devices: listTokens().map(toDevice),
      apnsConfigured: isApnsConfigured(),
    });
  })

  .delete("/devices/:id", (c) => {
    const ok = removeTokenById(c.req.param("id"));
    if (!ok) return c.json({ error: "device non trovato" }, 404);
    return c.json({ ok: true });
  })

  /** Send a test notification — handy for verifying APNs setup without
   *  having to actually open a door. Body: { token? } (broadcast if
   *  omitted). */
  .post("/test", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as PushTestInput;
    if (!isApnsConfigured()) {
      return c.json(
        {
          error:
            "APNs non configurato sul backend (servono APNS_KEY_BASE64, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID)",
        },
        503,
      );
    }
    const tokens = body.token ? [body.token] : listTokens("ios").map((t) => t.token);
    if (tokens.length === 0) {
      return c.json({ error: "nessun device registrato" }, 400);
    }
    const results = await sendApnsBatch(tokens, {
      title: "Home Panel",
      body: "Notifica di prova",
      sound: "default",
      timeSensitive: false,
      data: { kind: "test" },
    });
    /* APNs returns 410 when a token is no longer valid (app uninstalled,
     * token rotated). Prune those right away. */
    for (const r of results) {
      if (r.status === 410) removeTokenByValue(r.token);
    }
    return c.json({ results });
  });
