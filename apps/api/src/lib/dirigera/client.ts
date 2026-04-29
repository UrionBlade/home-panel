/**
 * DIRIGERA REST client.
 *
 * Talks to the IKEA hub gateway at `https://$DIRIGERA_HOST:8443/v1/*`,
 * which serves a self-signed certificate. We accept that cert via a
 * dedicated `https.Agent` passed only to DIRIGERA fetches — never via
 * `NODE_TLS_REJECT_UNAUTHORIZED`, which would weaken every other HTTPS
 * call the API makes (Spotify, eWeLink, APNs, ...).
 *
 * The bearer token is obtained one-time via `scripts/dirigera/auth.sh`
 * and lives in `DIRIGERA_TOKEN`. When either env var is missing the
 * client is a no-op (`isConfigured()` returns false) so the rest of the
 * API boots cleanly without DIRIGERA.
 */

import https from "node:https";
import type { DirigeraDevice, DirigeraHubInfo } from "@home-panel/shared";

/* TLS agent dedicated to DIRIGERA. Reused across all calls so we don't
 * pay handshake cost on every request, and isolated from the global
 * fetch agent so other integrations stay strict. */
const dirigeraAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
});

export class DirigeraError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "DirigeraError";
  }
}

export class DirigeraNotConfiguredError extends Error {
  constructor() {
    super("DIRIGERA hub not configured (set DIRIGERA_HOST and DIRIGERA_TOKEN)");
    this.name = "DirigeraNotConfiguredError";
  }
}

interface ResolvedConfig {
  host: string;
  token: string;
}

/** Always read fresh — env may be reloaded via `dotenv.config()` mid-runtime
 * during tests, and we don't want a cached `null` after the user fixes the
 * `.env` file and bounces the API. */
function resolveConfig(): ResolvedConfig | null {
  const host = process.env.DIRIGERA_HOST?.trim();
  const token = process.env.DIRIGERA_TOKEN?.trim();
  if (!host || !token) return null;
  return { host, token };
}

export function isConfigured(): boolean {
  return resolveConfig() !== null;
}

export function getHost(): string | null {
  return resolveConfig()?.host ?? null;
}

function baseUrl(host: string): string {
  return `https://${host}:8443/v1`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  /** Per-call timeout in milliseconds. Default 8s. The hub itself is
   * usually < 200ms; the timeout is a defence against network glitches. */
  timeoutMs?: number;
}

/* Node 22's global `fetch` (undici) does not honour an `agent` option,
 * so the per-call self-signed TLS bypass we need for the hub doesn't
 * work via fetch. Drop down to `https.request` which accepts our
 * dedicated `https.Agent` directly — gives us the same low-level
 * control without disabling TLS verification globally. */
async function dirigeraRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const config = resolveConfig();
  if (!config) throw new DirigeraNotConfiguredError();

  const method = opts.method ?? "GET";
  const payload = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
  };
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = String(Buffer.byteLength(payload));
  }

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host: config.host,
        port: 8443,
        path: `/v1${path}`,
        method,
        headers,
        agent: dirigeraAgent,
        timeout: opts.timeoutMs ?? 8_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new DirigeraError(status, `DIRIGERA ${method} ${path} → ${status}`, text));
            return;
          }
          if (status === 204 || text === "") {
            resolve(null as T);
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new DirigeraError(status, `DIRIGERA ${path}: invalid JSON response`));
          }
        });
        res.on("error", (err) => {
          reject(new DirigeraError(0, `DIRIGERA stream error: ${err.message}`));
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      reject(new DirigeraError(0, `DIRIGERA fetch failed: ${err.message}`));
    });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/* -- Public surface ------------------------------------------------------ */

export function dirigeraGet<T>(path: string): Promise<T> {
  return dirigeraRequest<T>(path, { method: "GET" });
}

export function dirigeraPost<T>(path: string, body: unknown): Promise<T> {
  return dirigeraRequest<T>(path, { method: "POST", body });
}

export function dirigeraPatch<T>(path: string, body: unknown): Promise<T> {
  return dirigeraRequest<T>(path, { method: "PATCH", body });
}

export function dirigeraDelete<T>(path: string): Promise<T> {
  return dirigeraRequest<T>(path, { method: "DELETE" });
}

/* -- Higher-level helpers ----------------------------------------------- */

/** Fetch the full device list from the hub. */
export function listDevices(): Promise<DirigeraDevice[]> {
  return dirigeraGet<DirigeraDevice[]>("/devices");
}

/** Patch one device's attributes. The hub accepts an array of operations,
 * even when only one attribute changes. */
export function patchDevice(deviceId: string, attributes: Record<string, unknown>): Promise<void> {
  return dirigeraPatch<void>(`/devices/${encodeURIComponent(deviceId)}`, [{ attributes }]);
}

/** Read hub-level metadata (firmware, model). Useful for diagnostics. */
export async function getHubInfo(): Promise<DirigeraHubInfo | null> {
  /* The gateway endpoint name has shifted across firmware versions
   * ("/hub" → "/gateway"). Try both, return null if neither responds. */
  for (const path of ["/gateway", "/hub"]) {
    try {
      return await dirigeraGet<DirigeraHubInfo>(path);
    } catch (err) {
      if (err instanceof DirigeraError && err.status === 404) continue;
      throw err;
    }
  }
  return null;
}

/** Exposed for the WebSocket client to share the same TLS agent. */
export function getTlsAgent(): https.Agent {
  return dirigeraAgent;
}
