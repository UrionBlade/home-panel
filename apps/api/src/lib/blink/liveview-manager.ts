/**
 * Blink liveview manager.
 *
 * Blink exposes live video over an RTSPS stream whose TLS handshake ffmpeg's
 * RTSP demuxer doesn't drive correctly (it reads TLS bytes as "invalid RTSP
 * data" and bails). We work around it by using MediaMTX as a TLS terminator:
 *
 *    Blink rtsps://…  ──(MediaMTX)──►  rtsp://127.0.0.1:PORT/stream  ──(ffmpeg)──►  HLS
 *
 * MediaMTX's gortsplib RTSP stack handles Blink's TLS handshake reliably;
 * ffmpeg then reads plain RTSP from localhost, avoiding the demuxer bug.
 *
 * Lifecycle per session:
 *   1. Ask Blink for a liveview session (server URL + command_id + duration).
 *   2. Spawn MediaMTX with a generated YAML config that pulls the rtsps and
 *      republishes it as plain RTSP on a random local port.
 *   3. Wait a beat for MediaMTX to open the upstream.
 *   4. Spawn ffmpeg to read the local RTSP and write low-latency HLS to a
 *      temp dir.
 *   5. Serve HLS playlist + segments through the backend routes.
 *   6. Send Blink "extend" pings every ~18s so the upstream doesn't expire.
 *   7. Tear everything down on stop / idle / hard cap.
 *
 * Requires `mediamtx` and `ffmpeg` in $PATH. If MediaMTX is missing we fall
 * back to ffmpeg-direct (which currently fails on Blink RTSPS but keeps the
 * code paths exercisable for when/if ffmpeg learns the trick).
 */

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { URL } from "node:url";
import type { BlinkSession } from "./client.js";
import {
  type BlinkDeviceFamily,
  type BlinkLiveviewSession as BlinkLiveviewSessionResult,
  blinkExtendLiveview,
  blinkStartLiveview,
  blinkStopLiveview,
} from "./client.js";

/* Blink sessions time out after ~30s without extension. Keep pinging sooner. */
const EXTEND_INTERVAL_MS = 18_000;
/* Idle timeout: if no segment has been requested for this long, tear down. */
const IDLE_TIMEOUT_MS = 45_000;
/* Maximum overall session duration — hard cap to prevent runaway streams. */
const MAX_SESSION_MS = 10 * 60_000;
/* How long to wait between spawning MediaMTX and spawning ffmpeg so the
 * upstream RTSP port is actually listening. */
const MEDIAMTX_WARMUP_MS = 1_200;

export interface LiveSession {
  id: string;
  cameraId: string;
  deviceType: BlinkDeviceFamily;
  networkId: string;
  commandId: number;
  dir: string;
  playlistPath: string;
  ffmpeg: ChildProcess;
  mediamtx: ChildProcess | null;
  /** Unix ms of the last HLS segment request — reset by the stream route. */
  lastActivityAt: number;
  createdAt: number;
  extendTimer: NodeJS.Timeout;
  idleTimer: NodeJS.Timeout;
  maxTimer: NodeJS.Timeout;
  /** Cached session snapshot for extend/stop — Blink requires the same auth. */
  apiSession: BlinkSession;
  stopped: boolean;
}

const sessions = new Map<string, LiveSession>();

/** Read-only snapshot for the route layer. */
export function getSession(sessionId: string): LiveSession | undefined {
  return sessions.get(sessionId);
}

export function touchSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) s.lastActivityAt = Date.now();
}

export function allSessions(): LiveSession[] {
  return Array.from(sessions.values());
}

interface StartOptions {
  cameraId: string;
  deviceType: BlinkDeviceFamily;
  networkId: string;
  apiSession: BlinkSession;
}

/**
 * Returns true if the `mediamtx` binary is callable. Re-checked on every
 * session start so that `brew install mediamtx` doesn't require a backend
 * restart. spawn() sets `error` to ENOENT when the binary is missing; any
 * non-error result (even a non-zero exit code) means the binary is there. */
function isMediaMtxAvailable(): boolean {
  const probe = spawnSync("mediamtx", ["--version"], {
    stdio: "ignore",
    timeout: 3_000,
  });
  if (probe.error) {
    return false;
  }
  return true;
}

