import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, UserDoc } from '@/types/firebase';

// Read the signed-in user's REAL profile. The profile page was rendering hardcoded sample data
// ("עידן", 420 tokens, three invented genres), so the one screen that is supposed to prove the
// subscription's value — "this is what we know about you" — showed the same thing to everybody.
// The quiz already persists a sub-genre vector via /api/user/bootstrap; this exposes it.
export async function GET(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { uid } = await adminAuth.verifyIdToken(authHeader.split('Bearer ')[1]);
    const snap = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    if (!snap.exists) {
      // Signed in but no quiz completed yet — an empty profile is a real state, not an error.
      return NextResponse.json({ hasProfile: false, loved: [], rejected: [], economy: null });
    }
    const data = snap.data() as UserDoc;
    const affinities: Record<string, number> = (data.tasteVector as unknown as { affinities?: Record<string, number> })?.affinities || {};
    const ranked = Object.entries(affinities).sort((a, b) => b[1] - a[1]);
    return NextResponse.json({
      hasProfile: ranked.length > 0,
      displayName: data.displayName || null,
      isPremium: !!data.isPremium,
      economy: data.economy || null,
      // The sub-genres the engine is confident about, strongest first — the actual asset the
      // customer is paying to keep.
      loved: ranked.filter(([, v]) => v >= 0.4).slice(0, 6).map(([term, score]) => ({ term, score })),
      rejected: ranked.filter(([, v]) => v <= -0.4).slice(-4).map(([term, score]) => ({ term, score })),
      totalTerms: ranked.length,
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
