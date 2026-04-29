import {
  ALARM_SSE_EVENTS,
  type AlarmArmInput,
  type AlarmStateResponse,
  type DisarmCodeStatus,
  type SetDisarmCodeInput,
  type SilenceAlarmInput,
} from "@home-panel/shared";
import { Hono } from "hono";
import {
  acknowledgeAll,
  acknowledgeEvent,
  countUnread,
  DISARM_CODE_PATTERN,
  getAlarmState,
  getDisarmCodeLength,
  isDisarmCodeConfigured,
  isDisarmResetEnabled,
  listEvents,
  recordEvent,
  setArmed,
  storeDisarmCode,
  verifyDisarmCode,
} from "../lib/alarm/store.js";
import { getSirenDurationSeconds, silenceSirens, triggerSirens } from "../lib/zigbee/client.js";
import { armAll as armAllZigbeeDevices } from "../lib/zigbee/store.js";
import { sseEmitter } from "./sse.js";

function pushState() {
  sseEmitter.emit("push", {
    event: ALARM_SSE_EVENTS.state,
    payload: { state: getAlarmState(), unreadCount: countUnread() },
  });
}

export const alarmRouter = new Hono()

  .get("/state", (c) => {
    return c.json<AlarmStateResponse>({
      state: getAlarmState(),
      events: listEvents(20),
      unreadCount: countUnread(),
    });
  })

  .post("/arm", async (c) => {
    const body = (await c.req.json().catch(() => null)) as AlarmArmInput | null;
    /* Arming the system also re-includes every Zigbee device in the
     * alarm. Without this the per-device `armed` flag (intended as a
     * "mute one specific window" escape hatch) silently sabotaged
     * every routine that just calls /arm — sensors with `armed=0`
     * would never fire even though the user thought the system was
     * fully armed. The flag is still honoured for selective opt-out
     * AFTER arming, but the natural "arm everything" intent now Just
     * Works without an extra step. */
    armAllZigbeeDevices();
    const state = setArmed(true, body?.mode);
    pushState();
    return c.json({ state });
  })

  .post("/disarm", (c) => {
    const state = setArmed(false);
    silenceSirens();
    pushState();
    return c.json({ state });
  })

  .get("/events", (c) => {
    const limitParam = c.req.query("limit");
    const limit = Math.max(1, Math.min(200, Number(limitParam) || 50));
    return c.json(listEvents(limit));
  })

  .post("/events/:id/ack", (c) => {
    const event = acknowledgeEvent(c.req.param("id"));
    if (!event) return c.json({ error: "evento non trovato" }, 404);
    sseEmitter.emit("push", {
      event: ALARM_SSE_EVENTS.acknowledged,
      payload: event,
    });
    pushState();
    return c.json(event);
  })

  .post("/events/ack-all", (c) => {
    const updated = acknowledgeAll();
    pushState();
    return c.json({ updated });
  })

  /* ---------------------------------------------------------------- */
  /*  Disarm code                                                      */
  /* ---------------------------------------------------------------- */

  .get("/disarm-code/status", (c) => {
    return c.json<DisarmCodeStatus>({
      configured: isDisarmCodeConfigured(),
      resetEnabled: isDisarmResetEnabled(),
      length: getDisarmCodeLength(),
    });
  })

  .post("/disarm-code", async (c) => {
    const body = (await c.req.json().catch(() => null)) as SetDisarmCodeInput | null;
    if (!body || typeof body.newCode !== "string") {
      return c.json({ error: "Codice mancante" }, 400);
    }
    if (!DISARM_CODE_PATTERN.test(body.newCode)) {
      return c.json({ error: "Il codice deve essere composto da 4-8 cifre." }, 400);
    }

    const configured = isDisarmCodeConfigured();
    const allowReset = isDisarmResetEnabled();

    /* Old code is required only when a code already exists AND the
     * reset env override is not active. First-time setup and the reset
     * path both bypass it so a forgotten code doesn't lock the user
     * out of their own panel. */
    if (configured && !allowReset) {
      if (typeof body.oldCode !== "string" || !verifyDisarmCode(body.oldCode)) {
        return c.json({ error: "Codice attuale non valido" }, 401);
      }
    }

    try {
      storeDisarmCode(body.newCode);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "errore sconosciuto" }, 400);
    }
    return c.json({ ok: true });
  })

  /* ---------------------------------------------------------------- */
  /*  Silence (disarm + stop sirens, gated by the numeric code)         */
  /* ---------------------------------------------------------------- */

  .post("/silence", async (c) => {
    const body = (await c.req.json().catch(() => null)) as SilenceAlarmInput | null;
    if (!body || typeof body.code !== "string") {
      return c.json({ error: "Codice mancante" }, 400);
    }
    if (!isDisarmCodeConfigured()) {
      return c.json({ error: "Codice di disarmo non configurato" }, 409);
    }
    if (!verifyDisarmCode(body.code)) {
      return c.json({ error: "Codice errato" }, 401);
    }
    const state = setArmed(false);
    const acknowledged = acknowledgeAll();
    const { silenced } = silenceSirens();
    sseEmitter.emit("push", {
      event: ALARM_SSE_EVENTS.silenced,
      payload: { silenced, acknowledged },
    });
    pushState();
    return c.json({ state, silenced, acknowledged });
  })

  /* ---------------------------------------------------------------- */
  /*  Test trigger — same code path as a real sensor opening so the
  /*  end-to-end flow (record event + push + siren) is exercised.      */
  /* ---------------------------------------------------------------- */

  .post("/test", (c) => {
    /* Force the system armed for the duration of the test even if the
     * user hasn't armed it — otherwise the trigger would be a no-op
     * and they'd think nothing works. We do NOT touch the previous
     * armedAt so a "real" arm that pre-existed survives a test press. */
    const previousArmed = getAlarmState().armed;
    if (!previousArmed) {
      setArmed(true);
    }
    const event = recordEvent({
      ieeeAddress: "test",
      friendlyName: "Test allarme",
      kind: "manual",
      payload: { source: "panel-test" },
    });
    sseEmitter.emit("push", { event: ALARM_SSE_EVENTS.triggered, payload: event });
    pushState();
    const { fired } = triggerSirens(getSirenDurationSeconds());
    return c.json({ event, fired });
  });
