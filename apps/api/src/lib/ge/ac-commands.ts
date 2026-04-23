/**
 * Read / write AC state against the Brillion v1 ERD endpoints.
 *
 * The Brillion API is the only GE endpoint that exposes per-ERD
 * GET / POST. The newer client.mysmarthq.com endpoint only offers
 * device discovery (`/v2/device`), which is why this module uses a
 * different base URL than the discovery code in routes/ac.ts.
 *
 * All functions are cheap to call repeatedly: the caller (scheduler
 * or route handler) is responsible for rate-limiting — we just issue
 * the HTTP call.
 */

import type { AcCommandInput, AcState } from "@home-panel/shared";
import {
  acErdCodec,
  decodeAcState,
  ERD_AC_FAN_SETTING,
  ERD_AC_OPERATION_MODE,
  ERD_AC_POWER_STATUS,
  ERD_AC_TARGET_TEMPERATURE,
  ERD_SAC_AUTO_SWING_MODE,
  type ErdBag,
} from "./ac-erd.js";
import { type GeTokenStore, geFetch, geFetchJson } from "./client.js";
import { GE_BRILLION_API_URL } from "./const.js";

/** Shape returned by GET /v1/appliance/{jid}/erd. */
interface ErdListResponse {
  items?: Array<{ erd: string; value: string }>;
  // Some backends return a flat map instead — we handle both.
  [key: string]: unknown;
}

/** Fetch the full ERD bag for a device and decode it into an AcState. */
export async function readAcState(store: GeTokenStore, jid: string): Promise<AcState> {
  const resp = await geFetchJson<ErdListResponse>(
    store,
    `/v1/appliance/${encodeURIComponent(jid)}/erd`,
    {},
    GE_BRILLION_API_URL,
  );

  const bag: ErdBag = {};
  if (Array.isArray(resp.items)) {
    for (const item of resp.items) {
      if (typeof item.erd === "string" && typeof item.value === "string") {
        bag[item.erd] = item.value;
      }
    }
  } else {
    // Flat shape fallback: keys look like "0x7a01".
    for (const [k, v] of Object.entries(resp)) {
      if (typeof v === "string" && /^0x[0-9a-f]+$/i.test(k)) {
        bag[k] = v;
      }
    }
  }
  return decodeAcState(bag);
}

/** Post a single ERD write. `valueHex` must be upper-case hex without
 * leading "0x". */
async function writeErd(
  store: GeTokenStore,
  jid: string,
  erdCode: string,
  valueHex: string,
): Promise<void> {
  const resp = await geFetch(
    store,
    `/v1/appliance/${encodeURIComponent(jid)}/erd/${erdCode}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "appliance#erdListEntry",
        erd: erdCode,
        value: valueHex,
        ackTimeout: 10,
        delay: 0,
      }),
    },
    GE_BRILLION_API_URL,
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(
      `GE ERD write ${erdCode}=${valueHex} failed: ${resp.status} ${body.slice(0, 200)}`,
    );
  }
}

/** Apply a command to an AC device. Each specified field maps to one
 * ERD write; unspecified fields are left untouched. Writes happen
 * sequentially because the appliance can drop concurrent commands. */
export async function applyAcCommand(
  store: GeTokenStore,
  jid: string,
  input: AcCommandInput,
): Promise<void> {
  if (typeof input.power === "boolean") {
    await writeErd(store, jid, ERD_AC_POWER_STATUS, acErdCodec.encodePower(input.power));
  }
  if (input.mode !== undefined) {
    await writeErd(store, jid, ERD_AC_OPERATION_MODE, acErdCodec.encodeMode(input.mode));
  }
  if (typeof input.targetTemp === "number") {
    await writeErd(
      store,
      jid,
      ERD_AC_TARGET_TEMPERATURE,
      acErdCodec.encodeTargetTemperature(input.targetTemp),
    );
  }
  if (input.fanSpeed !== undefined) {
    await writeErd(store, jid, ERD_AC_FAN_SETTING, acErdCodec.encodeFan(input.fanSpeed));
  }
  if (input.swing !== undefined) {
    await writeErd(store, jid, ERD_SAC_AUTO_SWING_MODE, acErdCodec.encodeSwing(input.swing));
  }
}
