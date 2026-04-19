import { API_VERSION, type HealthResponse } from "@home-panel/shared";
import { serve } from "@hono/node-server";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { seedBesozzo2026 } from "./db/seed-besozzo-2026.js";
import { seedBesozzoLocation } from "./db/seed-besozzo-location.js";
import { seedEventCategories } from "./db/seed-event-categories.js";
import { seedKioskSettings } from "./db/seed-kiosk-settings.js";
import { seedProductCatalog } from "./db/seed-products.js";
import { seedVoiceSettings } from "./db/seed-voice-settings.js";
import { startSyncScheduler } from "./lib/calendar-sync.js";
import { apiAuth } from "./middleware/auth.js";
import { blinkRouter } from "./routes/blink.js";
import { calendarRouter } from "./routes/calendar.js";
import { calendarSourcesRouter } from "./routes/calendar-sources.js";
import { familyRouter } from "./routes/family.js";
import { kioskRouter } from "./routes/kiosk.js";
import { laundryRouter } from "./routes/laundry.js";
import { postitsRouter } from "./routes/postits.js";
import { recipesRouter } from "./routes/recipes.js";
import { shoppingRouter } from "./routes/shopping.js";
import { spotifyRouter } from "./routes/spotify.js";
import { sseRouter } from "./routes/sse.js";
import { timersRouter } from "./routes/timers.js";
import { voiceRouter } from "./routes/voice.js";
import { wasteRouter } from "./routes/waste.js";
import { weatherRouter } from "./routes/weather.js";

// Seeds idempotenti all'avvio
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

app.use("*", logger());
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

// /health è esente da auth (healthcheck Docker, Tailscale)
app.get("/health", (c) => {
  const body: HealthResponse = {
    status: "ok",
    version: API_VERSION,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  };
  return c.json(body);
});

// Tutto sotto /api/* richiede Bearer token, TRANNE il proxy media Blink e SSE
app.use("/api/*", async (c, next) => {
  // Il proxy Blink è usato da <img>/<video> che non possono aggiungere header Auth
  if (c.req.path === `/api/${API_VERSION}/blink/proxy`) {
    return next();
  }
  // SSE: EventSource non supporta header custom, usa ?token= query param
  if (c.req.path === `/api/${API_VERSION}/sse`) {
    const token = c.req.query("token");
    if (!token || token !== process.env.API_TOKEN) {
      return c.json({ error: "invalid_token" }, 401);
    }
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
app.route(`/api/${API_VERSION}/recipes`, recipesRouter);
app.route(`/api/${API_VERSION}/timers`, timersRouter);
app.route(`/api/${API_VERSION}/sse`, sseRouter);
app.route(`/api/${API_VERSION}/spotify`, spotifyRouter);

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`API in ascolto su http://${info.address}:${info.port}`);
  startSyncScheduler();
});
