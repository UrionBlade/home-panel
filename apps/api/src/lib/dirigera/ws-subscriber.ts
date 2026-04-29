/**
 * DIRIGERA WebSocket subscriber.
 *
 * The hub multiplexes deviceStateChanged / deviceAdded / deviceRemoved
 * frames over a single wss:// channel that uses the same self-signed
 * cert as the REST API. We use the `ws` package because Node's native
 * global WebSocket constructor cannot accept per-connection TLS options
 * (no `rejectUnauthorized: false`).
 *
 * Reconnect strategy: exponential backoff 1s → 2s → 4s → 8s → 16s →
 * 30s capped. Every successful open resets the attempt counter. A 30s
 * keepalive ping is sent so the hub doesn't time out idle sockets.
 *
 * Frames are normalised into `dirigeraEventBus` events that the device
 * repository consumes.
 */

import { EventEmitter } from "node:events";
import type { DirigeraDevice, DirigeraWsMessage } from "@home-panel/shared";
import WebSocket from "ws";
import { getHost, getTlsAgent, isConfigured } from "./client.js";

/** Internal event bus — `device-repo.ts` listens to these to apply
 * deltas, persist, and emit user-facing SSE events. */
export const dirigeraEventBus = new EventEmitter();

export interface DirigeraStateChangeEvent {
  kind: "state-changed" | "added";
  device: DirigeraDevice;
}

export interface DirigeraRemovedEvent {
  kind: "removed";
  deviceId: string;
}

let socket: WebSocket | null = null;
let stopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempt = 0;
let connected = false;

/* Backoff schedule capped at 30s — the spec requires this exact ladder. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;

export function isDirigeraWsConnected(): boolean {
  return connected;
}

export function startDirigeraSubscriber(): void {
  stopped = false;
  if (!isConfigured()) {
    console.log("[dirigera-ws] not configured, skipping");
    return;
  }
  scheduleConnect(0);
}

export function stopDirigeraSubscriber(): void {
  stopped = true;
  teardown();
}

function teardown(): void {
  connected = false;
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
    socket = null;
  }
}

function scheduleConnect(delayMs: number): void {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    try {
      connect();
    } catch (err) {
      console.warn("[dirigera-ws] connect threw:", err instanceof Error ? err.message : err);
      scheduleBackoff();
    }
  }, delayMs);
}

function scheduleBackoff(): void {
  if (stopped) return;
  const delay = BACKOFF_MS[Math.min(reconnectAttempt, BACKOFF_MS.length - 1)] ?? 30_000;
  reconnectAttempt += 1;
  scheduleConnect(delay);
}

function connect(): void {
  if (stopped) return;
  const host = getHost();
  if (!host) {
    /* Token revoked / env removed mid-flight: stop trying. */
    console.log("[dirigera-ws] config disappeared, stopping");
    return;
  }

  const token = process.env.DIRIGERA_TOKEN ?? "";
  const url = `wss://${host}:8443/v1`;
  const ws = new WebSocket(url, {
    headers: { Authorization: `Bearer ${token}` },
    agent: getTlsAgent(),
  });
  socket = ws;

  ws.on("open", () => {
    reconnectAttempt = 0;
    connected = true;
    console.log("[dirigera-ws] connected");
    dirigeraEventBus.emit("connected");

    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.ping();
      } catch {
        /* the next 'close' will trigger reconnect */
      }
    }, 30_000);
  });

  ws.on("message", (data: WebSocket.RawData) => {
    const raw = typeof data === "string" ? data : data.toString("utf8");
    if (!raw) return;
    try {
      const msg = JSON.parse(raw) as DirigeraWsMessage;
      dispatchMessage(msg);
    } catch (err) {
      console.warn("[dirigera-ws] malformed frame:", err instanceof Error ? err.message : err);
    }
  });

  ws.on("error", (err) => {
    console.warn("[dirigera-ws] error:", err.message);
  });

  ws.on("close", (code, reason) => {
    connected = false;
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    socket = null;
    if (stopped) return;
    console.log(
      `[dirigera-ws] closed code=${code} reason=${reason.toString() || "n/a"}, reconnecting`,
    );
    dirigeraEventBus.emit("disconnected");
    scheduleBackoff();
  });
}

/** Translate a raw hub frame into a typed bus event. */
function dispatchMessage(msg: DirigeraWsMessage): void {
  switch (msg.type) {
    case "deviceStateChanged":
      dirigeraEventBus.emit("device", {
        kind: "state-changed",
        device: msg.data,
      } satisfies DirigeraStateChangeEvent);
      return;
    case "deviceAdded":
      dirigeraEventBus.emit("device", {
        kind: "added",
        device: msg.data,
      } satisfies DirigeraStateChangeEvent);
      return;
    case "deviceRemoved":
      dirigeraEventBus.emit("device-removed", {
        kind: "removed",
        deviceId: msg.data.id,
      } satisfies DirigeraRemovedEvent);
      return;
  }
}
