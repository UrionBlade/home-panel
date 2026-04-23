/**
 * Real-time AC state subscriber.
 *
 * Brillion exposes a pseudo-MQTT-over-WebSocket channel that pushes
 * ERD updates the instant the appliance reports them — including
 * changes made from the physical remote. Polling `/v1/appliance/../erd`
 * on a timer is both wasteful and laggy; this subscriber replaces it
 * with push notifications and fans them out to the UI via SSE.
 *
 * Flow:
 *   1. Authenticated GET `/v1/websocket` returns `{ endpoint: wss://... }`.
 *   2. Open the WSS, subscribe to `/appliance/* /erd/*`.
 *   3. On `publish#erd` or `appliance#erdList`, merge into an in-memory
 *      ERD bag per appliance, re-decode an `AcState`, persist, and
 *      broadcast an `ac:update` SSE event.
 *   4. 30s keepalive pings, exponential-backoff reconnect on close.
 *
 * The subscriber is best-effort: if the socket dies the periodic
 * poller (scheduler.ts) still converges within minutes, so a broken
 * push path degrades to "slightly laggy" rather than "broken".
 */

import { sseEmitter } from "../../routes/sse.js";
import { decodeAcState, type ErdBag } from "./ac-erd.js";
import { type GeTokenStore, geFetchJson } from "./client.js";
import { GE_BRILLION_API_URL } from "./const.js";
import { listAcDevices, saveAcState } from "./device-repo.js";

interface WsCredentials {
  endpoint: string;
  kind?: string;
}

/** Per-appliance cached ERD bag so partial `publish#erd` updates can
 * be merged on top of whatever we already know instead of replacing
 * the whole state with a single field. Keyed by the device row id
 * (= macAddress). */
const erdBagByMac = new Map<string, ErdBag>();

let socket: WebSocket | null = null;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let stopped = false;

export function startAcWsSubscriber(store: GeTokenStore): void {
  stopped = false;
  void scheduleConnect(store, 3_000);
}

export function stopAcWsSubscriber(): void {
  stopped = true;
  teardown();
}

function teardown(): void {
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

function scheduleConnect(store: GeTokenStore, delayMs: number): void {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(store).catch((err) => {
      console.warn("[ac-ws] connect failed:", err instanceof Error ? err.message : err);
      scheduleBackoffReconnect(store);
    });
  }, delayMs);
}

function scheduleBackoffReconnect(store: GeTokenStore): void {
  if (stopped) return;
  const delay = Math.min(60_000, 2_000 * 2 ** Math.min(reconnectAttempt, 5));
  reconnectAttempt += 1;
  scheduleConnect(store, delay);
}

async function connect(store: GeTokenStore): Promise<void> {
  if (stopped) return;
  if (!store.loadTokens()) {
    // No GE link yet — poll softly until the user connects. Once tokens
    // appear the /devices route will kick this subscriber back up via
    // the normal boot path, but we still retry here to cover the case
    // where the user links GE without bouncing the API.
    scheduleConnect(store, 30_000);
    return;
  }

  const creds = await geFetchJson<WsCredentials>(store, "/v1/websocket", {}, GE_BRILLION_API_URL);
  if (!creds.endpoint) {
    throw new Error("missing endpoint in /v1/websocket response");
  }

  const ws = new WebSocket(creds.endpoint);
  socket = ws;

  ws.addEventListener("open", () => {
    reconnectAttempt = 0;
    console.log("[ac-ws] connected");
    try {
      ws.send(
        JSON.stringify({
          kind: "websocket#subscribe",
          action: "subscribe",
          resources: ["/appliance/*/erd/*"],
        }),
      );
    } catch (err) {
      console.warn("[ac-ws] subscribe send failed:", err);
    }

    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(JSON.stringify({ kind: "websocket#ping" }));
      } catch {
        /* next close event will trigger reconnect */
      }
    }, 30_000);
  });

  ws.addEventListener("message", (ev) => {
    const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    handleMessage(parsed);
  });

  ws.addEventListener("close", (ev) => {
    console.warn(`[ac-ws] closed (code=${ev.code} reason=${ev.reason ?? ""})`);
    if (socket === ws) socket = null;
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    scheduleBackoffReconnect(store);
  });

  ws.addEventListener("error", () => {
    // The close handler will run too — don't schedule a reconnect here
    // to avoid doubling up.
  });
}

function handleMessage(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const m = msg as Record<string, unknown>;

  if (m.kind === "publish#erd" && m.item && typeof m.item === "object") {
    const item = m.item as Record<string, unknown>;
    const mac = typeof item.applianceId === "string" ? item.applianceId.toUpperCase() : null;
    const erd = typeof item.erd === "string" ? item.erd : null;
    const value = typeof item.value === "string" ? item.value : null;
    if (mac && erd && value !== null) {
      applyErdUpdate(mac, { [erd]: value });
    }
    return;
  }

  if (m.kind === "websocket#api" && m.body && typeof m.body === "object") {
    const body = m.body as Record<string, unknown>;
    if (body.kind === "appliance#erdList" && Array.isArray(body.items)) {
      const mac = typeof body.applianceId === "string" ? body.applianceId.toUpperCase() : null;
      if (mac) {
        const bag: ErdBag = {};
        for (const raw of body.items) {
          if (!raw || typeof raw !== "object") continue;
          const item = raw as { erd?: unknown; value?: unknown };
          if (typeof item.erd === "string" && typeof item.value === "string") {
            bag[item.erd] = item.value;
          }
        }
        applyErdUpdate(mac, bag);
      }
    }
  }
}

function applyErdUpdate(mac: string, updates: ErdBag): void {
  /* Only touch devices we know about so we don't spam SSE for
   * unrelated appliances on the same account (dishwasher, fridge…). */
  const devices = listAcDevices();
  const match = devices.find((d) => d.id.toUpperCase() === mac);
  if (!match) return;

  const current = erdBagByMac.get(match.id) ?? {};
  const next: ErdBag = { ...current, ...updates };
  erdBagByMac.set(match.id, next);

  const state = decodeAcState(next);
  saveAcState(match.id, state);

  sseEmitter.emit("push", {
    event: "ac:update",
    payload: { id: match.id, state },
  });
}
