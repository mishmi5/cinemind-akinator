import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, Duel, DuelComparison, UserDoc } from '@/types/firebase';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

// Compute Cosine Similarity between two affinity vectors
function computeSimilarity(vecA: Record<string, number>, vecB: Record<string, number>): number {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keys) {
    if (key === 'General') continue; // Ignore general engagement
    const valA = vecA[key] || 0;
    const valB = vecB[key] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))); // 0 to 1
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { duelId } = await req.json();

    if (!duelId) return NextResponse.json({ error: 'Missing duelId' }, { status: 400 });

    const duelRef = adminDb.collection(COLLECTIONS.duels).doc(duelId);
    let comparisonResult: DuelComparison | null = null;
    let winnerUid: string | null = null;

    await adminDb.runTransaction(async (t) => {
      const duelSnap = await t.get(duelRef);
      if (!duelSnap.exists) throw new Error('Duel not found');
      
      const duelData = duelSnap.data() as Duel;

      if (!duelData.participantUids.includes(uid)) {
        throw new Error('Not participating in this duel');
      }

      if (duelData.status === 'COMPLETE') {
        // Already finalized, just return early
        return;
      }

      if (duelData.status !== 'ACTIVE' || !duelData.opponent) {
        throw new Error('Duel is not ready to be finalized');
      }

      const p1 = duelData.challenger.tasteSnapshot!.affinities;
      const p2 = duelData.opponent.tasteSnapshot!.affinities;

      const similarity = computeSimilarity(p1, p2);

      // Determine "Winner" - this is purely gamification. Let's make the winner the one with a higher "contrarian" score, or just randomize it if equal.
      const p1Contrarian = duelData.challenger.tasteSnapshot!.contrarianScore;
      const p2Contrarian = duelData.opponent.tasteSnapshot!.contrarianScore;

      winnerUid = p1Contrarian > p2Contrarian ? duelData.challenger.uid : duelData.opponent.uid;
      
      const p1Archetype = duelData.challenger.tasteSnapshot!.archetype;
      const p2Archetype = duelData.opponent.tasteSnapshot!.archetype;

      // LLM call inside transaction? Bad practice! 
      // We will do it outside the transaction. For now, mark status as COMPLETE to lock it.
      t.update(duelRef, {
        status: 'COMPLETE',
        updatedAt: Timestamp.now(),
        winnerUid,
      });
    });

    // We fetch the duel data again outside transaction
    const finalDuelSnap = await duelRef.get();
    const finalDuelData = finalDuelSnap.data() as Duel;

    if (finalDuelData.comparison) {
      return NextResponse.json({ success: true, duel: finalDuelData }, { status: 200 });
    }

    // Now call LLM for the verdict!
    const similarity = computeSimilarity(finalDuelData.challenger.tasteSnapshot!.affinities, finalDuelData.opponent!.tasteSnapshot!.affinities);
    
    const p1Arch = finalDuelData.challenger.tasteSnapshot!.archetype;
    const p2Arch = finalDuelData.opponent!.tasteSnapshot!.archetype;

    const prompt = `You are the brutal CineMind AI judge. Two friends are dueling their movie tastes.
Challenger: ${finalDuelData.challenger.handle} (${p1Arch})
Opponent: ${finalDuelData.opponent!.handle} (${p2Arch})
Their Taste Similarity Score is ${(similarity * 100).toFixed(0)}%.

Write a short, highly sarcastic "verdict" (2-3 sentences max) roasting their combination of tastes or their lack of compatibility. 
Make it hilarious. Reply ONLY with the verdict string.`;

    const { text: verdict } = await generateText({
      model: openai('gpt-4o'),
      prompt,
      temperature: 0.9,
    });

    const comparison: DuelComparison = {
      similarity,
      challengerEdge: finalDuelData.challenger.tasteSnapshot!.topGenres,
      opponentEdge: finalDuelData.opponent!.tasteSnapshot!.topGenres,
      verdict: verdict.trim()
    };

    await duelRef.update({ comparison, updatedAt: Timestamp.now() });

    // Award XP to winner and loser! (100 to winner, 50 to loser)
    const p1Ref = adminDb.collection(COLLECTIONS.users).doc(finalDuelData.challenger.uid);
    const p2Ref = adminDb.collection(COLLECTIONS.users).doc(finalDuelData.opponent!.uid);
    
    // CLAIM THE AWARD BEFORE PAYING IT. The guard above ("has this duel got a comparison yet?")
    // is read outside any transaction and the LLM call sits between the read and the write, so two
    // finalize requests arriving together both passed it and both credited XP. A single atomic
    // flag on the duel decides who pays, once.
    const claimedAward = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(duelRef);
      const d = snap.data() as (Duel & { xpAwarded?: boolean }) | undefined;
      if (!d || d.xpAwarded) return false;
      t.update(duelRef, { xpAwarded: true });
      return true;
    });
    if (!claimedAward) {
      return NextResponse.json({ success: true, duelId, alreadyAwarded: true }, { status: 200 });
    }

    await adminDb.runTransaction(async (t) => {
      const u1 = await t.get(p1Ref);
      const u2 = await t.get(p2Ref);
      
      if (u1.exists) {
        const d = u1.data() as UserDoc;
        const currentXp = d.economy?.xp || 0;
        const xpDelta = winnerUid === finalDuelData.challenger.uid ? 100 : 50;
        t.set(p1Ref, { economy: { xp: currentXp + xpDelta } }, { merge: true });
      }
      if (u2.exists) {
        const d = u2.data() as UserDoc;
        const currentXp = d.economy?.xp || 0;
        const xpDelta = winnerUid === finalDuelData.opponent!.uid ? 100 : 50;
        t.set(p2Ref, { economy: { xp: currentXp + xpDelta } }, { merge: true });
      }
    });

    return NextResponse.json({ success: true, duelId }, { status: 200 });

  } catch (error: any) {
    console.error('Error finalizing duel:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
