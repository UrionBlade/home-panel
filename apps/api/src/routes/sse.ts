import { EventEmitter } from "node:events";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export const sseEmitter = new EventEmitter();

export const sseRouter = new Hono().get("/", (c) => {
  return streamSSE(c, async (stream) => {
    const onEvent = async (data: { event: string; payload: unknown }) => {
      await stream.writeSSE({
        event: data.event,
        data: JSON.stringify(data.payload),
        id: String(Date.now()),
      });
    };
    sseEmitter.on("push", onEvent);

    // Heartbeat
    const heartbeat = setInterval(async () => {
      try {
        await stream.writeSSE({ event: "heartbeat", data: "ping" });
      } catch {
        /* client chiuso */
      }
    }, 30_000);

    stream.onAbort(() => {
      sseEmitter.off("push", onEvent);
      clearInterval(heartbeat);
    });

    // Mantieni la connessione aperta
    while (true) {
      await new Promise((r) => setTimeout(r, 60_000));
    }
  });
});
