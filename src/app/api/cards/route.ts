import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, ShareCard, UserDoc } from '@/types/firebase';
import { FieldValue } from 'firebase-admin/firestore';
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

    const snap = await adminDb.collection(COLLECTIONS.users).doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = snap.data() as UserDoc;
    const tv = userData.tasteVector;

    if (!tv.archetype || !tv.roastText) {
      return NextResponse.json({ error: 'Incomplete taste profile' }, { status: 400 });
    }

    const cardId = crypto.randomUUID();
    
    const posterCollage = [
      'https://image.tmdb.org/t/p/w200/poster1.jpg',
      'https://image.tmdb.org/t/p/w200/poster2.jpg',
      'https://image.tmdb.org/t/p/w200/poster3.jpg'
    ];

    const card: ShareCard = {
      id: cardId,
      ownerUid: uid,
      handle: userData.handle,
      archetype: tv.archetype,
      roastText: tv.roastText,
      topGenres: tv.topGenres,
      contrarianScore: tv.contrarianScore,
      confidenceScore: tv.confidenceScore,
      posterCollage,
      ogImageUrl: null,
      createdAt: FieldValue.serverTimestamp() as any,
    };

    await adminDb.collection(COLLECTIONS.cards).doc(cardId).set(card);

    return NextResponse.json({ cardId });
  } catch (error: any) {
    console.error('Cards API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
