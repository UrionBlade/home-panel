/**
 * Client Blink con OAuth 2.0 PKCE (basato su blinkpy).
 * Supporta 2FA: login in 2 step se Blink richiede PIN.
 */

import { createHash, randomBytes } from "node:crypto";

const OAUTH_BASE = "https://api.oauth.blink.com";
const BLINK_PROD = "https://rest-prod.immedia-semi.com";

const OAUTH_AUTHORIZE_URL = `${OAUTH_BASE}/oauth/v2/authorize`;
const OAUTH_SIGNIN_URL = `${OAUTH_BASE}/oauth/v2/signin`;
const OAUTH_2FA_URL = `${OAUTH_BASE}/oauth/v2/2fa/verify`;
const OAUTH_TOKEN_URL = `${OAUTH_BASE}/oauth/token`;
const TIER_URL = `${BLINK_PROD}/api/v1/users/tier_info`;

const REDIRECT_URI = "immedia-blink://applinks.blink.com/signin/callback";
const CLIENT_ID = "ios";

const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1";
const NATIVE_UA = "Blink/2511191620 CFNetwork/3860.200.71 Darwin/25.1.0";

/* ---- PKCE ---- */

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/* ---- Cookie jar ---- */

class CookieJar {
  private cookies = new Map<string, string>();

  capture(response: Response) {
    for (const sc of response.headers.getSetCookie?.() ?? []) {
      const pair = sc.split(";")[0] ?? "";
      const eq = pair.indexOf("=");
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
    }
  }

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  serialize(): string {
    return JSON.stringify([...this.cookies.entries()]);
  }

  static deserialize(data: string): CookieJar {
    const jar = new CookieJar();
    for (const [k, v] of JSON.parse(data) as [string, string][]) {
      jar.cookies.set(k, v);
    }
    return jar;
  }
}

/* ---- Types ---- */

export interface BlinkSession {
  accessToken: string;
  refreshToken: string;
  hardwareId: string;
  accountId: number;
  region: string;
  host: string;
}

export interface BlinkCameraInfo {
  id: string;
  name: string;
  networkId: string;
  status: string;
  battery: string;
  thumbnail: string;
  serial: string;
  firmwareVersion: string;
}

export interface BlinkClipInfo {
  id: string;
  cameraId: string;
  cameraName: string;
  recordedAt: string;
  mediaUrl: string;
  thumbnailUrl: string;
}

/** Stato intermedio salvato quando serve 2FA. */
export interface BlinkPending2FA {
  csrfToken: string;
  codeVerifier: string;
  hardwareId: string;
  cookies: string; // serialized CookieJar
}

export type BlinkLoginResult =
  | { ok: true; session: BlinkSession }
  | { ok: false; needs2FA: true; pending: BlinkPending2FA };

/* ---- Login (step 1) ---- */

