import { apiClient } from "../api-client";

/**
 * Client WHEP minimale per il live delle IP camera.
 *
 * Flow:
 *   1. `new RTCPeerConnection()` con un transceiver recvonly video (+
 *      audio se la camera lo espone).
 *   2. `createOffer()` → SDP
 *   3. POST su `/api/v1/ip-cameras/:id/whep` con body = SDP offer,
 *      Content-Type application/sdp. Il backend fa proxy a MediaMTX.
 *   4. Ricevo SDP answer → `setRemoteDescription`.
 *   5. Il browser riceve i frame sul track; l'UI fa `video.srcObject = stream`.
 *
 * Stop: chiudere la PC. In futuro, quando aggiungeremo talk-back, un
 * secondo transceiver sendonly per l'audio del microfono dell'utente.
 */

interface StartArgs {
  /** Id del DB della camera (senza prefisso `ip:`). */
  cameraId: string;
  /** Element `<video>` su cui attaccare lo stream. */
  videoEl: HTMLVideoElement;
}

export interface WhepSession {
  pc: RTCPeerConnection;
  /** Location dato da MediaMTX — serve per DELETE di chiusura WHEP. */
  location: string | null;
  stop(): Promise<void>;
}

export async function startWhepSession({ cameraId, videoEl }: StartArgs): Promise<WhepSession> {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const remoteStream = new MediaStream();
  videoEl.srcObject = remoteStream;
  pc.ontrack = (event) => {
    /* Se il peer ci manda uno stream completo lo adottiamo; altrimenti
     * aggiungiamo il singolo track che MediaMTX ha negoziato. */
    const tracks = event.streams[0]?.getTracks() ?? (event.track ? [event.track] : []);
    for (const track of tracks) {
      if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
        remoteStream.addTrack(track);
      }
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  /* `apiClient` aggiunge Bearer token. Il backend proxy invia a
   * MediaMTX WHEP e ritorna l'SDP answer come testo. */
  const res = await apiClient.postRaw(
    `/api/v1/ip-cameras/${cameraId}/whep`,
    offer.sdp ?? "",
    "application/sdp",
  );
  if (!res.ok) {
    pc.close();
    throw new Error(`WHEP fallito (${res.status})`);
  }
  const answerSdp = await res.text();
  const location = res.headers.get("Location");

  await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

  async function stop() {
    try {
      for (const sender of pc.getSenders()) sender.track?.stop();
      pc.close();
    } catch {
      /* already closed */
    }
  }

  return { pc, location, stop };
}
