// Tipi e costanti condivise tra app mobile e API.
// Tutto quello che esponi qui diventa disponibile sia nel frontend Tauri
// che nel backend Hono via `import { ... } from "@home-panel/shared"`.

export const API_VERSION = "v1" as const;

export type HealthResponse = {
  status: "ok";
  version: string;
  uptime: number;
};

export * from "./blink.js";
export * from "./calendar.js";
export * from "./family.js";
export * from "./kiosk.js";
export * from "./laundry.js";
export * from "./postits.js";
export * from "./recipes.js";
export * from "./shopping.js";
export * from "./spotify.js";
export * from "./timers.js";
export * from "./voice.js";
export * from "./waste.js";
export * from "./weather.js";