export async function blinkLogin(email: string, password: string): Promise<BlinkLoginResult> {
  const jar = new CookieJar();
  const { verifier, challenge } = generatePkce();
  const hardwareId = randomBytes(16).toString("hex").toUpperCase();

  // Step 1: Authorization request
  const authParams = new URLSearchParams({
    app_brand: "blink",
    app_version: "50.1",
    client_id: CLIENT_ID,
    code_challenge: challenge,
    code_challenge_method: "S256",
    device_brand: "Apple",
    device_model: "iPhone16,1",
    device_os_version: "26.1",
    hardware_id: hardwareId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "client",
  });

  const authRes = await fetch(`${OAUTH_AUTHORIZE_URL}?${authParams}`, {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "manual",
  });
  jar.capture(authRes);
  await authRes.text();

  // Follow redirect if any
  const authRedirect = authRes.headers.get("location");
  if (authRedirect) {
    const url = authRedirect.startsWith("http") ? authRedirect : `${OAUTH_BASE}${authRedirect}`;
    const r = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Cookie: jar.header() },
      redirect: "manual",
    });
    jar.capture(r);
    await r.text();
  }

  // Step 2: Get signin page → CSRF token
  const signinRes = await fetch(OAUTH_SIGNIN_URL, {
    headers: { "User-Agent": BROWSER_UA, Cookie: jar.header() },
    redirect: "manual",
  });
  jar.capture(signinRes);
  const signinHtml = await signinRes.text();

  const csrfMatch =
    signinHtml.match(/csrf[_-]token["']?\s*[:=]\s*["']([^"']+)/i) ??
    signinHtml.match(/name=["']csrf-token["']\s+(?:content|value)=["']([^"']+)/i) ??
    signinHtml.match(/["']csrfToken["']\s*:\s*["']([^"']+)/i);

  if (!csrfMatch?.[1]) {
    throw new Error("Impossibile estrarre il CSRF token dalla pagina Blink");
  }
  const csrfToken: string = csrfMatch[1];

  // Step 3: POST credentials
  const loginRes = await fetch(OAUTH_SIGNIN_URL, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: OAUTH_BASE,
      Referer: OAUTH_SIGNIN_URL,
      Cookie: jar.header(),
    },
    body: new URLSearchParams({
      username: email,
      password,
      "csrf-token": csrfToken,
    }).toString(),
    redirect: "manual",
  });
  jar.capture(loginRes);
  await loginRes.text();

  if (loginRes.status === 401) {
    throw new Error("Credenziali Blink non valide. Verifica email e password.");
  }

  // 2FA richiesto
  if (loginRes.status === 412) {
    return {
      ok: false,
      needs2FA: true,
      pending: {
        csrfToken,
        codeVerifier: verifier,
        hardwareId,
        cookies: jar.serialize(),
      },
    };
  }

  if (loginRes.status === 401) {
    throw new Error("Credenziali Blink non valide. Verifica email e password.");
  }
  if (loginRes.status === 429) {
    throw new Error(
      "Troppi tentativi. Blink ti ha bloccato temporaneamente. Riprova tra 5-10 minuti.",
    );
  }
  if (![301, 302, 303].includes(loginRes.status)) {
    throw new Error(`Login Blink fallito (${loginRes.status})`);
  }

  // Login OK senza 2FA → completa il flusso
  return { ok: true, session: await completeOAuth(jar, verifier, hardwareId) };
}

/* ---- Verify 2FA PIN (step 2) ---- */

export async function blinkVerify2FA(pin: string, pending: BlinkPending2FA): Promise<BlinkSession> {
  const jar = CookieJar.deserialize(pending.cookies);

  const verifyRes = await fetch(OAUTH_2FA_URL, {
    method: "POST",
    headers: {
      "User-Agent": BROWSER_UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: OAUTH_BASE,
      Referer: OAUTH_SIGNIN_URL,
      Cookie: jar.header(),
    },
    body: new URLSearchParams({
      "2fa_code": pin,
      "csrf-token": pending.csrfToken,
      remember_me: "false",
    }).toString(),
    redirect: "manual",
  });
  jar.capture(verifyRes);

  if (verifyRes.status === 401 || verifyRes.status === 400) {
    throw new Error("PIN non valido. Riprova.");
  }

  // Accept 200/201 with JSON or redirect
  await verifyRes.text();

  return completeOAuth(jar, pending.codeVerifier, pending.hardwareId);
}

/* ---- Complete OAuth (steps 4-6) ---- */

async function completeOAuth(
  jar: CookieJar,
  verifier: string,
  hardwareId: string,
): Promise<BlinkSession> {
  // Step 4: Get authorization code
  const codeRes = await fetch(OAUTH_AUTHORIZE_URL, {
    headers: {
      "User-Agent": BROWSER_UA,
      Referer: OAUTH_SIGNIN_URL,
      Cookie: jar.header(),
    },
    redirect: "manual",
  });
  jar.capture(codeRes);
  await codeRes.text();

  const location = codeRes.headers.get("location") ?? "";
  const codeMatch = location.match(/[?&]code=([^&]+)/);
  if (!codeMatch?.[1]) {
    throw new Error("Impossibile ottenere il codice di autorizzazione Blink");
  }
  const code: string = codeMatch[1];

  // Step 5: Exchange code for tokens
  const tokenRes = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "User-Agent": NATIVE_UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      app_brand: "blink",
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      hardware_id: hardwareId,
      redirect_uri: REDIRECT_URI,
      scope: "client",
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Token exchange fallito (${tokenRes.status}): ${body}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Step 6: Get tier info
  const tierRes = await fetch(TIER_URL, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "User-Agent": NATIVE_UA,
    },
  });
  if (!tierRes.ok) throw new Error(`Tier info fallito (${tierRes.status})`);

  const tierData = (await tierRes.json()) as {
    tier: string;
    account_id: number;
  };

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    hardwareId,
    accountId: tierData.account_id,
    region: tierData.tier,
    host: `https://rest-${tierData.tier}.immedia-semi.com`,
  };
}

