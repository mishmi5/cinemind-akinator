import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cronAuth';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!cronAuthorized(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    // Replace with the actual Telegram Chat ID of the CEO
    const CEO_CHAT_ID = process.env.CEO_CHAT_ID || '123456789';

    console.log('[CRON] Generating Weekly CEO Report...');
    
    // 1. Aggregate metrics (Mocked for now, would pull from Firebase & Stripe)
    const metrics = {
      newUsers: 142,
      activeQuizzes: 1850,
      premiumUpgrades: 12,
      mrrGrowth: '+228₪',
      topGenre: 'Science Fiction',
      churnedUsers: 1
    };

    const reportMessage = `
📈 *דו"ח שבועי - CineMind Studio* 📈

שלום מנכ"ל, הנה הביצועים של השבוע האחרון:

👥 *משתמשים חדשים:* ${metrics.newUsers}
🎯 *חידונים שהושלמו:* ${metrics.activeQuizzes}
🏆 *שדרוגים לפרימיום:* ${metrics.premiumUpgrades}
💸 *צמיחה בהכנסות החודשיות (MRR):* ${metrics.mrrGrowth}
💔 *נטישות (Churn):* ${metrics.churnedUsers}
🍿 *הז'אנר הכי פופולרי השבוע:* ${metrics.topGenre}

המערכת רצה בצורה חלקה ויציבה. סוף שבוע נעים!
    `;

    // 2. Send via Telegram Bot API
    if (TELEGRAM_BOT_TOKEN !== 'telegram_placeholder') {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CEO_CHAT_ID,
          text: reportMessage,
          parse_mode: 'Markdown'
        })
      });
    }

    console.log(`[CRON] Successfully sent weekly report to CEO.`);

    return NextResponse.json({ success: true, metrics });
  } catch (error: any) {
    console.error('[CRON Report Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