/** Pick a free TCP port by letting the OS bind :0 then closing immediately. */
async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error("impossibile ottenere una porta libera"));
      }
    });
  });
}

interface MediaMtxHandle {
  proc: ChildProcess;
  localRtspUrl: string;
  configPath: string;
}

/**
 * Spawn MediaMTX configured as an rtsps→rtsp bridge for a single upstream.
 * Returns the local RTSP URL ffmpeg should read.
 */
/**
 * Probe Blink's RTSPS server to extract its SHA-256 certificate fingerprint.
 * Blink uses an internal Amazon CA that isn't in the system trust store, so
 * MediaMTX rejects the TLS handshake with "unknown authority". Pinning the
 * fingerprint in the path config makes MediaMTX skip CA validation and
 * accept the server only if the cert matches — good enough for a session
 * whose URL is already a one-shot bearer token.
 */
async function getServerFingerprint(rtspsUrl: string): Promise<string> {
  const url = new URL(rtspsUrl);
  const host = url.hostname;
  const port = Number(url.port || 443);
  return new Promise((resolve, reject) => {
    const sock = tlsConnect({
      host,
      port,
      servername: host,
      rejectUnauthorized: false,
    });
    sock.setTimeout(4_000, () => {
      sock.destroy(new Error("TLS probe timeout"));
    });
    sock.once("secureConnect", () => {
      const cert = sock.getPeerCertificate(false);
      sock.end();
      if (!cert || !cert.fingerprint256) {
        reject(new Error("Blink cert has no fingerprint"));
        return;
      }
      resolve(cert.fingerprint256);
    });
    sock.once("error", reject);
  });
}

async function spawnMediaMtx(rtspsUrl: string, dir: string): Promise<MediaMtxHandle> {
  const port = await pickFreePort();
  const configPath = join(dir, "mediamtx.yml");

  /* Probe Blink's cert fingerprint. MediaMTX wants it WITHOUT colons
   * (e.g. "b1bfa7..." not "B1:BF:A7:..."), so normalise before writing. */
  let fingerprint = "";
  try {
    const raw = await getServerFingerprint(rtspsUrl);
    fingerprint = raw.replace(/:/g, "").toLowerCase();
  } catch (err) {
    console.warn("[blink-live] could not probe server fingerprint:", err);
  }

  /* MediaMTX config is version-sensitive: field names and types have drifted
   * across 1.x releases. Minimal-but-complete config:
   *   • logLevel     — cheap observability
   *   • rtspAddress  — only non-default port we enforce (avoids collisions)
   *   • paths.stream — the upstream we bridge
   *   • sourceFingerprint — pins Blink's self-signed cert */
  const lines = [
    "logLevel: warn",
    `rtspAddress: 127.0.0.1:${port}`,
    "paths:",
    "  stream:",
    `    source: ${rtspsUrl}`,
    /* Pull from Blink only once ffmpeg actually connects. Blink terminates
     * the RTSPS session if no consumer drains the stream, which MediaMTX
     * otherwise triggers by pulling eagerly. */
    "    sourceOnDemand: yes",
    "    sourceOnDemandStartTimeout: 10s",
    "    sourceOnDemandCloseAfter: 10s",
  ];
  if (fingerprint) {
    lines.push(`    sourceFingerprint: "${fingerprint}"`);
  }
  const config = lines.join("\n");
  writeFileSync(configPath, config);

  const proc = spawn("mediamtx", [configPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trim();
    if (msg) console.log(`[mediamtx] ${msg}`);
  });
  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trim();
    if (msg) console.error(`[mediamtx] ${msg}`);
  });

  /* Wait for MediaMTX to open its RTSP port. We don't have a readiness
   * probe so a short sleep is the pragmatic choice. */
  await new Promise((r) => setTimeout(r, MEDIAMTX_WARMUP_MS));

  return {
    proc,
    localRtspUrl: `rtsp://127.0.0.1:${port}/stream`,
    configPath,
  };
}

/* Serialize start calls so React StrictMode's double-mount or a user who
 * double-taps doesn't race two sessions into MediaMTX's fixed ports. */
let startQueue: Promise<unknown> = Promise.resolve();

