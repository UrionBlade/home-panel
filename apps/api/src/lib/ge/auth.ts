/**
 * Server-side OAuth2 login against accounts.brillion.geappliances.com.
 *
 * The consumer `client_id` embedded in the GE Comfort / SmartHQ mobile app
 * only allows the `brillion.xxx://oauth/redirect` custom scheme as
 * `redirect_uri`. The OAuth server rejects any HTTP callback, so we can't
 * run the standard "open a browser → wait for redirect" flow. Same path
 * that `gehome` (Python) takes:
 *
 *   1. GET  /oauth2/auth           → Brillion renders the login form with
 *                                    hidden CSRF-style fields.
 *   2. POST /oauth2/g_authenticate → submit those fields + user credentials,
 *                                    follow the 302 to the custom-scheme
 *                                    redirect, extract `code` from the URL.
 *   3. POST /oauth2/token          → exchange the code for the token pair.
 *
 * Pure functions — no DB access, no side effects beyond the HTTP calls.
 */

import {
  GE_CLIENT_ID,
  GE_CLIENT_SECRET,
  GE_LOGIN_URL,
  GE_OAUTH_REDIRECT_URI,
  GE_REGION_COOKIE_NAME,
  GE_REGION_EU,
} from "./const.js";

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

/** Minimal cookie jar: preserves whatever Brillion sets between the GET
 * /oauth2/auth and the POST /oauth2/g_authenticate (it ties the two
 * requests together via a server-side session cookie). */
class CookieJar {
  private readonly cookies = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    if (seed) {
      for (const [k, v] of Object.entries(seed)) {
        this.cookies.set(k, v);
      }
    }
  }

  absorb(resp: Response): void {
    for (const raw of resp.headers.getSetCookie()) {
      const [nameValue] = raw.split(";");
      if (!nameValue) continue;
      const eq = nameValue.indexOf("=");
      if (eq < 0) continue;
      const name = nameValue.slice(0, eq).trim();
      const value = nameValue.slice(eq + 1).trim();
      if (name) this.cookies.set(name, value);
    }
  }

  header(): string {
    return Array.from(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

/** Parse hidden `<input>` fields of a specific form out of an HTML page.
 * Brillion's login form is a classic Spring-rendered page — the regex is
 * fragile by design, but the field set is stable and has been for years.
 * Full HTML parsers would be overkill and add a dependency. */
function extractFormInputs(html: string, formId: string): Record<string, string> {
  const formRe = new RegExp(`<form[^>]*id=["']${formId}["'][^>]*>([\\s\\S]*?)</form>`, "i");
  const formMatch = html.match(formRe);
  if (!formMatch?.[1]) return {};
  const formHtml = formMatch[1];

  const inputs: Record<string, string> = {};
  const inputRe = /<input\b([^>]*)>/gi;
  for (const m of formHtml.matchAll(inputRe)) {
    const attrs = m[1] ?? "";
    const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i);
    if (!nameMatch?.[1]) continue;
    const valueMatch = attrs.match(/\bvalue=["']([^"']*)["']/i);
    inputs[nameMatch[1]] = valueMatch?.[1] ?? "";
  }
  return inputs;
}

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function postToken(body: Record<string, string>): Promise<GeTokenPair> {
  const authHeader = `Basic ${Buffer.from(`${GE_CLIENT_ID}:${GE_CLIENT_SECRET}`).toString("base64")}`;

  /* Brillion wants `client_id` + `client_secret` in the form body _and_
   * Basic Auth in the header — sending only the latter comes back as a
   * bare 400 with no hint. Same pattern as `gehome`. */
  const fullBody = {
    ...body,
    client_id: GE_CLIENT_ID,
    client_secret: GE_CLIENT_SECRET,
  };

  const resp = await fetch(`${GE_LOGIN_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(fullBody).toString(),
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

/** Full login: credentials in, token pair out. Throws `GeAuthError` with a
 * helpful message on the cases we can't automate (MFA enrollment page,
 * pending terms acceptance) so the UI can redirect the user to the
 * official app for a one-off unblock. */
export async function loginWithCredentials(params: {
  email: string;
  password: string;
}): Promise<GeTokenPair> {
  const jar = new CookieJar({ [GE_REGION_COOKIE_NAME]: GE_REGION_EU });

  /* Step 1 — fetch the login page to collect the CSRF-style hidden fields
   * and the session cookie. */
  const authUrl = new URL(`${GE_LOGIN_URL}/oauth2/auth`);
  authUrl.searchParams.set("client_id", GE_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("redirect_uri", GE_OAUTH_REDIRECT_URI);

  const authResp = await fetch(authUrl, {
    headers: { Cookie: jar.header(), Accept: "text/html" },
  });
  if (!authResp.ok) {
    throw new GeAuthError(`GE /oauth2/auth returned ${authResp.status}`, authResp.status);
  }
  jar.absorb(authResp);
  const authHtml = await authResp.text();

  const formFields = extractFormInputs(authHtml, "frmsignin");
  formFields.username = params.email.trim();
  formFields.password = params.password;

  /* Step 2 — submit the form. `redirect: "manual"` lets us read the 302
   * Location header instead of having fetch chase a custom scheme it can't
   * reach. */
  const loginResp = await fetch(`${GE_LOGIN_URL}/oauth2/g_authenticate`, {
    method: "POST",
    redirect: "manual",
    headers: {
      Cookie: jar.header(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
    },
    body: new URLSearchParams(formFields).toString(),
  });
  jar.absorb(loginResp);

  if (loginResp.status >= 300 && loginResp.status < 400) {
    const location = loginResp.headers.get("location");
    if (!location) {
      throw new GeAuthError("GE redirect missing Location header", loginResp.status);
    }
    const code = new URL(location).searchParams.get("code");
    if (!code) {
      throw new GeAuthError(
        "GE redirect did not carry an authorization code",
        loginResp.status,
        location.slice(0, 200),
      );
    }

    /* Step 3 — exchange the code for the first token pair. */
    return postToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: GE_OAUTH_REDIRECT_URI,
    });
  }

  /* A 200 here means Brillion rendered an interstitial instead of
   * redirecting: usually wrong password, MFA enrollment, or pending
   * terms acceptance. We don't try to script those — the user unblocks
   * them in the official app once and retries. */
  if (loginResp.status === 200) {
    const body = await loginResp.text();
    if (/Multi-Factor Authentication|addMfaForm/i.test(body)) {
      throw new GeAuthError("MFA da completare nell'app GE Comfort, poi riprova", 200);
    }
    if (/Almost Finished|termsform/i.test(body)) {
      throw new GeAuthError("Accetta i termini nell'app GE Comfort, poi riprova", 200);
    }
    throw new GeAuthError("Email o password non corretta", 200);
  }

  throw new GeAuthError(`GE login failed with status ${loginResp.status}`, loginResp.status);
}

/** Refresh using a stored refresh token. GE rotates the refresh token on
 * every call, so callers must persist the new pair even on "refresh only"
 * paths. `redirect_uri` is required by Brillion even on refresh (quirk
 * confirmed by gehome). */
export async function refreshAccessToken(refreshToken: string): Promise<GeTokenPair> {
  return postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    redirect_uri: GE_OAUTH_REDIRECT_URI,
  });
}
