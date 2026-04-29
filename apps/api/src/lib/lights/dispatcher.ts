/**
 * Provider-agnostic light dispatcher.
 *
 * Routes high-level operations (setState, listRemote) to the correct backend
 * based on the `provider` column. Keeps `routes/lights.ts` free of vendor
 * conditionals so new providers plug in here without touching HTTP code.
 */

import type { LightProvider, RemoteLightDevice } from "@home-panel/shared";
import {
  EwelinkError,
  ewelinkListDevices,
  ewelinkSetSwitch,
  extractThingState,
} from "./providers/ewelink.js";

export interface LightProviderAdapter {
  /** Apply an on/off state to a device on this provider. */
  setState(deviceId: string, state: "on" | "off"): Promise<void>;
  /** List every device the provider knows about, not yet filtered by adoption. */
  listRemote(): Promise<Omit<RemoteLightDevice, "adopted">[]>;
}

const EWELINK: LightProviderAdapter = {
  async setState(deviceId, state) {
    await ewelinkSetSwitch(deviceId, state);
  },
  async listRemote() {
    const things = await ewelinkListDevices();
    return things
      .filter((t) => {
        /* Only surface devices that look like on/off switches. eWeLink
         * includes sensors, RF bridges, etc. in the same list. */
        const p = t.itemData.params;
        return p?.switch !== undefined || (p?.switches && p.switches.length > 0);
      })
      .map((t) => ({
        provider: "ewelink" as const,
        deviceId: t.itemData.deviceid,
        name: t.itemData.name,
        online: t.itemData.online,
        state: extractThingState(t),
      }));
  },
};

/* DIRIGERA stub — replaced by the real adapter once
 * `apps/api/src/lib/dirigera/` is wired up (see openspec change
 * add-dirigera-hub §6). The placeholder throws on use so a misconfigured
 * environment fails loudly rather than silently routing eWeLink calls
 * to the wrong handler. */
const DIRIGERA_PLACEHOLDER: LightProviderAdapter = {
  async setState() {
    throw new Error("DIRIGERA provider not yet initialized");
  },
  async listRemote() {
    return [];
  },
};

const ADAPTERS: Record<LightProvider, LightProviderAdapter> = {
  ewelink: EWELINK,
  dirigera: DIRIGERA_PLACEHOLDER,
};

export function getAdapter(provider: LightProvider): LightProviderAdapter {
  return ADAPTERS[provider];
}

export function isKnownProvider(value: string): value is LightProvider {
  return value in ADAPTERS;
}

/** Normalized error shape the routes layer turns into HTTP responses. */
export interface LightOpError {
  status: 400 | 401 | 404 | 502;
  body: { error: string };
}

/** Map a dispatcher error into an HTTP-friendly envelope. */
export function mapProviderError(err: unknown): LightOpError {
  if (err instanceof EwelinkError) {
    if (err.code === -2) {
      return { status: 400, body: { error: "eWeLink app credentials missing in env" } };
    }
    if (err.code === -3) {
      return { status: 400, body: { error: "eWeLink account not configured" } };
    }
    if (err.code === 401 || err.code === 402 || err.code === 406) {
      return { status: 401, body: { error: "eWeLink authentication failed" } };
    }
    if (err.code === 4002) {
      return { status: 502, body: { error: "Device offline or unreachable" } };
    }
    return { status: 502, body: { error: `eWeLink error ${err.code}: ${err.message}` } };
  }
  console.error("[lights] upstream error:", err);
  return { status: 502, body: { error: "Upstream provider unreachable" } };
}
