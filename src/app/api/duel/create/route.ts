import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, Duel, DuelPlayer, UserDoc } from '@/types/firebase';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data() as UserDoc;
    
    if (!userData.tasteVector) {
      return NextResponse.json({ error: 'You must complete the quiz before creating a duel!' }, { status: 403 });
    }

    // Generate a short 6-character invite code
    const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

    const challenger: DuelPlayer = {
      uid,
      handle: userData.handle || `user_${uid.substring(0, 5)}`,
      photoURL: userData.photoURL || null,
      tasteSnapshot: userData.tasteVector,
      score: 0,
      ready: true
    };

    const duelRef = adminDb.collection(COLLECTIONS.duels).doc();
    const now = Timestamp.now();
    // Duel expires in 24 hours (FOMO)
    const expiresAt = new Timestamp(now.seconds + 86400, now.nanoseconds);

    const duelData: Duel = {
      id: duelRef.id,
      status: 'PENDING',
      challenger,
      opponent: null,
      inviteCode,
      questionSet: [], // Optional: reserved for future live-quiz expansion
      winnerUid: null,
      comparison: null,
      participantUids: [uid],
      createdAt: now as any,
      expiresAt: expiresAt as any,
      updatedAt: now as any
    };

    await duelRef.set(duelData);

    return NextResponse.json({ success: true, duelId: duelRef.id, inviteCode }, { status: 200 });

  } catch (error) {
    console.error('Error creating duel:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
