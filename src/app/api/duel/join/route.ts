import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, Duel, DuelPlayer, UserDoc } from '@/types/firebase';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { duelId, inviteCode } = await req.json();

    if (!duelId || !inviteCode) {
      return NextResponse.json({ error: 'Missing duelId or inviteCode' }, { status: 400 });
    }

    const userDoc = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data() as UserDoc;
    
    if (!userData.tasteVector) {
      return NextResponse.json({ error: 'You must complete the quiz to discover your taste before dueling!' }, { status: 403 });
    }

    const duelRef = adminDb.collection(COLLECTIONS.duels).doc(duelId);
    
    await adminDb.runTransaction(async (t) => {
      const duelSnap = await t.get(duelRef);
      if (!duelSnap.exists) throw new Error('Duel not found');
      
      const duelData = duelSnap.data() as Duel;

      if (duelData.inviteCode !== inviteCode.toUpperCase()) {
        throw new Error('Invalid invite code');
      }

      if (duelData.status !== 'PENDING') {
        if (duelData.participantUids.includes(uid)) {
          // They already joined, this is fine
          return;
        }
        throw new Error('This duel is no longer accepting challengers');
      }

      if (duelData.challenger.uid === uid) {
        throw new Error('You cannot duel yourself');
      }

      const opponent: DuelPlayer = {
        uid,
        handle: userData.handle || `user_${uid.substring(0, 5)}`,
        photoURL: userData.photoURL || null,
        tasteSnapshot: userData.tasteVector,
        score: 0,
        ready: true
      };

      t.update(duelRef, {
        opponent,
        participantUids: [...duelData.participantUids, uid],
        status: 'ACTIVE',
        updatedAt: Timestamp.now()
      });
    });

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Error joining duel:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
