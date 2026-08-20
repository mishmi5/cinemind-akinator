import { verifySessionState } from '@/lib/sessionToken';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/types/firebase';
import { OPT_OUT_FIELD } from '@/lib/resend';

// One-click opt-out, no login. The link carries an HMAC-signed {uid, k:'mkt'}
// token, so it is not guessable and not transferable to another user.
// GET = the link in the footer. POST = RFC 8058 one-click, which Gmail and
// Outlook fire from their own "unsubscribe" button.

function page(body: string) {
  return new Response(
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
     <title>הסרה מרשימת התפוצה</title>
     <body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:520px;margin:80px auto;padding:0 16px">
     ${body}</body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

async function optOut(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t');
  const state = token ? verifySessionState(token) : null;
  if (!state?.uid || state.k !== 'mkt') {
    return page('<h2>הקישור לא תקין</h2><p>אפשר להשיב למייל ונסיר ידנית.</p>');
  }

  await adminDb.collection(COLLECTIONS.users).doc(state.uid).set(
    { [OPT_OUT_FIELD]: true, marketingOptOutAt: new Date().toISOString() },
    { merge: true }
  );

  return page('<h2>הוסרת</h2><p>לא נשלח לך יותר דיוור שיווקי מ-CineMind.</p>');
}

export const GET = optOut;
export const POST = optOut;