/* ---- Refresh token ---- */

export async function blinkRefreshToken(
  refreshToken: string,
  hardwareId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "User-Agent": NATIVE_UA,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
      scope: "client",
      hardware_id: hardwareId,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh fallito (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
  };
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/* ---- Authenticated API calls ---- */

async function blinkApi<T>(session: BlinkSession, path: string, method = "GET"): Promise<T> {
  const res = await fetch(`${session.host}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Blink API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function blinkListCameras(session: BlinkSession): Promise<BlinkCameraInfo[]> {
  interface Camera {
    id: number;
    name: string;
    network_id: number;
    status: string;
    battery: string;
    thumbnail: string;
    serial: string;
    fw_version: string;
  }
  const data = await blinkApi<{ cameras: Camera[] }>(
    session,
    `/api/v3/accounts/${session.accountId}/homescreen`,
  );
  return (data.cameras ?? []).map((cam) => ({
    id: String(cam.id),
    name: cam.name,
    networkId: String(cam.network_id),
    status: cam.status === "done" ? "online" : "offline",
    battery: cam.battery ?? "unknown",
    thumbnail: cam.thumbnail ? `${session.host}${cam.thumbnail}.jpg` : "",
    serial: cam.serial ?? "",
    firmwareVersion: cam.fw_version ?? "",
  }));
}

export async function blinkArmNetwork(
  session: BlinkSession,
  networkId: string,
  arm: boolean,
): Promise<void> {
  const action = arm ? "arm" : "disarm";
  await blinkApi<unknown>(
    session,
    `/api/v1/accounts/${session.accountId}/networks/${networkId}/state/${action}`,
    "POST",
  );
}

/**
 * Sveglia la camera e aggiorna il thumbnail. Blink internamente avvia
 * a brief liveview that refreshes the image. The new thumbnail is
 * disponibile dopo qualche secondo via blinkListCameras.
 */
export async function blinkRequestThumbnail(
  session: BlinkSession,
  networkId: string,
  cameraId: string,
): Promise<void> {
  // L'endpoint "new image" forza la camera a catturare un nuovo thumbnail
  await blinkApi<unknown>(
    session,
    `/api/v1/accounts/${session.accountId}/networks/${networkId}/cameras/${cameraId}/thumbnail`,
    "POST",
  );
}

export async function blinkListMedia(session: BlinkSession, page = 1): Promise<BlinkClipInfo[]> {
  interface MediaItem {
    id: number;
    device_id: number;
    device_name: string;
    created_at: string;
    media: string;
    thumbnail: string;
  }
  const data = await blinkApi<{ media: MediaItem[] }>(
    session,
    `/api/v1/accounts/${session.accountId}/media/changed?since=2020-01-01T00:00:00+00:00&page=${page}`,
  );
  return (data.media ?? []).map((m) => ({
    id: String(m.id),
    cameraId: String(m.device_id),
    cameraName: m.device_name,
    recordedAt: m.created_at,
    mediaUrl: `${session.host}${m.media}`,
    thumbnailUrl: `${session.host}${m.thumbnail}`,
  }));
}
