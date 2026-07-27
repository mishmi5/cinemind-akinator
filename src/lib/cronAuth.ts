import crypto from 'crypto';

// Every cron route compared the header against `Bearer ${process.env.CRON_SECRET}` inline. With the
// variable unset in production that expected value becomes the literal string "Bearer undefined",
// so anyone sending exactly that could fire the newsletter blast, the TMDB sync and the ops report.
// A missing secret is a configuration failure, not an open door — and the comparison is constant
// time, like the one in sessionToken.ts.
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing every request');
    return false;
  }
  const header = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
