import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, LedgerEvent, UserDoc, TasteVector } from '@/types/firebase';
import { deriveTaste } from '@/lib/taste/deriveTaste';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid Bearer token' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await req.json();
    const { tasteVector, proofToken } = body;

    if (!tasteVector) {
      return NextResponse.json({ error: 'tasteVector is required' }, { status: 400 });
    }

    if (!proofToken) {
      return NextResponse.json({ error: 'proofToken is required to prevent monetization bypass' }, { status: 400 });
    }

    const { verifySessionState } = await import('@/lib/sessionToken');
    const validState = verifySessionState(proofToken);

    // Floor matches the engine's own MIN_Q. Quiz length is adaptive by design — a sharp taste
    // locks in ~12 ratings and the "enough, recommend now" control finishes at MIN_Q — so the
    // old floor of 15 rejected legitimate completions and silently prevented the profile from
    // ever being written. The token is HMAC-signed server-side, so forgery (not length) is what
    // the security actually rests on. proofToken.totalAnswers carries ratedCount; NOT_SEEN never
    // counts toward it.
    if (!validState || !validState.affinities || validState.totalAnswers < 5 || !validState.sessionId) {
      return NextResponse.json({ error: 'Invalid or missing proof token. Quiz must be completed legitimately.' }, { status: 403 });
    }

    const userRef = adminDb.collection(COLLECTIONS.users).doc(uid);
    const ledgerRef = userRef.collection(COLLECTIONS.ledger);
    // Idempotency key MUST be derived from the server-signed proof token, NOT from the
    // client-supplied tasteVector. Otherwise a single valid proofToken can be replayed with
    // a different `totalAnswers` on each call to mint unlimited tokens/XP (monetization bypass).
    const idemKey = `quiz_completed_${validState.sessionId}_${uid}`;

    await adminDb.runTransaction(async (t) => {
      // 1. Idempotency Check
      const dupQuery = await t.get(ledgerRef.where('idempotencyKey', '==', idemKey).limit(1));
      if (!dupQuery.empty) {
        throw new Error('Already bootstrapped for this quiz attempt');
      }

      const userDoc = await t.get(userRef);
      
      let currentEconomy = {
        popcornTokens: 0,
        xp: 0,
        level: 1,
        xpMultiplier: 1.0,
        lifetimeTokensEarned: 0,
        lifetimeTokensSpent: 0
      };

      if (userDoc.exists) {
        const data = userDoc.data() as UserDoc;
        currentEconomy = data.economy || currentEconomy;
      }

      // Grant XP and Popcorn Tokens
      const xpDelta = 100 * currentEconomy.xpMultiplier;
      const tokenDelta = 50;

      const newEconomy = {
        ...currentEconomy,
        xp: currentEconomy.xp + xpDelta,
        popcornTokens: currentEconomy.popcornTokens + tokenDelta,
        lifetimeTokensEarned: currentEconomy.lifetimeTokensEarned + tokenDelta,
        level: Math.floor((currentEconomy.xp + xpDelta) / 500) + 1
      };

      const eventId = crypto.randomUUID();
      const ledgerEvent: LedgerEvent = {
        id: eventId,
        type: 'QUIZ_COMPLETED',
        xpDelta,
        tokenDelta,
        xpBalance: newEconomy.xp,
        tokenBalance: newEconomy.popcornTokens,
        idempotencyKey: idemKey,
        refId: null,
        source: 'server',
        createdAt: FieldValue.serverTimestamp() as any
      };

      const derived = deriveTaste(tasteVector.affinities || {}, tasteVector.confidenceScore || 0);
      const tasteVec: TasteVector = {
        ...tasteVector,
        archetype: derived.archetype,
        roastText: derived.roastText,
        contrarianScore: derived.contrarian,
        topGenres: derived.topGenres,
        updatedAt: FieldValue.serverTimestamp() as any
      };

      if (!userDoc.exists) {
        const newUser: UserDoc = {
          uid,
          handle: `user_${uid.slice(0,6)}`,
          displayName: decodedToken.name || 'Cinephile',
          photoURL: decodedToken.picture || null,
          isAnonymous: decodedToken.provider_id === 'anonymous',
          tasteVector: tasteVec,
          economy: newEconomy,
          streak: {
            current: 1,
            longest: 1,
            lastPulseDate: new Date().toISOString().split('T')[0],
            multiplierExpiresAt: null,
            pulseCompletedToday: true
          },
          isPremium: false,
          premiumSince: null,
          createdAt: FieldValue.serverTimestamp() as any,
          lastActiveAt: FieldValue.serverTimestamp() as any
        };
        t.set(userRef, newUser);
      } else {
        t.update(userRef, {
          tasteVector: tasteVec,
          economy: newEconomy,
          lastActiveAt: FieldValue.serverTimestamp()
        });
      }

      t.set(ledgerRef.doc(eventId), ledgerEvent);
    });

    return NextResponse.json({ success: true, message: 'Bootstrap successful' });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
