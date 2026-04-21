// One-shot discovery script: dumps every SmartThings device reachable by the
// configured PAT, along with its capabilities and current status. Useful to
// plan integrations (e.g. what a TV actually exposes on this account).
//
// Run from repo root:
//   pnpm --filter @home-panel/api exec tsx scripts/discover-smartthings.ts
//
// PAT is read from SMARTTHINGS_PAT env, with a fallback to the smartthings_config
// row in the local SQLite DB (if the user configured it via the Settings UI).

import "dotenv/config";
import { resolve } from "node:path";
import Database from "better-sqlite3";

const ST_BASE = "https://api.smartthings.com/v1";

function loadPat(): string {
  if (process.env.SMARTTHINGS_PAT) return process.env.SMARTTHINGS_PAT;

  const dbPath = process.env.DATABASE_URL ?? resolve(process.cwd(), "data/home-panel.sqlite");
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db.prepare("SELECT pat FROM smartthings_config WHERE id = 1").get() as
      | { pat: string | null }
      | undefined;
    db.close();
    if (row?.pat) return row.pat;
  } catch {
    // Ignore DB errors and fall through to the final throw.
  }

  throw new Error(
    "SmartThings PAT not found. Set SMARTTHINGS_PAT in apps/api/.env or configure it via Settings → Lavatrice.",
  );
}

async function st<T>(pat: string, path: string): Promise<T> {
  const res = await fetch(`${ST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${pat}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GET ${path} → ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

type Device = {
  deviceId: string;
  name: string;
  label: string;
  deviceTypeName?: string;
  manufacturerName?: string;
  presentationId?: string;
  components: Array<{ id: string; capabilities: Array<{ id: string }> }>;
};

async function main() {
  const pat = loadPat();
  console.log("Fetching SmartThings devices…\n");

  const { items } = await st<{ items: Device[] }>(pat, "/devices");

  for (const d of items) {
    const caps = d.components.flatMap((c) => c.capabilities.map((cap) => cap.id));
    console.log("─".repeat(72));
    console.log(`Label:        ${d.label || d.name}`);
    console.log(`Name:         ${d.name}`);
    console.log(`Device ID:    ${d.deviceId}`);
    if (d.deviceTypeName) console.log(`Type:         ${d.deviceTypeName}`);
    if (d.manufacturerName) console.log(`Manufacturer: ${d.manufacturerName}`);
    if (d.presentationId) console.log(`Presentation: ${d.presentationId}`);
    console.log(`Capabilities (${caps.length}):`);
    for (const c of caps) console.log(`  - ${c}`);

    try {
      const status = await st<{ components: Record<string, unknown> }>(
        pat,
        `/devices/${d.deviceId}/status`,
      );
      console.log("Status:");
      console.log(JSON.stringify(status.components, null, 2));
    } catch (err) {
      console.log(`Status: <error: ${(err as Error).message}>`);
    }
    console.log();
  }

  console.log("─".repeat(72));
  console.log(`Done. ${items.length} device(s) total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
