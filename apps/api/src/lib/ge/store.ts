/**
 * `GeTokenStore` implementation backed by the `ge_credentials` singleton row.
 *
 * All operations are synchronous because better-sqlite3 is synchronous and
 * the token pair is small enough to touch on every request without
 * performance concern.
 */

import { db } from "../../db/client.js";
import { geCredentials } from "../../db/schema.js";
import type { GeTokenPair } from "./auth.js";
import type { GeTokenStore } from "./client.js";

export const geTokenStore: GeTokenStore = {
  loadTokens(): GeTokenPair | null {
    const row = db.select().from(geCredentials).get();
    if (!row?.accessToken || !row.refreshToken || !row.expiresAt) return null;
    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
    };
  },

  saveTokens(tokens: GeTokenPair): void {
    const existing = db.select().from(geCredentials).get();
    const row = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      db.update(geCredentials).set(row).run();
    } else {
      db.insert(geCredentials).values(row).run();
    }
  },

  clearTokens(): void {
    db.delete(geCredentials).run();
  },
};

/** Read the `email` column of the credentials row. Not part of the
 * `GeTokenStore` interface because the auth client doesn't care about the
 * display email — only the routes do, for the "connected as X" banner. */
export function getCredentialsEmail(): string | null {
  const row = db.select().from(geCredentials).get();
  return row?.email ?? null;
}
