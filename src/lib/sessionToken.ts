import crypto from 'crypto';

const SECRET_KEY = process.env.SESSION_SECRET || 'fallback-secret-for-dev-only-do-not-use-in-prod';

export function signSessionState(state: any): string {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64');
  const hmac = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

export function verifySessionState(token: string): any | null {
  try {
    const [payload, hmac] = token.split('.');
    if (!payload || !hmac) return null;

    const expectedHmac = crypto.createHmac('sha256', SECRET_KEY).update(payload).digest('hex');
    
    // Timing safe equal is best, but standard string comparison is okay for this non-critical use case
    // Though, let's use timingSafeEqual for security best practices
    const expectedBuffer = Buffer.from(expectedHmac);
    const actualBuffer = Buffer.from(hmac);
    
    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      return null;
    }

    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
  } catch (error) {
    return null;
  }
}
