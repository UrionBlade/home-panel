/**
 * Authenticated HTTP client for the SmartHQ Digital Twin API v2.
 *
 * Responsible for:
 *   - attaching the current access token to every request
 *   - refreshing proactively when the token is near expiry
 *   - retrying once on a 401 (token revoked by GE)
 *
 * Token storage is delegated to the caller via `loadTokens` / `saveTokens`
 * callbacks so this module stays free of DB imports and can be unit-tested
 * against an in-memory fake.
 */

import { GeAuthError, type GeTokenPair, refreshAccessToken } from "./auth.js";
import { GE_API_URL, GE_TOKEN_REFRESH_SKEW_MS } from "./const.js";

export interface GeTokenStore {
  /** Return the current tokens or null if the user hasn't linked GE yet. */
  loadTokens(): GeTokenPair | null;
  /** Persist a fresh token pair. Called after every successful refresh. */
  saveTokens(tokens: GeTokenPair): void;
  /** Wipe tokens — used when refresh fails permanently so the UI can show
   * a "reconnect" banner. */
  clearTokens(): void;
}

export class GeNotConfiguredError extends Error {
  constructor() {
    super("GE Appliances not linked");
    this.name = "GeNotConfiguredError";
  }
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() - GE_TOKEN_REFRESH_SKEW_MS < Date.now();
}

/** Coalesce concurrent refreshes so the polling loop doesn't trigger N
 * parallel refreshes when the token expires. */
let inflightRefresh: Promise<GeTokenPair> | null = null;

async function refreshWithCoalescing(
  store: GeTokenStore,
  refreshToken: string,
): Promise<GeTokenPair> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = refreshAccessToken(refreshToken)
    .then((tokens) => {
      store.saveTokens(tokens);
      return tokens;
    })
    .catch((err) => {
      // On permanent failure wipe tokens so the UI can prompt a reconnect.
      if (err instanceof GeAuthError && err.status === 400) {
        store.clearTokens();
      }
      throw err;
    })
    .finally(() => {
      inflightRefresh = null;
    });

  return inflightRefresh;
}

async function getUsableTokens(store: GeTokenStore): Promise<GeTokenPair> {
  const current = store.loadTokens();
  if (!current) throw new GeNotConfiguredError();

  if (!isExpired(current.expiresAt)) return current;
  return refreshWithCoalescing(store, current.refreshToken);
}

/** Fetch wrapper that attaches the Bearer token and transparently refreshes
 * on 401. `path` is relative to `baseUrl` (defaults to SmartHQ). */
export async function geFetch(
  store: GeTokenStore,
  path: string,
  init: RequestInit = {},
  baseUrl: string = GE_API_URL,
): Promise<Response> {
  let tokens = await getUsableTokens(store);

  const doFetch = () =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${tokens.accessToken}`,
        Accept: "application/json",
      },
    });

  let resp = await doFetch();
  if (resp.status === 401) {
    // Token was invalidated server-side before expiry — force refresh once.
    tokens = await refreshWithCoalescing(store, tokens.refreshToken);
    resp = await doFetch();
  }
  return resp;
}

/** Convenience: parse JSON or throw. Throws a typed error on non-2xx so
 * route handlers can produce a clean {error} response. */
export async function geFetchJson<T>(
  store: GeTokenStore,
  path: string,
  init: RequestInit = {},
  baseUrl: string = GE_API_URL,
): Promise<T> {
  const resp = await geFetch(store, path, init, baseUrl);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new GeAuthError(
      `GE API ${path} returned ${resp.status}`,
      resp.status,
      body.slice(0, 500),
    );
  }
  return (await resp.json()) as T;
}
