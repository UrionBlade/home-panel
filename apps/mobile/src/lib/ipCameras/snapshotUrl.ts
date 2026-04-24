const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const API_TOKEN = import.meta.env.VITE_API_TOKEN ?? "";

/**
 * URL dell'endpoint snapshot per una IP camera. Include il token in
 * query string perché <img> non può mandare header Authorization.
 * Aggiungere `?_t=` cache-buster in chiamata quando serve forzare un
 * nuovo frame (polling live).
 */
export function ipCameraSnapshotUrl(cameraId: string): string {
  return `${API_BASE}/api/v1/ip-cameras/${cameraId}/snapshot.jpg?token=${encodeURIComponent(API_TOKEN)}`;
}
