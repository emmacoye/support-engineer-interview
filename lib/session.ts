/** Read `session` cookie from Next/tRPC `req` (Pages `cookies` / `headers.cookie`, or Fetch `headers.get("cookie")`). */
export function getSessionCookieToken(req: unknown): string | undefined {
  const r = req as { cookies?: { session?: string }; headers?: { cookie?: string; get?: (n: string) => string } };
  if (r?.cookies?.session) return r.cookies.session;
  const hdr = r?.headers;
  const cookieHeader =
    hdr?.cookie ?? (typeof hdr?.get === "function" ? hdr.get("cookie") || "" : "");
  // RFC 6265 allows `;` with or without a following space — `; ` only misses `a=1;session=...`.
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();
    if (trimmed.startsWith("session=")) {
      let value = trimmed.slice("session=".length) || "";
      // Browsers may quote cookie values — strip so DB `sessions.token` matches.
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (value.includes("%")) {
        try {
          value = decodeURIComponent(value);
        } catch {
          /* keep raw value */
        }
      }
      return value || undefined;
    }
  }
  return undefined;
}

/**
 * PERF-403: Treat sessions as expired slightly before wall-clock expiry so near-death tokens
 * are not accepted (reduces hijack window at the boundary). Server-side only.
 */
export const SESSION_EXPIRY_BUFFER_MS = 60 * 1000;

export function isSessionValidByExpiry(expiresAtIso: string, nowMs: number = Date.now()): boolean {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  return expiresAtMs - SESSION_EXPIRY_BUFFER_MS > nowMs;
}
