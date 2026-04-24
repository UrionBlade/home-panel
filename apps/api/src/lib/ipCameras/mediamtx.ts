import type { IpCameraRow } from "../../db/schema.js";
import { buildRtspUrl } from "./snapshot.js";

/**
 * Client HTTP per il control plane di MediaMTX (API v3 su porta 9997).
 *
 * Cosa facciamo qui:
 *  - `pathName(cameraId)` → nome stabile usato come slug nel path MediaMTX.
 *  - `upsertPath(row)`     → crea (o rimpiazza) il path che pesca dal
 *                            RTSP della camera.
 *  - `deletePath(cameraId)`→ rimuove il path quando la camera viene
 *                            cancellata dal DB.
 *  - `reconcileAll(rows)`  → all'avvio del backend sincronizza il DB con
 *                            MediaMTX (utile dopo un restart del sidecar).
 *
 * Tutto è "best effort": i problemi di MediaMTX non devono mai far
 * fallire le API REST user-facing. Logghiamo l'errore e andiamo avanti —
 * l'utente vedrà comunque l'errore quando proverà a far partire la
 * live, e la route snapshot JPEG funziona a prescindere.
 */

const API_BASE = process.env.MEDIAMTX_API_URL ?? "http://mediamtx:9997";
const RTSP_INTERNAL_BASE = process.env.MEDIAMTX_RTSP_INTERNAL ?? "rtsp://mediamtx:8554";

/** Path slug per una IP camera. Non usare l'id grezzo (UUID contiene
 * caratteri che MediaMTX non accetta per i path names). */
export function pathName(cameraId: string): string {
  return `ipcam_${cameraId.replace(/-/g, "")}`;
}

/** URL RTSP interno al cluster Docker per pull dal nostro codice
 * (es. snapshot-fallback). Oggi non lo usiamo ma utile in futuro. */
export function internalRtspUrl(cameraId: string): string {
  return `${RTSP_INTERNAL_BASE}/${pathName(cameraId)}`;
}

interface PathConfig {
  /** RTSP sorgente con credenziali (le teniamo solo lato server). */
  source: string;
  /** MediaMTX pulla la camera solo quando qualcuno si connette al
   * path WebRTC/HLS — così non teniamo aperta la RTSP a vuoto. */
  sourceOnDemand: boolean;
  sourceOnDemandStartTimeout: string;
  sourceOnDemandCloseAfter: string;
  /** Alcune camere H.265 richiedono rtsp_transport=tcp: il firmware
   * chiude su UDP dopo qualche secondo di drift. */
  rtspTransport: "tcp" | "udp" | "automatic";
}

function buildPathConfig(row: IpCameraRow): PathConfig {
  /* Preferiamo il substream per il live remoto: H.265 640x352 è più
   * leggero da transcodificare al volo se MediaMTX dovrà fallback. Il
   * main è ancora raggiungibile con un path separato se un giorno ci
   * serve. */
  const sourcePath = row.substreamPath ?? row.streamPath;
  return {
    source: buildRtspUrl(row, sourcePath),
    sourceOnDemand: true,
    sourceOnDemandStartTimeout: "10s",
    sourceOnDemandCloseAfter: "15s",
    rtspTransport: "tcp",
  };
}

async function callMediamtx(
  method: "POST" | "PATCH" | "DELETE" | "GET",
  endpoint: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Aggiunge o rimpiazza il path di una camera. La REST API di MediaMTX
 * v3 distingue `add` / `replace` in due endpoint distinti; proviamo
 * add, e su 400 (path esistente) cadiamo su replace.
 */
export async function upsertPath(row: IpCameraRow): Promise<void> {
  const name = pathName(row.id);
  const cfg = buildPathConfig(row);
  try {
    const addRes = await callMediamtx("POST", `/v3/config/paths/add/${name}`, cfg);
    if (addRes.status === 400) {
      /* Path già esistente: replace in-place. Idempotente. */
      const replaceRes = await callMediamtx("POST", `/v3/config/paths/replace/${name}`, cfg);
      if (!replaceRes.ok) {
        const txt = await replaceRes.text().catch(() => "");
        console.error(`[mediamtx] replace path ${name} failed ${replaceRes.status}: ${txt}`);
      }
      return;
    }
    if (!addRes.ok) {
      const txt = await addRes.text().catch(() => "");
      console.error(`[mediamtx] add path ${name} failed ${addRes.status}: ${txt}`);
    }
  } catch (err) {
    console.error(`[mediamtx] upsert path ${name} errored:`, err);
  }
}

export async function deletePath(cameraId: string): Promise<void> {
  const name = pathName(cameraId);
  try {
    const res = await callMediamtx("DELETE", `/v3/config/paths/delete/${name}`);
    if (!res.ok && res.status !== 404) {
      const txt = await res.text().catch(() => "");
      console.error(`[mediamtx] delete path ${name} failed ${res.status}: ${txt}`);
    }
  } catch (err) {
    console.error(`[mediamtx] delete path ${name} errored:`, err);
  }
}

/**
 * All'avvio del backend riconcilia DB → MediaMTX: per ogni IP camera
 * nel DB forza un upsert del path, così anche dopo un restart del
 * sidecar ogni camera ha il suo path pronto.
 */
export async function reconcileAll(rows: IpCameraRow[]): Promise<void> {
  if (rows.length === 0) return;
  console.log(`[mediamtx] reconcile: upsert ${rows.length} path(s)`);
  await Promise.all(rows.filter((r) => r.enabled).map((r) => upsertPath(r)));
}

/**
 * Proxy del WHEP WebRTC signaling. Il browser manda un SDP offer in
 * body, MediaMTX risponde con un SDP answer + Location header.
 * Facciamo il pass-through così il client non deve mai raggiungere
 * direttamente MediaMTX — l'autenticazione sta sull'API.
 */
const WEBRTC_BASE = process.env.MEDIAMTX_WEBRTC_URL ?? "http://mediamtx:8889";

export async function whepOffer(
  cameraId: string,
  sdpOffer: string,
): Promise<{ status: number; body: string; location: string | null }> {
  const name = pathName(cameraId);
  const url = `${WEBRTC_BASE}/${name}/whep`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: sdpOffer,
  });
  const body = await res.text();
  return { status: res.status, body, location: res.headers.get("Location") };
}
