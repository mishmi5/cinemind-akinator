import { NextResponse } from 'next/server';
import { sendTelegramAlert } from '@/lib/telegram';
import { resend, isResendConfigured } from '@/lib/resend';

export async function GET(req: Request) {
  try {
    // Protect cron endpoint in production
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Simulated mock users who abandoned the paywall
    const mockAbandonedUsers = [
      { email: 'test@example.com', name: 'User' }
    ];

    let emailsSent = 0;

    if (isResendConfigured) {
      for (const user of mockAbandonedUsers) {
        await resend.emails.send({
          from: 'CineMind <hello@cinemind.co>',
          to: user.email,
          subject: 'הסרט שלך ממתין... 🎬',
          html: `
            <div dir="rtl" style="font-family: sans-serif; color: #111;">
              <h2>היי ${user.name},</h2>
              <p>האלגוריתם שלנו פיצח אותך ב-99% התאמה, והסרט המושלם לערב הזה ממתין לך.</p>
              <p>עוד 24 שעות אנחנו מוחקים את התוצאה שלך, חבל שתמשיך לגלול בנטפליקס סתם.</p>
              <a href="https://cinemind.co/pricing" style="display: inline-block; padding: 12px 24px; background-color: #e11d48; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 16px;">
                גלה את הסרט עכשיו
              </a>
            </div>
          `
        });
        emailsSent++;
      }
    }

    await sendTelegramAlert(`🔄 <b>Cron Executed: Abandoned Paywall</b>\n- Abandoned Quizzes Recovered: ${mockAbandonedUsers.length}\n- Emails Sent: ${emailsSent} (Resend: ${isResendConfigured ? 'ON' : 'OFF'})`);
    
    return NextResponse.json({ success: true, message: 'Recovery cron completed', emailsSent });
  } catch (error) {
    console.error('Cron error:', error);
    await sendTelegramAlert('🚨 <b>Cron Error</b>\nFailed to run Abandoned Quiz Recovery cron.\n' + String(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
