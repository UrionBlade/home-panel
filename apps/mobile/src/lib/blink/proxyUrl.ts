const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

/**
 * Blink thumbnails e media URL richiedono un'autenticazione che il
 * browser non può fornire direttamente: il backend li proxa aggiungendo
 * il Bearer token dell'account. Questa utility costruisce l'URL di
 * proxy per una risorsa Blink arbitraria.
 *
 * Usage:
 *   const src = proxyUrl(camera.thumbnailUrl);
 */
export function proxyUrl(blinkUrl: string | null | undefined): string | null {
  if (!blinkUrl) return null;
  return `${API_BASE}/api/v1/blink/proxy?url=${encodeURIComponent(blinkUrl)}`;
}
