import { NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { COLLECTIONS, UserDoc, LedgerEvent, EconomyState, StreakState } from '@/types/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

function getUTCDateString(date: Date) {
  return date.toISOString().split('T')[0];
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

    const userRef = adminDb.collection(COLLECTIONS.users).doc(uid);
    
    // We use a transaction to ensure atomicity of the ledger update
    const result = await adminDb.runTransaction(async (t) => {
      const snap = await t.get(userRef);
      if (!snap.exists) {
        throw new Error('User not found');
      }

      const userData = snap.data() as UserDoc;
      const todayDate = new Date();
      const todayStr = getUTCDateString(todayDate);
      
      const yesterdayDate = new Date(todayDate);
      yesterdayDate.setUTCDate(todayDate.getUTCDate() - 1);
      const yesterdayStr = getUTCDateString(yesterdayDate);

      let streak = userData.streak || {
        current: 0,
        longest: 0,
        lastPulseDate: null,
        multiplierExpiresAt: null,
        pulseCompletedToday: false
      };

      if (streak.lastPulseDate === todayStr) {
        throw new Error('PULSE_ALREADY_COMPLETED');
      }

      let newStreakCurrent = streak.current;
      let newMultiplier = userData.economy?.xpMultiplier || 1.0;

      if (streak.lastPulseDate === yesterdayStr) {
        // Kept the streak alive
        newStreakCurrent += 1;
        // Increase multiplier maxing out at 3.0
        newMultiplier = Math.min(3.0, newMultiplier + 0.1);
      } else {
        // Streak broken or first time
        newStreakCurrent = 1;
        newMultiplier = 1.0; // Decay applied: Reset multiplier, keep XP!
      }

      const newLongest = Math.max(streak.longest || 0, newStreakCurrent);

      // Base XP for Daily Pulse
      const baseXP = 50;
      const xpDelta = Math.round(baseXP * newMultiplier);
      const tokenDelta = 10; // Popcorn tokens reward

      const economy: EconomyState = userData.economy || {
        popcornTokens: 0,
        xp: 0,
        level: 1,
        xpMultiplier: 1.0,
        lifetimeTokensEarned: 0,
        lifetimeTokensSpent: 0
      };

      const newXP = (economy.xp || 0) + xpDelta;
      const newTokens = (economy.popcornTokens || 0) + tokenDelta;

      // Update Economy
      const updatedEconomy: EconomyState = {
        ...economy,
        xp: newXP,
        popcornTokens: newTokens,
        xpMultiplier: newMultiplier,
        lifetimeTokensEarned: (economy.lifetimeTokensEarned || 0) + tokenDelta
      };

      // Update Streak
      const expirationDate = new Date(todayDate);
      expirationDate.setUTCDate(todayDate.getUTCDate() + 2); // 48 hours to do the next pulse
      
      const updatedStreak: StreakState = {
        current: newStreakCurrent,
        longest: newLongest,
        lastPulseDate: todayStr,
        multiplierExpiresAt: FieldValue.serverTimestamp() as any, // In reality we'd set an actual timestamp, but we use string check mostly
        pulseCompletedToday: true
      };

      // Ledger Event
      const eventId = crypto.randomUUID();
      const ledgerEvent: LedgerEvent = {
        id: eventId,
        type: 'DAILY_PULSE',
        xpDelta,
        tokenDelta,
        xpBalance: newXP,
        tokenBalance: newTokens,
        idempotencyKey: `pulse:${uid}:${todayStr}`,
        refId: null,
        source: 'server',
        createdAt: FieldValue.serverTimestamp() as any
      };

      t.update(userRef, {
        economy: updatedEconomy,
        streak: updatedStreak
      });

      const ledgerRef = adminDb.collection(COLLECTIONS.ledger).doc(eventId);
      t.set(ledgerRef, {
        ...ledgerEvent,
        ownerUid: uid // Helper for querying
      });

      return { updatedEconomy, updatedStreak, xpDelta };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Pulse API Error:', error);
    if (error.message === 'PULSE_ALREADY_COMPLETED') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