export async function startLiveSession(opts: StartOptions): Promise<LiveSession> {
  const pending = startQueue.then(async () => {
    /* Tear down any previous session before starting a new one. MediaMTX
     * binds default ports for every enabled protocol (RTMP 1935, HLS 8888,
     * WebRTC 8189, SRT 8890, UDP RTP :8000…) and two instances fight for
     * them. Waiting for the previous mediamtx to exit (done in
     * stopLiveSession) guarantees the ports are free before we spawn. */
    if (sessions.size > 0) {
      const existing = Array.from(sessions.keys());
      await Promise.all(existing.map((id) => stopLiveSession(id)));
    }
    return doStartLiveSession(opts);
  });
  startQueue = pending.catch(() => {});
  return pending;
}

async function doStartLiveSession(opts: StartOptions): Promise<LiveSession> {
  /* Blink returns 409 "System is busy" when a previous session on the same
   * camera hasn't been released server-side yet (common on quick retries or
   * StrictMode double-mount). Back off briefly and retry a couple of times
   * instead of surfacing the error. */
  let blink: BlinkLiveviewSessionResult | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      blink = await blinkStartLiveview(
        opts.apiSession,
        opts.deviceType,
        opts.networkId,
        opts.cameraId,
      );
      break;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isBusy = msg.includes("409") || msg.toLowerCase().includes("busy");
      if (!isBusy || attempt === 2) throw err;
      console.warn(`[blink-live] Blink busy, retrying in 1.5s (attempt ${attempt + 1}/3)…`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!blink) throw lastErr ?? new Error("Impossibile avviare liveview");

  const id = randomUUID();
  const dir = mkdtempSync(join(tmpdir(), `blink-live-${id}-`));
  const playlistPath = join(dir, "stream.m3u8");

  /* Decide where ffmpeg should read from. When MediaMTX is present we go
   * through it (reliable TLS). Otherwise we point ffmpeg straight at Blink,
   * which currently doesn't work but keeps the path open for future fixes. */
  let ffmpegInputUrl = blink.server;
  let mediamtx: MediaMtxHandle | null = null;
  const hasMediaMtx = isMediaMtxAvailable();
  if (hasMediaMtx) {
    try {
      mediamtx = await spawnMediaMtx(blink.server, dir);
      ffmpegInputUrl = mediamtx.localRtspUrl;
      console.log(`[blink-live] MediaMTX bridge ${id} → ${ffmpegInputUrl}`);
    } catch (err) {
      console.error(`[blink-live] MediaMTX spawn failed (${id}):`, err);
      mediamtx = null;
    }
  } else {
    console.warn(
      `[blink-live] mediamtx non trovato in PATH — installalo (brew install mediamtx) e riavvia il backend per abilitare il TLS terminator. Procedo con ffmpeg diretto (probabile fallimento su Blink RTSPS).`,
    );
  }

  /* Low-latency HLS: 2s segments, keep only the last 3. */
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-rtsp_transport",
    "tcp",
    "-analyzeduration",
    "5000000",
    "-probesize",
    "5000000",
    "-i",
    ffmpegInputUrl,
    "-map",
    "0:v:0?",
    "-map",
    "0:a?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "3",
    "-hls_flags",
    "delete_segments+independent_segments+omit_endlist",
    "-hls_segment_filename",
    join(dir, "seg-%03d.ts"),
    playlistPath,
  ];

  const ffmpeg = spawn("ffmpeg", args, {
    stdio: ["ignore", "ignore", "pipe"],
  });
  let ffmpegExited = false;
  ffmpeg.on("error", (err) => {
    ffmpegExited = true;
    console.error(`[blink-live] ffmpeg spawn error (${id}):`, err.message);
  });
  ffmpeg.on("exit", (code, signal) => {
    ffmpegExited = true;
    if (code !== 0 && signal !== "SIGKILL" && signal !== "SIGTERM") {
      console.error(`[blink-live] ffmpeg exited (${id}) code=${code} signal=${signal}`);
    }
    const session = sessions.get(id);
    if (session && !session.stopped) {
      void stopLiveSession(id).catch(() => {});
    }
  });
  if (ffmpeg.stderr) {
    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString("utf8").trim();
      if (msg) console.error(`[blink-live ffmpeg ${id}] ${msg}`);
    });
  }

  if (ffmpegExited) {
    rmSync(dir, { recursive: true, force: true });
    if (mediamtx && !mediamtx.proc.killed) mediamtx.proc.kill("SIGTERM");
    await blinkStopLiveview(
      opts.apiSession,
      opts.deviceType,
      opts.networkId,
      opts.cameraId,
      blink.commandId,
    ).catch(() => {});
    throw new Error("ffmpeg non disponibile nel PATH");
  }

  const now = Date.now();
  const extendTimer = setInterval(() => {
    void blinkExtendLiveview(
      opts.apiSession,
      opts.deviceType,
      opts.networkId,
      opts.cameraId,
      blink.commandId,
    ).catch((err) => {
      console.error(`[blink-live] extend failed (${id}):`, err);
    });
  }, EXTEND_INTERVAL_MS);

  const idleTimer = setInterval(() => {
    const session = sessions.get(id);
    if (!session) return;
    if (Date.now() - session.lastActivityAt > IDLE_TIMEOUT_MS) {
      console.log(`[blink-live] session ${id} idle — tearing down`);
      void stopLiveSession(id).catch(() => {});
    }
  }, 5_000);

  const maxTimer = setTimeout(() => {
    console.log(`[blink-live] session ${id} hit hard cap — tearing down`);
    void stopLiveSession(id).catch(() => {});
  }, MAX_SESSION_MS);

  const session: LiveSession = {
    id,
    cameraId: opts.cameraId,
    deviceType: opts.deviceType,
    networkId: opts.networkId,
    commandId: blink.commandId,
    dir,
    playlistPath,
    ffmpeg,
    mediamtx: mediamtx?.proc ?? null,
    lastActivityAt: now,
    createdAt: now,
    extendTimer,
    idleTimer,
    maxTimer,
    apiSession: opts.apiSession,
    stopped: false,
  };
  sessions.set(id, session);
  console.log(`[blink-live] started ${id} (${opts.deviceType} ${opts.cameraId}) → ${blink.server}`);
  return session;
}

