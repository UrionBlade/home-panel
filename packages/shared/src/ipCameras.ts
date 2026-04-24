/**
 * Generic IP cameras — contratto client/server.
 *
 * Le credenziali RTSP (username/password) NON vengono mai esposte al
 * client: il backend le usa internamente per generare snapshot via
 * ffmpeg e serve solo JPEG al browser. Il client manda le credenziali
 * una sola volta quando crea / aggiorna la camera; dopo quel punto il
 * backend non le rilascia più.
 */

export interface IpCamera {
  id: string;
  name: string;
  host: string;
  port: number;
  /** Path del main stream (es. "/11" su CamHiPro / Anpviz). */
  streamPath: string;
  /** Path del sub-stream (es. "/12"). Se popolato, il client può
   * preferirlo per risparmio banda; null se la camera ne ha solo uno. */
  substreamPath: string | null;
  /** True = visibile e controllabile. False = nascosta temporaneamente. */
  enabled: boolean;
  /** Assegnazione stanza, null = "Senza stanza". */
  roomId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Flag informativo: true se le credenziali sono state fornite. Il
   * valore reale non esce mai dal backend. */
  hasCredentials: boolean;
}

export interface IpCameraCreateInput {
  name: string;
  host: string;
  port?: number;
  username?: string | null;
  password?: string | null;
  streamPath?: string;
  substreamPath?: string | null;
  roomId?: string | null;
}

export interface IpCameraUpdateInput {
  name?: string;
  host?: string;
  port?: number;
  /** Passa `null` per rimuovere le credenziali. Ometti il campo per
   * lasciarle invariate (evita di dover rimandare la password ogni
   * volta che rinomini). */
  username?: string | null;
  password?: string | null;
  streamPath?: string;
  substreamPath?: string | null;
  roomId?: string | null;
  enabled?: boolean;
}
