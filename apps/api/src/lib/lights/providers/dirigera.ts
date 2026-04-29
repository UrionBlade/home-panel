/**
 * DIRIGERA light provider — adapts the hub REST API to the
 * `LightProviderAdapter` contract that `dispatcher.ts` consumes.
 *
 * On/off + brightness are the only operations we expose today;
 * KAJPLATS is a tunable-white bulb but the Home Panel doesn't surface
 * colour temperature yet. When that lands, extend `setState` to accept
 * a `level`/`mireds` argument and patch `lightLevel`/`colorTemperature`
 * accordingly.
 */

import type { RemoteLightDevice } from "@home-panel/shared";
import {
  DirigeraError,
  isConfigured as dirigeraIsConfigured,
  listDevices,
  patchDevice,
} from "../../dirigera/client.js";
import type { LightProviderAdapter } from "../dispatcher.js";

/** Concrete adapter wired into the dispatcher when DIRIGERA env vars
 * are present. The dispatcher falls back to the placeholder otherwise
 * (see `dispatcher.ts`). */
export const dirigeraAdapter: LightProviderAdapter = {
  async setState(deviceId, state) {
    try {
      await patchDevice(deviceId, { isOn: state === "on" });
    } catch (err) {
      throw normaliseError(err);
    }
  },

  async listRemote() {
    if (!dirigeraIsConfigured()) return [];
    let devices: Awaited<ReturnType<typeof listDevices>>;
    try {
      devices = await listDevices();
    } catch (err) {
      throw normaliseError(err);
    }
    const out: Omit<RemoteLightDevice, "adopted">[] = [];
    for (const d of devices) {
      if (d.deviceType !== "light") continue;
      const attrs = d.attributes;
      const isOn = typeof attrs.isOn === "boolean" ? attrs.isOn : null;
      out.push({
        provider: "dirigera",
        deviceId: d.id,
        name: d.customName?.trim() || attrs.customName?.trim() || attrs.model || "Lampada",
        online: d.isReachable,
        state: isOn === null ? "unknown" : isOn ? "on" : "off",
      });
    }
    return out;
  },
};

/** Translate hub errors into the small set the routes layer maps onto
 * HTTP status codes. We reuse `DirigeraError` so the dispatcher can
 * recognise the source and route to a sensible HTTP response. */
function normaliseError(err: unknown): Error {
  if (err instanceof DirigeraError) {
    /* DIRIGERA returns 502 when it can't talk to a Thread device; we
     * surface that as a tagged error the dispatcher converts to HTTP
     * 503 with code DEVICE_OFFLINE. */
    return err;
  }
  return err instanceof Error ? err : new Error(String(err));
}
