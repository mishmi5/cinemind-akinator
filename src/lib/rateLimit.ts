// Basic in-memory rate limiter for security hardening
const rateLimitCache = new Map<string, { count: number; expiresAt: number }>();

// DISABLE_RATE_LIMIT exists so a local attack suite can hammer the engine without cutting itself
// off. It is deliberately NOT honoured in production: the variable lives in .env.local, one stray
// copy of that file into the host's environment would turn every limiter in the app off, and
// nothing would report it — the app would look healthy right up until someone flooded it. A switch
// whose failure mode is silent and total does not get to work in production.
const RATE_LIMIT_DISABLED =
  process.env.NODE_ENV !== 'production' &&
  (process.env.DISABLE_RATE_LIMIT === 'true' || process.env.NODE_ENV === 'development');

if (process.env.NODE_ENV === 'production' && process.env.DISABLE_RATE_LIMIT === 'true') {
  console.warn('[rateLimit] DISABLE_RATE_LIMIT is set in production and is being ignored. Remove it from the host environment.');
}

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
