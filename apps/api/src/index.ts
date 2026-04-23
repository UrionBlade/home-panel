import { API_VERSION, type HealthResponse } from "@home-panel/shared";
import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db/client.js";
import { seedBesozzo2026 } from "./db/seed-besozzo-2026.js";
import { seedBesozzoLocation } from "./db/seed-besozzo-location.js";
import { seedEventCategories } from "./db/seed-event-categories.js";
import { seedKioskSettings } from "./db/seed-kiosk-settings.js";
import { seedProductCatalog } from "./db/seed-products.js";
import { seedVoiceSettings } from "./db/seed-voice-settings.js";
import { stopAllLiveSessions } from "./lib/blink/liveview-manager.js";
import { startBlinkScheduler } from "./lib/blink/scheduler.js";
import { startSyncScheduler } from "./lib/calendar-sync.js";
import { apiAuth } from "./middleware/auth.js";
import { acOauthCallbackRouter, acRouter } from "./routes/ac.js";
import { blinkRouter } from "./routes/blink.js";
import { calendarRouter } from "./routes/calendar.js";
import { calendarSourcesRouter } from "./routes/calendar-sources.js";
import { familyRouter } from "./routes/family.js";
import { kioskRouter } from "./routes/kiosk.js";
import { laundryRouter } from "./routes/laundry.js";
import { lightsRouter } from "./routes/lights.js";
import { postitsRouter } from "./routes/postits.js";
import { recipesRouter } from "./routes/recipes.js";
import { roomsRouter } from "./routes/rooms.js";
import { shoppingRouter } from "./routes/shopping.js";
import { spotifyRouter } from "./routes/spotify.js";
import { sseRouter } from "./routes/sse.js";
import { startTimersScheduler, timersRouter } from "./routes/timers.js";
import { tvRouter } from "./routes/tv.js";
import { voiceRouter } from "./routes/voice.js";
import { wasteRouter } from "./routes/waste.js";
import { weatherRouter } from "./routes/weather.js";

// Apply pending migrations before any DB access (seeds, routes, etc.)
migrate(db, { migrationsFolder: "./drizzle" });

// Idempotent seeds on startup
seedProductCatalog();
seedEventCategories();
seedBesozzo2026();
seedBesozzoLocation();
seedKioskSettings();
seedVoiceSettings();

const app = new Hono();
const startedAt = Date.now();

const allowedOrigins = (
  process.env.CORS_ALLOWED_ORIGINS ??
  "http://localhost:1420,tauri://localhost,http://tauri.localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Custom logger: masks ?token= to avoid leaks in logs/proxy/Referer
app.use("*", async (c, next) => {
  const start = Date.now();
  const rawPath = c.req.path;
  const hasToken = c.req.query("token") !== undefined;
  const maskedPath = hasToken
    ? `${rawPath}?${new URL(c.req.url).searchParams
        .toString()
        .replace(/token=[^&]*/g, "token=***")}`
    : rawPath;
  console.log(`<-- ${c.req.method} ${maskedPath}`);
  await next();
  const ms = Date.now() - start;
  console.log(`--> ${c.req.method} ${maskedPath} ${c.res.status} ${ms}ms`);
});
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin ?? "";
      return allowedOrigins.includes(origin) ? origin : "";
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 600,
  }),
);

// /health is exempt from auth (Docker healthcheck, Tailscale)
app.get("/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    version: API_VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  };
  return c.json(body);
});

// Everything under /api/* requires Bearer token, EXCEPT the Blink media proxy,
// the Blink live HLS chunks, SSE, and the GE OAuth2 callback — all of which
// are consumed by browser primitives that cannot attach Authorization headers.
app.use("/api/*", async (c, next) => {
  // The Blink proxy is used by <img> which cannot add Auth headers
  if (c.req.path === `/api/${API_VERSION}/blink/proxy`) {
    return next();
  }
  // HLS playlist + segments consumed by <video> / hls.js
  if (c.req.path.startsWith(`/api/${API_VERSION}/blink/live/`)) {
    return next();
  }
  // SSE: EventSource does not support custom headers, uses ?token= query param
  if (c.req.path === `/api/${API_VERSION}/sse`) {
    const token = c.req.query("token");
    if (!token || token !== process.env.API_TOKEN) {
      return c.json({ error: "invalid_token" }, 401);
    }
    return next();
  }
  // GE OAuth2 callback: Brillion redirects a raw browser here with the
  // auth code. Security comes from the one-shot state nonce validated in
  // the route itself, not from a Bearer token the browser can't send.
  if (c.req.path === `/api/${API_VERSION}/ac/oauth/callback`) {
    return next();
  }
  return apiAuth(c, next);
});

app.route(`/api/${API_VERSION}/family`, familyRouter);
app.route(`/api/${API_VERSION}/shopping`, shoppingRouter);
app.route(`/api/${API_VERSION}/calendar`, calendarRouter);
app.route(`/api/${API_VERSION}/calendar/sources`, calendarSourcesRouter);
app.route(`/api/${API_VERSION}/waste`, wasteRouter);
app.route(`/api/${API_VERSION}/weather`, weatherRouter);
app.route(`/api/${API_VERSION}/postits`, postitsRouter);
app.route(`/api/${API_VERSION}/kiosk`, kioskRouter);
app.route(`/api/${API_VERSION}/voice`, voiceRouter);
app.route(`/api/${API_VERSION}/blink`, blinkRouter);
app.route(`/api/${API_VERSION}/laundry`, laundryRouter);
app.route(`/api/${API_VERSION}/lights`, lightsRouter);
app.route(`/api/${API_VERSION}/tv`, tvRouter);
app.route(`/api/${API_VERSION}/recipes`, recipesRouter);
app.route(`/api/${API_VERSION}/rooms`, roomsRouter);
app.route(`/api/${API_VERSION}/timers`, timersRouter);
app.route(`/api/${API_VERSION}/sse`, sseRouter);
app.route(`/api/${API_VERSION}/spotify`, spotifyRouter);
app.route(`/api/${API_VERSION}/ac`, acRouter);
app.route(`/api/${API_VERSION}/ac/oauth/callback`, acOauthCallbackRouter);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`API in ascolto su http://${info.address}:${info.port}`);
  startSyncScheduler();
  startBlinkScheduler();
  startTimersScheduler();
});

/* Tear down ffmpeg children + notify Blink on graceful shutdown so the
 * next boot doesn't inherit orphaned liveview sessions. */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stopAllLiveSessions().finally(() => process.exit(0));
  });
}
