import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cronAuth';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/types/firebase';
import { Timestamp, type Query } from 'firebase-admin/firestore';

// The owner's weekly report. It used to send a hardcoded object — newUsers: 142, mrrGrowth: '+228₪',
// churnedUsers: 1 — every Sunday, to a fallback chat id. Numbers nobody measured, arriving weekly
// with the authority of a report: the worst kind of wrong. Every figure below now comes from a
// Firestore count over the users collection, and everything we cannot measure yet is listed as
// such instead of being invented.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Firestore aggregation — a server-side count, so it does not read 500 docs to report a number. */
async function count(query: Query): Promise<number> {
  return (await query.count().get()).data().count;
}

export async function GET(request: Request) {
  try {
    if (!cronAuthorized(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    // No fallback chat id. The old '123456789' would have sent the company's numbers to whoever
    // owns that chat.
    const chatId = process.env.CEO_CHAT_ID;

    const users = adminDb.collection(COLLECTIONS.users);
    const since = new Date(Date.now() - WEEK_MS);
    const sinceTs = Timestamp.fromDate(since);
    // premiumSince is written as an ISO string (see founderSeat.ts), not a Timestamp, so it is
    // compared as one. ISO-8601 sorts lexicographically, which is the only reason this works.
    const sinceIso = since.toISOString();

    const [totalUsers, newUsers, activeUsers, premiumUsers, newPremiumUsers] = await Promise.all([
      count(users),
      count(users.where('createdAt', '>=', sinceTs)),
      count(users.where('lastActiveAt', '>=', sinceTs)),
      count(users.where('isPremium', '==', true)),
      count(users.where('premiumSince', '>=', sinceIso)),
    ]);

    const metrics = { totalUsers, newUsers, activeUsers, premiumUsers, newPremiumUsers };

    // TODO(owner): the missing figures each need instrumentation before they can be reported —
    // revenue from the Stripe API, quiz completions and churn from a dated event per user
    // (the ledger has QUIZ_COMPLETED but nothing writes it yet), retention from a cohort query.
    const notMeasured = [
      'הכנסות וצמיחה ב-MRR',
      'חידונים שהושלמו',
      'נטישה',
      'שימור בשבוע השני',
      'הז׳אנר המוביל',
    ];

    const reportMessage = [
      'דוח שבועי — CineMind',
      '',
      `שבעת הימים האחרונים (מאז ${since.toLocaleDateString('he-IL')}):`,
      `משתמשים חדשים: ${newUsers}`,
      `משתמשים שנכנסו: ${activeUsers}`,
      `רכישות פרימיום חדשות: ${newPremiumUsers}`,
      '',
      `סך הכל: ${totalUsers} משתמשים, מתוכם ${premiumUsers} בפרימיום.`,
      '',
      `עדיין לא נמדד ולכן לא מדווח: ${notMeasured.join(', ')}.`,
    ].join('\n');

    // Plain text on purpose: Markdown parsing would break on a name or a title with an underscore.
    if (token && chatId) {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: reportMessage }),
      });
      if (!res.ok) console.error('[CRON Report] Telegram refused:', res.status, await res.text());
    } else {
      console.log('[CRON Report] TELEGRAM_BOT_TOKEN / CEO_CHAT_ID not set — report not sent:\n' + reportMessage);
    }

    return NextResponse.json({ success: true, metrics, notMeasured });
  } catch (error: unknown) {
    console.error('[CRON Report Error]', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
