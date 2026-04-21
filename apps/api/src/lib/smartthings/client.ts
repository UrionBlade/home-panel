/**
 * Shared SmartThings HTTP client.
 *
 * Used by both the laundry (washer/dryer) and TV routes. The PAT is read from
 * the `smartthings_config` DB row first, then falls back to the
 * `SMARTTHINGS_PAT` environment variable.
 */

import { db } from "../../db/client.js";
import { type SmartThingsConfigRow, smartthingsConfig } from "../../db/schema.js";

export const ST_BASE = "https://api.smartthings.com/v1";

export function getSmartThingsConfig(): SmartThingsConfigRow | undefined {
  const row = db.select().from(smartthingsConfig).get();
  if (!row?.pat && process.env.SMARTTHINGS_PAT) {
    const base: SmartThingsConfigRow = row ?? {
      id: 1,
      pat: null,
      washerDeviceId: null,
      dryerDeviceId: null,
      tvDeviceId: null,
      updatedAt: "",
    };
    return { ...base, pat: process.env.SMARTTHINGS_PAT };
  }
  return row;
}

export function stHeaders(pat: string): Record<string, string> {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/json",
  };
}

export async function stFetch<T>(pat: string, path: string): Promise<T> {
  const res = await fetch(`${ST_BASE}${path}`, { headers: stHeaders(pat) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SmartThingsHttpError(res.status, `SmartThings ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function stPost<T>(pat: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${ST_BASE}${path}`, {
    method: "POST",
    headers: { ...stHeaders(pat), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SmartThingsHttpError(res.status, `SmartThings ${res.status}: ${text}`);
  }
  // Some SmartThings commands respond with 200 and empty body; tolerate.
  const text = await res.text().catch(() => "");
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

export class SmartThingsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SmartThingsHttpError";
  }
}

export interface SmartThingsDeviceRaw {
  deviceId: string;
  name: string;
  label: string;
  deviceTypeName?: string;
  manufacturerName?: string;
  presentationId?: string;
  components: Array<{
    id: string;
    capabilities: Array<{ id: string }>;
  }>;
}

export async function stListDevices(pat: string): Promise<SmartThingsDeviceRaw[]> {
  const data = await stFetch<{ items: SmartThingsDeviceRaw[] }>(pat, "/devices");
  return data.items ?? [];
}

export type SmartThingsStatus = {
  components: Record<
    string,
    Record<string, Record<string, { value: unknown; timestamp?: string; unit?: string }>>
  >;
};

export async function stGetDeviceStatus(pat: string, deviceId: string): Promise<SmartThingsStatus> {
  return stFetch<SmartThingsStatus>(pat, `/devices/${deviceId}/status`);
}

export interface SmartThingsCommand {
  component?: string;
  capability: string;
  command: string;
  arguments?: unknown[];
}

export async function stSendCommands(
  pat: string,
  deviceId: string,
  commands: SmartThingsCommand[],
): Promise<void> {
  const withDefaults = commands.map((c) => ({
    component: c.component ?? "main",
    capability: c.capability,
    command: c.command,
    arguments: c.arguments ?? [],
  }));
  await stPost(pat, `/devices/${deviceId}/commands`, { commands: withDefaults });
}
