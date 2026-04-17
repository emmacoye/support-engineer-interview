/**
 * PERF-403: Treat sessions as expired slightly before wall-clock expiry so near-death tokens
 * are not accepted (reduces hijack window at the boundary). Server-side only.
 */
export const SESSION_EXPIRY_BUFFER_MS = 60 * 1000;

export function isSessionValidByExpiry(expiresAtIso: string, nowMs: number = Date.now()): boolean {
  const expiresAtMs = new Date(expiresAtIso).getTime();
  return expiresAtMs - SESSION_EXPIRY_BUFFER_MS > nowMs;
}
