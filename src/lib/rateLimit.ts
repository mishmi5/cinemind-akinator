// Basic in-memory rate limiter for security hardening
const rateLimitCache = new Map<string, { count: number; expiresAt: number }>();

const RATE_LIMIT_DISABLED =
  process.env.DISABLE_RATE_LIMIT === 'true' ||
  process.env.NODE_ENV === 'development';

export function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  if (RATE_LIMIT_DISABLED) return true;
  const now = Date.now();
  const record = rateLimitCache.get(ip);

  if (!record || record.expiresAt < now) {
    rateLimitCache.set(ip, { count: 1, expiresAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count += 1;
  return true;
}
