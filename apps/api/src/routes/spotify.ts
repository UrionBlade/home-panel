import type {
  SpotifyAuthStatus,
  SpotifyDevice,
  SpotifyPlaybackState,
  SpotifyPlaylist,
  SpotifySearchResults,
  SpotifyTrack,
} from "@home-panel/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { type SpotifyCredentialsRow, spotifyCredentials } from "../db/schema.js";

/* ---- Constants ---- */

const SPOTIFY_API = "https://api.spotify.com";
const SPOTIFY_ACCOUNTS = "https://accounts.spotify.com";
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? "http://localhost:1420/spotify-callback";

/* ---- PKCE in-memory store (indexed by state, TTL 10 min) ---- */

const PKCE_TTL_MS = 10 * 60 * 1000;

interface PkceEntry {
  verifier: string;
  expiresAt: number;
}

const pendingPkce = new Map<string, PkceEntry>();

function setPendingPkce(state: string, verifier: string) {
  // Purge expired
  const now = Date.now();
  for (const [k, v] of pendingPkce) {
    if (v.expiresAt < now) pendingPkce.delete(k);
  }
  pendingPkce.set(state, { verifier, expiresAt: now + PKCE_TTL_MS });
}

function takePendingPkce(state: string): string | null {
  const entry = pendingPkce.get(state);
  if (!entry) return null;
  pendingPkce.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry.verifier;
}

/* ---- PKCE helpers ---- */

function generateCodeVerifier(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => chars[b % chars.length])
    .join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ---- DTO mappers ---- */

interface SpotifyApiTrack {
  id: string;
  name: string;
  artists?: Array<{ name: string }>;
  album?: { name?: string; images?: Array<{ url: string }> };
  duration_ms?: number;
}

interface SpotifyApiDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent?: number | null;
}

interface SpotifyApiPlaylist {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  tracks?: { total?: number };
  owner?: { display_name?: string; id?: string };
}

function mapTrack(item: SpotifyApiTrack): SpotifyTrack {
  return {
    id: item.id,
    name: item.name,
    artists: (item.artists ?? []).map((a) => a.name),
    album: item.album?.name ?? "",
    albumArt: item.album?.images?.[0]?.url ?? null,
    durationMs: item.duration_ms ?? 0,
  };
}

function mapDevice(d: SpotifyApiDevice): SpotifyDevice {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    isActive: d.is_active,
    volumePercent: d.volume_percent ?? null,
  };
}

function mapPlaylist(p: SpotifyApiPlaylist): SpotifyPlaylist {
  return {
    id: p.id,
    name: p.name,
    imageUrl: p.images?.[0]?.url ?? null,
    trackCount: p.tracks?.total ?? 0,
    owner: p.owner?.display_name ?? p.owner?.id ?? "",
  };
}

/* ---- Token management ---- */

async function getCredentials(): Promise<SpotifyCredentialsRow | null> {
  return db.select().from(spotifyCredentials).get() ?? null;
}

async function saveCredentials(
  accessToken: string,
  refreshToken: string,
  expiresAt: string,
  displayName: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await getCredentials();
  const values = {
    accessToken,
    refreshToken,
    expiresAt,
    displayName,
    updatedAt: now,
  };
  if (existing) {
    db.update(spotifyCredentials).set(values).where(eq(spotifyCredentials.id, 1)).run();
  } else {
    db.insert(spotifyCredentials)
      .values({ id: 1, ...values })
      .run();
  }
}

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });

  // If CLIENT_SECRET is provided use Basic auth (for apps with secret),
  // otherwise rely on PKCE-only flow (public client).
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (CLIENT_SECRET) {
    const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
    (headers as Record<string, string>).Authorization = `Basic ${credentials}`;
  }

  const res = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  return { accessToken: data.access_token, expiresAt };
}

/**
 * Returns a valid access token, auto-refreshing when within 5 minutes of expiry.
 * Returns null if credentials are not configured.
 */
async function getValidToken(): Promise<string | null> {
  const creds = await getCredentials();
  if (!creds?.accessToken || !creds?.refreshToken) return null;

  const expiresAt = creds.expiresAt ? new Date(creds.expiresAt).getTime() : 0;
  const fiveMinutesMs = 5 * 60 * 1000;
  const needsRefresh = Date.now() >= expiresAt - fiveMinutesMs;

  if (needsRefresh) {
    try {
      console.log("[spotify] token in scadenza, avvio refresh…");
      const { accessToken, expiresAt: newExpiresAt } = await refreshAccessToken(creds.refreshToken);
      await saveCredentials(
        accessToken,
        creds.refreshToken,
        newExpiresAt,
        creds.displayName ?? null,
      );
      console.log("[spotify] token refreshato con successo");
      return accessToken;
    } catch (err) {
      console.error("[spotify] refresh fallito:", err);
      // Return the stale token and let the downstream call fail with 401
      return creds.accessToken;
    }
  }

  return creds.accessToken;
}

/**
 * Perform an authenticated Spotify API request, auto-refreshing the token on 401.
 */
