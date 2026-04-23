import type {
  TvAppLaunchInput,
  TvAppPreset,
  TvChannelInput,
  TvConfig,
  TvConfigUpdateInput,
  TvDeviceSummary,
  TvInputSelectInput,
  TvMuteInput,
  TvPlaybackInput,
  TvPowerInput,
  TvStatus,
  TvVolumeInput,
} from "@home-panel/shared";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { smartthingsConfig } from "../db/schema.js";
import {
  getSmartThingsConfig,
  isSmartThingsConfigured,
  SmartThingsHttpError,
  stListDevices,
} from "../lib/smartthings/client.js";
import {
  getCachedTvStatus,
  invalidateTvCache,
  sendChannelDown,
  sendChannelUp,
  sendLaunchApp,
  sendMute,
  sendPlayback,
  sendPower,
  sendSetInput,
  sendSetVolume,
  sendUnmute,
  sendVolumeDown,
  sendVolumeUp,
} from "../lib/smartthings/tv.js";
import { TV_APP_PRESETS } from "../lib/smartthings/tv-presets.js";

type TvContext = { deviceId: string };

/** Narrow an unknown JSON body into a record for validation. */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Resolve config + bound TV id, or emit a structured error for the route. */
function resolveContext():
  | { ok: true; ctx: TvContext }
  | { ok: false; error: { status: 400 | 404; body: { error: string } } } {
  const config = getSmartThingsConfig();
  if (!isSmartThingsConfigured()) {
    return { ok: false, error: { status: 400, body: { error: "SmartThings non configurato" } } };
  }
  if (!config?.tvDeviceId) {
    return { ok: false, error: { status: 404, body: { error: "TV non configurata" } } };
  }
  return { ok: true, ctx: { deviceId: config.tvDeviceId } };
}

/** Map upstream errors into HTTP responses the client can reason about. */
function mapUpstreamError(err: unknown): {
  status: 502;
  body: { error: string; retryable?: boolean };
} {
  if (err instanceof SmartThingsHttpError) {
    if (err.status === 401 || err.status === 403) {
      console.error("[tv] upstream auth error:", err.message);
      return { status: 502, body: { error: "Token SmartThings non valido o scaduto" } };
    }
    if (err.status >= 500) {
      console.error("[tv] upstream 5xx:", err.message);
      return {
        status: 502,
        body: { error: "SmartThings non raggiungibile", retryable: true },
      };
    }
  }
  console.error("[tv] upstream error:", err);
  return {
    status: 502,
    body: { error: "SmartThings non raggiungibile", retryable: true },
  };
}

/** A device is considered a TV if it exposes mediaInputSource + audioVolume
 *  or its name/deviceTypeName contains "TV". */
function looksLikeTv(d: {
  name: string;
  deviceTypeName?: string;
  components: Array<{ capabilities: Array<{ id: string }> }>;
}): boolean {
  if (d.deviceTypeName?.toLowerCase().includes("tv")) return true;
  if (d.name.toLowerCase().includes("tv")) return true;
  const caps = new Set(d.components.flatMap((c) => c.capabilities.map((k) => k.id)));
  return caps.has("mediaInputSource") && caps.has("audioVolume");
}

/* ------------------------------------------------------------------------ */
/*  Routes                                                                   */
/* ------------------------------------------------------------------------ */