/** Wait for a child process to exit (resolves immediately if already gone). */
function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.killed) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      proc.removeListener("exit", onExit);
      resolve();
    }, timeoutMs);
    const onExit = () => {
      clearTimeout(t);
      resolve();
    };
    proc.once("exit", onExit);
  });
}

export async function stopLiveSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.stopped) return;
  session.stopped = true;
  sessions.delete(sessionId);

  clearInterval(session.extendTimer);
  clearInterval(session.idleTimer);
  clearTimeout(session.maxTimer);

  /* SIGTERM ffmpeg + mediamtx, then block until both actually exit so a
   * quickly-started replacement session doesn't collide on ports. */
  if (!session.ffmpeg.killed) session.ffmpeg.kill("SIGTERM");
  if (session.mediamtx && !session.mediamtx.killed) session.mediamtx.kill("SIGTERM");

  await Promise.all([
    waitForExit(session.ffmpeg, 2_500),
    session.mediamtx ? waitForExit(session.mediamtx, 2_500) : Promise.resolve(),
  ]);

  /* Escalate if any child ignored SIGTERM. */
  if (!session.ffmpeg.killed && session.ffmpeg.exitCode === null) {
    session.ffmpeg.kill("SIGKILL");
  }
  if (session.mediamtx && !session.mediamtx.killed && session.mediamtx.exitCode === null) {
    session.mediamtx.kill("SIGKILL");
  }

  /* Best-effort Blink /stop — often 404s on consumer cams, swallow quietly. */
  await blinkStopLiveview(
    session.apiSession,
    session.deviceType,
    session.networkId,
    session.cameraId,
    session.commandId,
  ).catch(() => {});

  setTimeout(() => rmSync(session.dir, { recursive: true, force: true }), 500);

  console.log(`[blink-live] stopped ${sessionId}`);
}

/** Called once at backend shutdown to flush every active stream. */
export async function stopAllLiveSessions(): Promise<void> {
  const ids = Array.from(sessions.keys());
  await Promise.all(ids.map((id) => stopLiveSession(id)));
}
