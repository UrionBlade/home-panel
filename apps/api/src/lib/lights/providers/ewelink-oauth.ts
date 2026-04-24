/**
 * eWeLink OAuth2 authorization code flow.
 *
 * Some Dev Console applications are configured for OAuth only — the direct
 * `/v2/user/login` endpoint returns "path not allowed for this appid" and
 * the integration has no choice but to go through the hosted consent page.
 *
 * Flow:
 *   1. Backend → `makeAuthorizeUrl()` returns the hosted URL the browser
 *      redirects to (https://c2ccdn.coolkit.cc/oauth/index.html). User
 *      authenticates on eWeLink's page and consents.
 *   2. eWeLink redirects back to our callback with `?code=...&region=...`.
 *   3. Backend → `exchangeCodeForTokens()` POSTs the code to the region's
 *      `/v2/user/oauth/token`, receives access + refresh tokens, stores
 *      them under the same `ewelink` provider row used by the ROPC path so
 *      the rest of the lights code (`ensureEwelinkAccessToken`, device
 *      listing, switch commands) keeps working unchanged.
 *
 * Both the authorize URL and the token exchange use HMAC-SHA256 signatures:
 *   - Authorize: sign `clientId_seq` with `clientSecret` → base64
 *   - Token exchange: sign the JSON body bytes with `clientSecret` → base64
 */

import { createHmac, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../../db/client.js";
import { providerCredentials } from "../../../db/schema.js";
import { type EwelinkRegion, saveEwelinkCredentials } from "./ewelink.js";

const AUTHORIZE_PAGE = "https://c2ccdn.coolkit.cc/oauth/index.html";

const REGION_HOSTS: Record<EwelinkRegion, string> = {
  eu: "https://eu-apia.coolkit.cc",
  us: "https://us-apia.coolkit.cc",
  as: "https://as-apia.coolkit.cc",
  cn: "https://cn-apia.coolkit.cn",
};

export class EwelinkOauthError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "EwelinkOauthError";
  }
}

/* ------------------------------------------------------------------------ */
/*  Authorize URL                                                            */
/* ------------------------------------------------------------------------ */

/** HMAC-SHA256 of the given payload string with clientSecret, base64-encoded. */
function signPayload(payload: string, clientSecret: string): string {
  return createHmac("sha256", clientSecret).update(payload).digest("base64");
}

