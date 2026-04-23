/**
 * OAuth2 authorization_code flow against accounts.brillion.geappliances.com.
 *
 * Pure functions — no DB access, no side effects beyond the HTTP call. The
 * caller (routes layer) owns persistence of the token triple.
 *
 * Flow:
 *   1. buildAuthorizationUrl(...)    → URL the user opens in a browser
 *   2. Brillion redirects to our redirectUri with ?code=...
 *   3. exchangeCodeForTokens(code)   → first token pair
 *   4. refreshAccessToken(refresh)   → renewed pair on expiry or 401
 */

import { GE_CLIENT_ID, GE_CLIENT_SECRET, GE_LOGIN_URL } from "./const.js";

export interface GeTokenPair {
  accessToken: string;
  refreshToken: string;
  /** ISO-8601 timestamp of access token expiry. */
  expiresAt: string;
}

export class GeAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: string,
  ) {
    super(message);
    this.name = "GeAuthError";
  }
}

/** Build the authorization URL. Client opens this in a browser; Brillion
 * handles credentials + MFA + terms acceptance and redirects to
 * `redirectUri` with `?code=...&state=...`. */
export function buildAuthorizationUrl(params: { redirectUri: string; state: string }): string {
  const url = new URL(`${GE_LOGIN_URL}/oauth2/auth`);
  url.searchParams.set("client_id", GE_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function postToken(body: Record<string, string>): Promise<GeTokenPair> {
  const authHeader = `Basic ${Buffer.from(`${GE_CLIENT_ID}:${GE_CLIENT_SECRET}`).toString("base64")}`;

  const resp = await fetch(`${GE_LOGIN_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new GeAuthError(
      `GE token endpoint returned ${resp.status}`,
      resp.status,
      text.slice(0, 500),
    );
  }

  const data = (await resp.json()) as RawTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new GeAuthError("GE token response missing access_token or refresh_token");
  }

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  };
}

/** Exchange the authorization code from the redirect callback for the first
 * access + refresh token pair. */
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<GeTokenPair> {
  return postToken({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: GE_CLIENT_ID,
  });
}

/** Refresh using a stored refresh token. GE rotates the refresh token on
 * every call, so callers must persist the new pair even on "refresh only"
 * paths. */
export async function refreshAccessToken(refreshToken: string): Promise<GeTokenPair> {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: GE_CLIENT_ID,
  });
}
