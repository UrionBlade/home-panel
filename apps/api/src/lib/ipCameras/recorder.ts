import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { db } from "../../db/client.js";
import { type IpCameraRow, ipCameraRecordings } from "../../db/schema.js";
import { buildRtspUrl } from "./snapshot.js";

/**
 * Recorder manager per IP camera. Una ffmpeg child process per camera
 * attiva, output su disco in `.mp4`. `-c copy` significa nessun
 * transcoding: l'overhead CPU è quasi zero perché copiamo i pacchetti
 * H.265 così come arrivano.
 *
 * Il backend tiene traccia delle sessioni attive in memoria (cameraId
 * → handle). Al termine (stop esplicito o crash del processo) scriviamo
 * il row su `ip_camera_recordings` con dimensione e durata.
 */

const RECORDINGS_DIR = process.env.IPCAM_RECORDINGS_DIR ?? "/clips/ipcam";

interface ActiveRecording {
  id: string;
  cameraId: string;
  filePath: string;
  startedAt: Date;
  proc: ReturnType<typeof spawn>;
}

const active = new Map<string, ActiveRecording>();

/** Restituisce l'ID della recording attiva per una camera (o null). */
export function activeRecordingId(cameraId: string): string | null {
  return active.get(cameraId)?.id ?? null;
}

export interface StartResult {
  id: string;
  filePath: string;
  startedAt: string;
}

export function startRecording(row: IpCameraRow, label?: string): StartResult {
  if (active.has(row.id)) {
    throw new Error("Recording già in corso per questa camera");
  }
  mkdirSync(RECORDINGS_DIR, { recursive: true });
  const id = randomUUID();
  const filename = `${row.id}_${Date.now()}.mp4`;
  const filePath = join(RECORDINGS_DIR, filename);
  /* Uso il main stream a qualità piena per le recording (il substream
   * è per il live remoto). Se il main non esiste la riga non lo avrà
   * e `buildRtspUrl` ci restituirà comunque un path valido. */
  const url = buildRtspUrl(row, row.streamPath);

  const args = [
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    url,
    "-c",
    "copy",
    "-movflags",
    "+frag_keyframe+empty_moov",
    "-f",
    "mp4",
    filePath,
  ];
  const proc = spawn("ffmpeg", args);
  proc.stderr?.on("data", (chunk: Buffer) => {
    console.log(`[recorder ${id}] ${chunk.toString().trim()}`);
  });
  proc.on("close", (code) => {
    const rec = active.get(row.id);
    if (!rec || rec.id !== id) return;
    active.delete(row.id);
    finalizeRecording(rec, code ?? -1, label);
  });

  active.set(row.id, {
    id,
    cameraId: row.id,
    filePath,
    startedAt: new Date(),
    proc,
  });

  return { id, filePath, startedAt: new Date().toISOString() };
}

export function stopRecording(cameraId: string): boolean {
  const rec = active.get(cameraId);
  if (!rec) return false;
  /* SIGTERM fa uscire ffmpeg in modo pulito: scrive il moov e chiude
   * il file così il MP4 resta playable. SIGKILL lascerebbe un file
   * corrotto. */
  rec.proc.kill("SIGTERM");
  return true;
}

function finalizeRecording(rec: ActiveRecording, _exitCode: number, label?: string): void {
  const endedAt = new Date();
  const durationSeconds = Math.round((endedAt.getTime() - rec.startedAt.getTime()) / 1000);
  let sizeBytes = 0;
  try {
    sizeBytes = statSync(rec.filePath).size;
  } catch {
    /* File missing: skip row — la recording è fallita subito. */
    console.warn(`[recorder] file mancante ${rec.filePath}, skip row DB`);
    return;
  }
  db.insert(ipCameraRecordings)
    .values({
      id: rec.id,
      cameraId: rec.cameraId,
      filePath: rec.filePath,
      startedAt: rec.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSeconds,
      sizeBytes,
      label: label ?? null,
    })
    .run();
  console.log(
    `[recorder] saved ${rec.id} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB, ${durationSeconds}s)`,
  );
}

/** Stop tutte le recording al shutdown. */
export function stopAll(): void {
  for (const rec of active.values()) rec.proc.kill("SIGTERM");
}
