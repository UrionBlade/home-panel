import type {
  ZigbeeAssignRoomInput,
  ZigbeePermitJoinInput,
  ZigbeePermitJoinResponse,
  ZigbeeRenameInput,
  ZigbeeStateResponse,
} from "@home-panel/shared";
import { Hono } from "hono";
import {
  closePermitJoin,
  getBridgeState,
  permitJoin,
  removeZigbeeDevice,
  renameDevice,
} from "../lib/zigbee/client.js";
import { getDevice, listDevices, setRoom } from "../lib/zigbee/store.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "errore sconosciuto";
}

export const zigbeeRouter = new Hono()

  /** Bridge connection state + paired devices. */
  .get("/state", (c) =>
    c.json<ZigbeeStateResponse>({
      bridge: getBridgeState(),
      devices: listDevices(),
    }),
  )

  .get("/devices", (c) => c.json(listDevices()))

  /** Open the pairing window. Body: { durationSeconds }. */
  .post("/permit-join", async (c) => {
    const body = (await c.req.json().catch(() => null)) as ZigbeePermitJoinInput | null;
    const seconds = Number(body?.durationSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return c.json({ error: "durationSeconds (1-254) richiesto" }, 400);
    }
    try {
      const until = await permitJoin(seconds);
      return c.json<ZigbeePermitJoinResponse>({ until });
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 502);
    }
  })

  /** Close the pairing window early. */
  .delete("/permit-join", async (c) => {
    try {
      await closePermitJoin();
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 502);
    }
  })

  /** Rename a paired device. Z2M's `device/rename` updates the friendly
   *  name on the bridge — we wait for the next `bridge/devices` push to
   *  pick the new name up in the DB. */
  .patch("/devices/:id/name", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as ZigbeeRenameInput | null;
    const friendlyName = body?.friendlyName?.trim();
    if (!friendlyName) {
      return c.json({ error: "friendlyName richiesto" }, 400);
    }
    try {
      await renameDevice(id, friendlyName);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 502);
    }
  })

  /** Set or clear the room assignment on a device — local-only,
   *  doesn't touch Z2M. */
  .patch("/devices/:id/room", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => null)) as ZigbeeAssignRoomInput | null;
    if (!body || !("roomId" in body)) {
      return c.json({ error: "roomId richiesto (string | null)" }, 400);
    }
    const roomId = body.roomId ? String(body.roomId).trim() || null : null;
    const updated = setRoom(id, roomId);
    if (!updated) return c.json({ error: "device non trovato" }, 404);
    return c.json(updated);
  })

  .get("/devices/:id", (c) => {
    const dev = getDevice(c.req.param("id"));
    if (!dev) return c.json({ error: "device non trovato" }, 404);
    return c.json(dev);
  })

  /** Remove the device from the mesh. The bridge will follow up with a
   *  `bridge/devices` push that drops the row locally as well. */
  .delete("/devices/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await removeZigbeeDevice(id);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: errorMessage(err) }, 502);
    }
  });