async function spotifyFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getValidToken();
  if (!token) throw new Error("Spotify non configurato");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${SPOTIFY_API}${path}`, { ...options, headers });

  // On 401 try one more refresh and retry
  if (res.status === 401) {
    const creds = await getCredentials();
    if (creds?.refreshToken) {
      try {
        const { accessToken, expiresAt } = await refreshAccessToken(creds.refreshToken);
        await saveCredentials(
          accessToken,
          creds.refreshToken,
          expiresAt,
          creds.displayName ?? null,
        );
        const retryHeaders: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers as Record<string, string>),
        };
        return fetch(`${SPOTIFY_API}${path}`, {
          ...options,
          headers: retryHeaders,
        });
      } catch {
        // fall through and return the original 401
      }
    }
  }

  return res;
}

/* ---- Router ---- */

export const spotifyRouter = new Hono()

  /* ----- status ----- */
  .get("/status", async (c) => {
    const creds = await getCredentials();
    const body: SpotifyAuthStatus = {
      configured: !!(creds?.accessToken && creds?.refreshToken),
      displayName: creds?.displayName ?? null,
    };
    return c.json(body);
  })

  /* ----- auth-url (PKCE step 1) ----- */
  .get("/auth-url", async (c) => {
    if (!CLIENT_ID) {
      return c.json({ error: "SPOTIFY_CLIENT_ID non configurato" }, 500);
    }

    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    const state = crypto.randomUUID();
    setPendingPkce(state, verifier);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: CLIENT_ID,
      scope: [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private",
        "playlist-read-collaborative",
        "user-read-private",
        "user-read-email",
      ].join(" "),
      redirect_uri: REDIRECT_URI,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
    });

    return c.json({ url: `${SPOTIFY_ACCOUNTS}/authorize?${params}`, state });
  })

  /* ----- callback (PKCE step 2) ----- */
  .post("/callback", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      code: string;
      state?: string;
    } | null;

    if (!body?.code) {
      return c.json({ error: "authorization code obbligatorio" }, 400);
    }
    if (!body.state) {
      return c.json({ error: "state obbligatorio" }, 400);
    }

    const verifier = takePendingPkce(body.state);
    if (!verifier) {
      return c.json(
        {
          error: "Flusso OAuth scaduto o non trovato. Richiedi di nuovo /auth-url.",
        },
        400,
      );
    }

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code: body.code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });

    const tokenHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (CLIENT_SECRET) {
      const encoded = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
      tokenHeaders.Authorization = `Basic ${encoded}`;
    }

    try {
      const tokenRes = await fetch(`${SPOTIFY_ACCOUNTS}/api/token`, {
        method: "POST",
        headers: tokenHeaders,
        body: tokenParams.toString(),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        console.error("[spotify] token exchange failed:", text);
        return c.json({ error: `Token exchange fallito: ${tokenRes.status}` }, 400);
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in?: number;
      };
      const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

      // Fetch user profile for display name
      let displayName: string | null = null;
      try {
        const profileRes = await fetch(`${SPOTIFY_API}/v1/me`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (profileRes.ok) {
          const profile = (await profileRes.json()) as { display_name?: string; id?: string };
          displayName = profile.display_name ?? profile.id ?? null;
        }
      } catch {
        // Non-critical, proceed without display name
      }

      await saveCredentials(
        tokenData.access_token,
        tokenData.refresh_token,
        expiresAt,
        displayName,
      );

      console.log(`[spotify] autenticato come "${displayName}", token scade: ${expiresAt}`);
      return c.json({ configured: true, displayName }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      console.error("[spotify] callback error:", msg);
      return c.json({ error: msg }, 500);
    }
  })

  /* ----- logout ----- */
  .delete("/credentials", (c) => {
    pendingPkce.clear();
    db.delete(spotifyCredentials).run();
    return c.json({ ok: true });
  })

  /* ----- playback state ----- */
  .get("/playback", async (c) => {
    try {
      const res = await spotifyFetch("/v1/me/player");

      // 204 = no active device
      if (res.status === 204) {
        const body: SpotifyPlaybackState = {
          isPlaying: false,
          track: null,
          progressMs: 0,
          device: null,
          shuffleState: false,
          repeatState: "off",
        };
        return c.json(body);
      }

      if (!res.ok) {
        return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const body: SpotifyPlaybackState = {
        isPlaying: (data.is_playing as boolean) ?? false,
        track: data.item ? mapTrack(data.item as SpotifyApiTrack) : null,
        progressMs: (data.progress_ms as number) ?? 0,
        device: data.device ? mapDevice(data.device as SpotifyApiDevice) : null,
        shuffleState: (data.shuffle_state as boolean) ?? false,
        repeatState: (data.repeat_state as string as "off" | "context" | "track") ?? "off",
      };
      return c.json(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore";
      return c.json({ error: msg }, 500);
    }
  })

  /* ----- play ----- */
  .put("/playback/play", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      contextUri?: string;
      uris?: string[];
      deviceId?: string;
    } | null;

    const query = body?.deviceId ? `?device_id=${encodeURIComponent(body.deviceId)}` : "";

    const spotifyBody: Record<string, unknown> = {};
    if (body?.contextUri) spotifyBody.context_uri = body.contextUri;
    if (body?.uris) spotifyBody.uris = body.uris;

    try {
      const res = await spotifyFetch(`/v1/me/player/play${query}`, {
        method: "PUT",
        body: JSON.stringify(spotifyBody),
      });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- pause ----- */
  .put("/playback/pause", async (c) => {
    try {
      const res = await spotifyFetch("/v1/me/player/pause", {
        method: "PUT",
      });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- next ----- */
  .post("/playback/next", async (c) => {
    try {
      const res = await spotifyFetch("/v1/me/player/next", {
        method: "POST",
      });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- previous ----- */
  .post("/playback/previous", async (c) => {
    try {
      const res = await spotifyFetch("/v1/me/player/previous", {
        method: "POST",
      });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- volume ----- */
  .put("/playback/volume", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      volumePercent: number;
      deviceId?: string;
    } | null;

    if (body?.volumePercent === undefined || body.volumePercent === null) {
      return c.json({ error: "volumePercent obbligatorio" }, 400);
    }

    const params = new URLSearchParams({
      volume_percent: String(Math.round(body.volumePercent)),
    });
    if (body.deviceId) params.set("device_id", body.deviceId);

    try {
      const res = await spotifyFetch(`/v1/me/player/volume?${params}`, { method: "PUT" });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- shuffle ----- */
  .put("/playback/shuffle", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      state: boolean;
    } | null;

    if (body?.state === undefined || body.state === null) {
      return c.json({ error: "state obbligatorio" }, 400);
    }

    const params = new URLSearchParams({ state: String(body.state) });

    try {
      const res = await spotifyFetch(`/v1/me/player/shuffle?${params}`, { method: "PUT" });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- repeat ----- */
  .put("/playback/repeat", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      state: "off" | "context" | "track";
    } | null;

    if (!body?.state) {
      return c.json({ error: "state obbligatorio (off|context|track)" }, 400);
    }

    const params = new URLSearchParams({ state: body.state });

    try {
      const res = await spotifyFetch(`/v1/me/player/repeat?${params}`, { method: "PUT" });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- transfer playback ----- */
  .put("/playback/transfer", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      deviceId: string;
    } | null;

    if (!body?.deviceId) {
      return c.json({ error: "deviceId obbligatorio" }, 400);
    }

    try {
      const res = await spotifyFetch("/v1/me/player", {
        method: "PUT",
        body: JSON.stringify({ device_ids: [body.deviceId], play: true }),
      });
      if (res.status === 204 || res.ok) return c.json({ ok: true });
      return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- devices ----- */
  .get("/devices", async (c) => {
    try {
      const res = await spotifyFetch("/v1/me/player/devices");
      if (!res.ok) {
        return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
      }
      const data = (await res.json()) as { devices?: SpotifyApiDevice[] };
      const devices: SpotifyDevice[] = (data.devices ?? []).map(mapDevice);
      return c.json(devices);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- search ----- */
  .get("/search", async (c) => {
    const q = c.req.query("q");
    const type = c.req.query("type") ?? "track,playlist";

    if (!q) {
      return c.json({ error: "q obbligatorio" }, 400);
    }

    const params = new URLSearchParams({ q, type, limit: "20" });

    try {
      const res = await spotifyFetch(`/v1/search?${params}`);
      if (!res.ok) {
        return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
      }

      const data = (await res.json()) as {
        tracks?: { items?: SpotifyApiTrack[] };
        playlists?: { items?: (SpotifyApiPlaylist | null)[] };
      };
      const results: SpotifySearchResults = {
        tracks: (data.tracks?.items ?? []).map(mapTrack),
        playlists: (data.playlists?.items ?? [])
          .filter((p): p is SpotifyApiPlaylist => !!p)
          .map(mapPlaylist),
      };
      return c.json(results);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- user playlists ----- */
  .get("/playlists", async (c) => {
    try {
      const res = await spotifyFetch("/v1/me/playlists?limit=50");
      if (!res.ok) {
        return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
      }
      const data = (await res.json()) as { items?: (SpotifyApiPlaylist | null)[] };
      const playlists: SpotifyPlaylist[] = (data.items ?? [])
        .filter((p): p is SpotifyApiPlaylist => !!p)
        .map(mapPlaylist);
      return c.json(playlists);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  })

  /* ----- playlist tracks ----- */
  .get("/playlists/:id/tracks", async (c) => {
    const id = c.req.param("id");
    const params = new URLSearchParams({
      limit: "50",
      fields: "items(track(id,name,artists(name),album(name,images),duration_ms))",
    });

    try {
      const res = await spotifyFetch(`/v1/playlists/${id}/tracks?${params}`);
      if (!res.ok) {
        return c.json({ error: `Spotify ${res.status}` }, res.status as 400);
      }
      const data = (await res.json()) as { items?: Array<{ track?: SpotifyApiTrack | null }> };
      const tracks: SpotifyTrack[] = (data.items ?? [])
        .map((item) => item?.track)
        .filter((t): t is SpotifyApiTrack => !!t)
        .map(mapTrack);
      return c.json(tracks);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Errore" }, 500);
    }
  });
