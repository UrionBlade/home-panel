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

async function dirigeraRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const config = resolveConfig();
  if (!config) throw new DirigeraNotConfiguredError();

  const method = opts.method ?? "GET";
  const url = `${baseUrl(config.host)}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
      // The native fetch in Node honours `agent` via the dispatcher option
      // when undici is used; for the typed surface we cast since the spec
      // doesn't include `agent`.
      // @ts-expect-error — Node's undici fetch accepts dispatcher/agent option
      agent: dirigeraAgent,
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    throw new DirigeraError(0, `DIRIGERA fetch failed: ${msg}`);
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new DirigeraError(res.status, `DIRIGERA ${method} ${path} → ${res.status}`, text);
  }
  /* 204 No Content is common on PATCH; return null cast as T, callers
   * that PATCH just ignore the result. */
  if (res.status === 204) return null as T;

  const text = await res.text();
  if (text === "") return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DirigeraError(res.status, `DIRIGERA ${path}: invalid JSON response`);
  }
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
