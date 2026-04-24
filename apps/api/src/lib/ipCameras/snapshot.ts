import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { IpCameraRow } from "../../db/schema.js";

/**
 * Estrae un singolo frame JPEG da uno stream RTSP usando ffmpeg.
 *
 * Pattern: leggere N secondi dal RTSP e pescare il primo keyframe che
 * arriva. Con H.265 le telecamere casalinghe spengono il keyframe
 * interval fra 1 e 4 secondi, quindi `-t 5` copre quasi sempre il caso
 * peggiore. Se il frame non arriva entro il timeout ffmpeg esce con
 * codice ≠ 0 e lasciamo decidere al chiamante come gestire l'errore.
 *
 * Sicurezza: le credenziali vengono inserite nell'URL RTSP e passate
 * via argv. Non finiscono mai nel log dell'app (ffmpeg logga su stderr
 * per suo conto, lo filtriamo sotto).
 */
export interface SnapshotOptions {
  /** Timeout totale (ms). Default 6000. */
  timeoutMs?: number;
  /** Forza substream se disponibile (default true: molto più leggero). */
  preferSubstream?: boolean;
}

export async function captureSnapshot(
  row: IpCameraRow,
  opts: SnapshotOptions = {},
): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const path =
    opts.preferSubstream !== false && row.substreamPath ? row.substreamPath : row.streamPath;
  const url = buildRtspUrl(row, path);

  return new Promise<Buffer>((resolve, reject) => {
    const args = [
      "-loglevel",
      "error",
      "-rtsp_transport",
      "tcp",
      "-i",
      url,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      "-f",
      "image2pipe",
      "-vcodec",
      "mjpeg",
      "-",
    ];

    const child: ChildProcessWithoutNullStreams = spawn("ffmpeg", args);
    const chunks: Buffer[] = [];
    let stderr = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill("SIGKILL");
        reject(new Error(`ffmpeg snapshot timeout (${timeoutMs}ms)`));
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      settle(() => {
        clearTimeout(timer);
        reject(err);
      });
    });

    child.on("close", (code) => {
      settle(() => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`ffmpeg exit ${code}: ${stderr.trim().split("\n").slice(-1)[0]}`));
          return;
        }
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) {
          reject(new Error("ffmpeg produced empty frame"));
          return;
        }
        resolve(buf);
      });
    });
  });
}

/**
 * Costruisce l'URL RTSP completo. Le credenziali vengono
 * percent-encoded perché i caratteri speciali in password (`@`, `!`,
 * `/`, `:`) rompono il parse altrimenti.
 */
export function buildRtspUrl(row: IpCameraRow, path: string): string {
  const userInfo =
    row.username && row.password
      ? `${encodeURIComponent(row.username)}:${encodeURIComponent(row.password)}@`
      : row.username
        ? `${encodeURIComponent(row.username)}@`
        : "";
  const normalisedPath = path.startsWith("/") ? path : `/${path}`;
  return `rtsp://${userInfo}${row.host}:${row.port}${normalisedPath}`;
}
