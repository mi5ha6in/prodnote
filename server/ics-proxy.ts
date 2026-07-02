/**
 * Guard for the ICS proxy: only plain http(s) calendars, and no obvious
 * private/loopback targets (the proxy runs with server-side network access).
 */
export function isSafeIcsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (host === "::1" || host.startsWith("[")) {
    return false;
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
      return false;
    }
  }

  return true;
}

export const ICS_MAX_BYTES = 5_000_000;
export const ICS_TIMEOUT_MS = 15_000;
