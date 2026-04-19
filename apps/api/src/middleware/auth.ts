import { bearerAuth } from "hono/bearer-auth";

const token = process.env.API_TOKEN;

if (!token || token.length < 16) {
  console.warn(
    "[auth] API_TOKEN non configurato o troppo corto. Genera con `openssl rand -base64 32` e mettilo in apps/api/.env",
  );
}

/**
 * Middleware Hono che protegge tutte le rotte sotto /api/*.
 * /health resta esente.
 *
 * Token configurato via env API_TOKEN (32+ char base64).
 * Mai loggare il valore del token.
 */
export const apiAuth = bearerAuth({
  token: token ?? "__MISSING_API_TOKEN__",
  invalidTokenMessage: { error: "invalid_token" },
  noAuthenticationHeaderMessage: { error: "missing_token" },
});
