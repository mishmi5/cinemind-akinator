import { NextResponse } from 'next/server';
import { cronAuthorized } from '@/lib/cronAuth';
import { sendTelegramAlert } from '@/lib/telegram';
import { isResendConfigured, sendMarketingEmail, findMarketingRecipient } from '@/lib/resend';

export async function GET(req: Request) {
  try {
    // Protect cron endpoint in production
    const authHeader = req.headers.get('authorization');
    if (!cronAuthorized(req)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Simulated mock users who abandoned the paywall
    const mockAbandonedUsers = [
      { email: 'test@example.com', name: 'User' }
    ];

    let emailsSent = 0;
    let skipped = 0;

    for (const user of mockAbandonedUsers) {
      // No user doc = no signed opt-out link we can honour, so we do not advertise
      // to that address at all. Opted out = never again.
      const recipient = await findMarketingRecipient(user.email);
      if (!recipient || recipient.optOut) { skipped++; continue; }

      // Adds "פרסומת:", the advertiser block, the unsubscribe link and the
      // List-Unsubscribe header. Dry-run when there is no API key.
      await sendMarketingEmail({
        to: user.email,
        uid: recipient.uid,
        subject: 'הסרט שלך ממתין... 🎬',
        html: `
            <div dir="rtl" style="font-family: sans-serif; color: #111;">
              <h2>היי ${user.name},</h2>
              <p>האלגוריתם שלנו פיצח אותך ב-99% התאמה, והסרט המושלם לערב הזה ממתין לך.</p>
              <p>עוד 24 שעות אנחנו מוחקים את התוצאה שלך, חבל שתמשיך לגלול בנטפליקס סתם.</p>
              <a href="https://cinemind.co.il/pricing" style="display: inline-block; padding: 12px 24px; background-color: #e11d48; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 16px;">
                גלה את הסרט עכשיו
              </a>
            </div>
          `,
      });
      emailsSent++;
    }

    await sendTelegramAlert(`🔄 <b>Cron Executed: Abandoned Paywall</b>\n- Abandoned Quizzes Recovered: ${mockAbandonedUsers.length}\n- Emails Sent: ${emailsSent}\n- Skipped (opted out / unknown): ${skipped} (Resend: ${isResendConfigured ? 'ON' : 'OFF'})`);

    return NextResponse.json({ success: true, message: 'Recovery cron completed', emailsSent, skipped });
  } catch (error) {
    console.error('Cron error:', error);
    await sendTelegramAlert('🚨 <b>Cron Error</b>\nFailed to run Abandoned Quiz Recovery cron.\n' + String(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