export function makeAuthorizeUrl(args: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
  /** Pre-select a region so the user lands on the right login page. `eu`
   * by default — the user can still switch from the page itself. */
  region?: EwelinkRegion;
}): string {
  const { clientId, clientSecret, redirectUri, state, region = "eu" } = args;
  const seq = String(Date.now());
  const authorization = signPayload(`${clientId}_${seq}`, clientSecret);

  const u = new URL(AUTHORIZE_PAGE);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("seq", seq);
  u.searchParams.set("authorization", authorization);
  u.searchParams.set("redirectUrl", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("grantType", "authorization_code");
  u.searchParams.set("showQRCode", "false");
  u.searchParams.set("nonce", randomBytes(4).toString("hex"));
  u.searchParams.set("lang", "it");
  u.searchParams.set("region", region);
  return u.toString();
}

/* ------------------------------------------------------------------------ */
/*  Token exchange                                                           */
/* ------------------------------------------------------------------------ */

interface TokenResponse {
  accessToken: string;
  atExpiredTime: number;
  refreshToken: string;
  rtExpiredTime: number;
  /* eWeLink sometimes echoes back the user email/apikey here. */
  user?: { email?: string; countryCode?: string; apikey?: string };
}

type ApiEnvelope<T> = { error: number; msg?: string; data?: T };

/** Exchange the one-shot authorization `code` for access + refresh tokens
 * and persist them into the shared `ewelink` provider_credentials row. */
export async function exchangeCodeForTokens(args: {
  code: string;
  region: EwelinkRegion;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; refreshToken: string; region: EwelinkRegion }> {
  const { code, region, redirectUri, clientId, clientSecret } = args;

  const body = {
    code,
    redirectUrl: redirectUri,
    grantType: "authorization_code",
  };
  const bodyText = JSON.stringify(body);

  const res = await fetch(`${REGION_HOSTS[region]}/v2/user/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CK-Appid": clientId,
      "X-CK-Nonce": randomBytes(4).toString("hex"),
      Authorization: `Sign ${signPayload(bodyText, clientSecret)}`,
    },
    body: bodyText,
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<TokenResponse> | null;
  if (!json) {
    throw new EwelinkOauthError(-1, "Invalid response from eWeLink token endpoint", res.status);
  }
  if (json.error !== 0 || !json.data) {
    throw new EwelinkOauthError(
      json.error,
      json.msg ?? `eWeLink token exchange failed (error ${json.error})`,
      res.status,
    );
  }

  const { accessToken, refreshToken, user } = json.data;

  /* Persist into the same row the ROPC path uses. Email + country are
   * nice-to-haves for the UI ("Connected as foo@bar.it") — they come back
   * in `user` when available, otherwise we fall back to empty string and
   * let the UI render "Connected via OAuth". Password stays empty: the
   * OAuth flow doesn't need it, and all subsequent calls use the Bearer
   * access token directly. */
  const email = user?.email ?? "";
  const countryCode = user?.countryCode ?? "+39";
  saveEwelinkCredentials({
    email,
    password: "",
    countryCode,
    region,
    accessToken,
    refreshToken,
    lastAuthAt: new Date().toISOString(),
  });

  return { accessToken, refreshToken, region };
}

/* ------------------------------------------------------------------------ */
/*  Env + redirect URI                                                       */
/* ------------------------------------------------------------------------ */

/** Get the OAuth redirect URI configured in the backend env. Must match
 * one of the redirect URIs registered on dev.ewelink.cc for this appid. */
export function getEwelinkRedirectUri(): string | null {
  const v = process.env.EWELINK_OAUTH_REDIRECT_URI?.trim();
  return v && v.length > 0 ? v : null;
}

/* ------------------------------------------------------------------------ */
/*  Pending state store                                                      */
/* ------------------------------------------------------------------------ */

/** In-memory CSRF nonces for the authorize → callback round-trip. TTL 10
 * min (survives slow users on the consent page). Non-sticky across a
 * restart: if the backend reboots between start and callback, the user
 * just repeats the flow. */
interface PendingOauth {
  expiresAt: number;
  region: EwelinkRegion;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pending = new Map<string, PendingOauth>();

export function setEwelinkPending(state: string, region: EwelinkRegion): void {
  const now = Date.now();
  for (const [k, v] of pending) {
    if (v.expiresAt < now) pending.delete(k);
  }
  pending.set(state, { expiresAt: now + OAUTH_STATE_TTL_MS, region });
}

export function takeEwelinkPending(state: string): PendingOauth | null {
  const entry = pending.get(state);
  if (!entry) return null;
  pending.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
}

/** Wipe any stale OAuth code left in the provider_credentials row by the
 * stub callback (pre-OAuth-client). Call this after a successful token
 * exchange so the DB only ever holds live tokens. */
export function wipePendingAuthFields(): void {
  const row = db
    .select()
    .from(providerCredentials)
    .where(eq(providerCredentials.provider, "ewelink"))
    .get();
  if (!row) return;
  try {
    const cfg = JSON.parse(row.configJson) as Record<string, unknown>;
    delete cfg.pendingAuthCode;
    delete cfg.pendingAuthRegion;
    delete cfg.pendingAuthRedirectUri;
    delete cfg.pendingAuthAt;
    db.update(providerCredentials)
      .set({ configJson: JSON.stringify(cfg), updatedAt: new Date().toISOString() })
      .where(eq(providerCredentials.provider, "ewelink"))
      .run();
  } catch {
    /* Malformed JSON — ignore, nothing to clean. */
  }
}
