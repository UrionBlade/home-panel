/**
 * Internal HTTP dispatcher.
 *
 * The routines runner needs to invoke the same logic as the public routes
 * (validation, auth, optimistic state updates, ...) without duplicating it.
 * Instead of extracting every handler into a plain function we re-enter the
 * Hono app via `app.fetch()` — a cheap in-process call that short-circuits
 * the network but exercises the whole middleware chain.
 *
 * The app reference is registered from `index.ts` after the router tree is
 * composed, to sidestep the obvious circular import.
 */

import { API_VERSION } from "@home-panel/shared";

type FetchLike = (req: Request) => Response | Promise<Response>;

let _appFetch: FetchLike | null = null;

export function registerAppFetch(fn: FetchLike): void {
  _appFetch = fn;
}

export class InternalFetchError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

/** Invoke `/api/v1/...` from inside the same process. `path` must NOT include
 * the `/api/vN` prefix — it's added here. Throws `InternalFetchError` on
 * non-2xx so callers can propagate a useful message. */
export async function internalFetch<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!_appFetch) {
    throw new Error("internalFetch called before registerAppFetch()");
  }
  const token = process.env.API_TOKEN;
  if (!token) {
    throw new Error("API_TOKEN missing — internal calls require it");
  }
  const url = `http://internal/api/${API_VERSION}${path}`;
  const req = new Request(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const res = await _appFetch(req);
  const text = await res.text();
  const parsed = text ? safeParseJson(text) : undefined;
  if (!res.ok) {
    const msg =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new InternalFetchError(res.status, parsed, msg);
  }
  return parsed as T;
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
