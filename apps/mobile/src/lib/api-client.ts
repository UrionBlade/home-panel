/**
 * Thin wrapper attorno a fetch.
 * - Inietta automaticamente Authorization: Bearer <VITE_API_TOKEN>
 * - Inietta Content-Type: application/json
 * - Normalizza errori HTTP in eccezioni tipizzate
 *
 * Usato in tandem con TanStack Query per caching/retry.
 */

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const token = import.meta.env.VITE_API_TOKEN as string | undefined;

if (!token) {
  console.error(
    "[apiClient] VITE_API_TOKEN non configurato. Crea apps/mobile/.env con il token Bearer corrispondente al backend.",
  );
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  headers?: HeadersInit;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestOptions,
): Promise<T> {
  if (!token) {
    throw new ApiError(0, null, "VITE_API_TOKEN mancante");
  }
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: string }).error)
        : `HTTP ${response.status}`;
    throw new ApiError(response.status, payload, message);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
  /**
   * POST "grezzo" che spedisce il body come string con un Content-Type
   * arbitrario. Pensato per WebRTC WHEP (SDP application/sdp) — non fa
   * il JSON.stringify e NON parsa la risposta: ritorna Response nuda
   * così il chiamante può leggere `.text()` + headers (es. Location).
   */
  postRaw(path: string, body: string, contentType: string, options?: RequestOptions) {
    if (!token) return Promise.reject(new ApiError(0, null, "VITE_API_TOKEN mancante"));
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
      body,
      signal: options?.signal,
    });
  },
  /**
   * Multipart upload. The browser sets the Content-Type header (with the
   * generated boundary) automatically when we hand it a `FormData`, so we
   * deliberately do NOT inject one here.
   */
  async postFormData<T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> {
    if (!token) throw new ApiError(0, null, "VITE_API_TOKEN mancante");
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
      body: formData,
      signal: options?.signal,
    });
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);
    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "error" in payload
          ? String((payload as { error: string }).error)
          : `HTTP ${response.status}`;
      throw new ApiError(response.status, payload, message);
    }
    return payload as T;
  },
};
