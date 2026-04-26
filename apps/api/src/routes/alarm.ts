import { ALARM_SSE_EVENTS, type AlarmArmInput, type AlarmStateResponse } from "@home-panel/shared";
import { Hono } from "hono";
import {
  acknowledgeAll,
  acknowledgeEvent,
  countUnread,
  getAlarmState,
  listEvents,
  setArmed,
} from "../lib/alarm/store.js";
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
    const state = setArmed(true, body?.mode);
    pushState();
    return c.json({ state });
  })

  .post("/disarm", (c) => {
    const state = setArmed(false);
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
  });
