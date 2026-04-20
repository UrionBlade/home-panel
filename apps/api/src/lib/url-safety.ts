import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Validates a URL before performing a server-side fetch to prevent SSRF.
 * Blocks:
 *  - schemes other than https (http: optional via allowHttp)
 *  - hosts that resolve to private/loopback/cloud metadata IPs
 *  - malformed URLs
 */

const BLOCKED_CIDR_TESTS: Array<(ip: string) => boolean> = [
  // IPv4
  (ip) => ip === "0.0.0.0",
  (ip) => ip.startsWith("127."), // loopback
  (ip) => ip.startsWith("10."), // RFC1918
  (ip) => ip.startsWith("169.254."), // link-local / AWS metadata
  (ip) => ip.startsWith("192.168."), // RFC1918
  (ip) => {
    // 172.16.0.0 – 172.31.255.255
    const m = ip.match(/^172\.(\d+)\./);
    if (!m) return false;
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  },
  (ip) => ip === "100.100.100.200", // Alibaba Cloud metadata
  // IPv6
  (ip) => ip === "::1", // loopback
  (ip) => ip.toLowerCase().startsWith("fc"), // unique local
  (ip) => ip.toLowerCase().startsWith("fd"),
  (ip) => ip.toLowerCase().startsWith("fe80"), // link-local
];

function isBlockedIp(ip: string): boolean {
  return BLOCKED_CIDR_TESTS.some((test) => test(ip));
}

export interface SafeUrlOptions {
  allowHttp?: boolean;
}

export async function assertPublicUrl(raw: string, opts: SafeUrlOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("URL malformato");
  }

  const allowed = opts.allowHttp ? ["https:", "http:"] : ["https:"];
  if (!allowed.includes(url.protocol)) {
    throw new Error(`Schema non permesso: ${url.protocol}`);
  }

  // IPv6 literals in URLs are wrapped in brackets (e.g. `[::1]`); strip them
  // so `isIP` / DNS resolver receive the bare address.
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  // If the host is a literal IP, check it directly
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("IP non pubblico non permesso");
    }
    return url;
  }

  // Otherwise resolve via DNS and check each returned address
  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0) {
    throw new Error("DNS resolution vuota");
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr.address)) {
      throw new Error(`Host ${hostname} risolve a IP non pubblico`);
    }
  }
  return url;
}