export const tvRouter = new Hono()

  .get("/config", (c) => {
    const config = getSmartThingsConfig();
    const body: TvConfig = {
      smartThingsConfigured: isSmartThingsConfigured(),
      tvDeviceId: config?.tvDeviceId ?? null,
      tvRoomId: config?.tvRoomId ?? null,
    };
    return c.json(body);
  })

  .get("/devices", async (c) => {
    if (!isSmartThingsConfigured()) {
      return c.json({ error: "SmartThings non configurato" }, 400);
    }
    try {
      const items = await stListDevices();
      const devices: TvDeviceSummary[] = items.filter(looksLikeTv).map((d) => ({
        deviceId: d.deviceId,
        label: d.label || d.name,
        name: d.name,
        manufacturer: d.manufacturerName ?? null,
      }));
      return c.json(devices);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .patch("/config", async (c) => {
    if (!isSmartThingsConfigured()) {
      return c.json({ error: "SmartThings non configurato" }, 400);
    }
    const body = (await c.req.json().catch(() => null)) as TvConfigUpdateInput | null;
    if (!body) {
      return c.json({ error: "Body JSON obbligatorio" }, 400);
    }
    if (
      body.tvDeviceId !== undefined &&
      body.tvDeviceId !== null &&
      typeof body.tvDeviceId !== "string"
    ) {
      return c.json({ error: "tvDeviceId deve essere string | null" }, 400);
    }

    /* Validate the requested id belongs to a TV-shaped device. */
    if (body.tvDeviceId) {
      try {
        const items = await stListDevices();
        const match = items.find((d) => d.deviceId === body.tvDeviceId);
        if (!match || !looksLikeTv(match)) {
          return c.json({ error: "Device non trovato o non è una TV" }, 400);
        }
      } catch (err) {
        const mapped = mapUpstreamError(err);
        return c.json(mapped.body, mapped.status);
      }
    }

    const updates: Record<string, string | null> = {
      updatedAt: new Date().toISOString(),
    };
    if (body.tvDeviceId !== undefined) updates.tvDeviceId = body.tvDeviceId;
    if (body.tvRoomId !== undefined) {
      updates.tvRoomId = body.tvRoomId ? body.tvRoomId.trim() || null : null;
    }

    const existing = db.select().from(smartthingsConfig).get();
    if (existing) {
      db.update(smartthingsConfig).set(updates).run();
    } else {
      db.insert(smartthingsConfig).values(updates).run();
    }
    invalidateTvCache();
    return c.json({ ok: true, ...updates });
  })

  .get("/status", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    try {
      const status: TvStatus = await getCachedTvStatus(resolved.ctx.deviceId);
      return c.json(status);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/refresh", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    try {
      const status: TvStatus = await getCachedTvStatus(resolved.ctx.deviceId, true);
      return c.json(status);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/power", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = (await c.req.json().catch(() => null)) as TvPowerInput | null;
    if (!body || typeof body.on !== "boolean") {
      return c.json({ error: "on è richiesto (boolean)" }, 400);
    }
    try {
      await sendPower(resolved.ctx.deviceId, body.on);
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/volume", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = asRecord(await c.req.json().catch(() => null)) as TvVolumeInput | null;
    const hasLevel = body?.level !== undefined;
    const hasDelta = body?.delta !== undefined;
    if (hasLevel === hasDelta) {
      return c.json({ error: "specificare esattamente uno tra level e delta" }, 400);
    }
    try {
      if (hasLevel) {
        const level = body?.level;
        if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 100) {
          return c.json({ error: "level deve essere intero tra 0 e 100" }, 400);
        }
        await sendSetVolume(resolved.ctx.deviceId, level);
      } else {
        const delta = body?.delta;
        if (delta !== "up" && delta !== "down") {
          return c.json({ error: "delta deve essere 'up' o 'down'" }, 400);
        }
        if (delta === "up") await sendVolumeUp(resolved.ctx.deviceId);
        else await sendVolumeDown(resolved.ctx.deviceId);
      }
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/mute", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = (await c.req.json().catch(() => null)) as TvMuteInput | null;
    if (!body || (typeof body.muted !== "boolean" && body.muted !== "toggle")) {
      return c.json({ error: "muted deve essere boolean o 'toggle'" }, 400);
    }
    try {
      let shouldMute: boolean;
      if (body.muted === "toggle") {
        const current = await getCachedTvStatus(resolved.ctx.deviceId);
        shouldMute = !current.muted;
      } else {
        shouldMute = body.muted;
      }
      if (shouldMute) await sendMute(resolved.ctx.deviceId);
      else await sendUnmute(resolved.ctx.deviceId);
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true, muted: shouldMute }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/input", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = (await c.req.json().catch(() => null)) as TvInputSelectInput | null;
    if (!body || typeof body.source !== "string" || body.source.length === 0) {
      return c.json({ error: "source è richiesto (string)" }, 400);
    }
    try {
      const current = await getCachedTvStatus(resolved.ctx.deviceId);
      if (!current.supportedInputs.includes(body.source)) {
        return c.json(
          {
            error: "Input non supportato da questa TV",
            supported: current.supportedInputs,
          },
          400,
        );
      }
      await sendSetInput(resolved.ctx.deviceId, body.source);
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/app", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = (await c.req.json().catch(() => null)) as TvAppLaunchInput | null;
    if (!body || typeof body.appId !== "string" || body.appId.trim().length === 0) {
      return c.json({ error: "appId è richiesto" }, 400);
    }
    try {
      await sendLaunchApp(resolved.ctx.deviceId, body.appId.trim());
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/channel", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = (await c.req.json().catch(() => null)) as TvChannelInput | null;
    if (!body || (body.delta !== "up" && body.delta !== "down")) {
      return c.json({ error: "delta deve essere 'up' o 'down'" }, 400);
    }
    try {
      if (body.delta === "up") await sendChannelUp(resolved.ctx.deviceId);
      else await sendChannelDown(resolved.ctx.deviceId);
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .post("/playback", async (c) => {
    const resolved = resolveContext();
    if (!resolved.ok) return c.json(resolved.error.body, resolved.error.status);
    const body = (await c.req.json().catch(() => null)) as TvPlaybackInput | null;
    if (!body || typeof body.command !== "string") {
      return c.json({ error: "command è richiesto" }, 400);
    }
    try {
      const current = await getCachedTvStatus(resolved.ctx.deviceId);
      if (
        current.supportedPlaybackCommands.length > 0 &&
        !current.supportedPlaybackCommands.includes(body.command)
      ) {
        return c.json(
          {
            error: `Comando '${body.command}' non supportato`,
            supported: current.supportedPlaybackCommands,
          },
          400,
        );
      }
      await sendPlayback(resolved.ctx.deviceId, body.command);
      invalidateTvCache(resolved.ctx.deviceId);
      return c.json({ ok: true }, 202);
    } catch (err) {
      const mapped = mapUpstreamError(err);
      return c.json(mapped.body, mapped.status);
    }
  })

  .get("/apps/presets", (c) => {
    const presets: TvAppPreset[] = [...TV_APP_PRESETS];
    return c.json(presets);
  });
