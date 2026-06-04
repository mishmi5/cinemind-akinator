import { NextResponse } from 'next/server';
import { resend, isResendConfigured } from '@/lib/resend';

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[CRON] Starting Weekly Newsletter Generation...');
    
    // 1. Fetch all premium/active users from Firebase
    // Example: const users = await getActiveUsers();
    const mockUsers = [
      { id: '1', email: 'user@example.com', name: 'Dani', topGenre: 'Sci-Fi' }
    ];

    let emailsSent = 0;

    // 2. Loop through users and send hyper-personalized email
    for (const user of mockUsers) {
      // Create personalized content based on user.topGenre
      const subject = `היי ${user.name}, מצאנו סרט ${user.topGenre} בול בשבילך לסופ"ש! 🍿`;
      
      try {
        if (isResendConfigured) {
          await resend.emails.send({
            from: 'CineMind <hello@cinemind.studio>',
            to: user.email,
            subject: subject,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; color: #333;">
                <h2>היי ${user.name}!</h2>
                <p>הסופ"ש הגיע, והאלגוריתם שלנו קלט שאתה ממש בעניין של ${user.topGenre} לאחרונה.</p>
                <p>הנה 3 סרטים חדשים שאתה פשוט חייב לראות:</p>
                <ul>
                  <li><strong>סרט 1</strong> - כי אתה אוהב עלילות מתוסבכות.</li>
                  <li><strong>סרט 2</strong> - קלאסיקה שתפורה למידותיך.</li>
                  <li><strong>סרט 3</strong> - משהו חדש שיצא רק עכשיו.</li>
                </ul>
                <br/>
                <p>שב על הספה, תכין פופקורן ותהנה.</p>
                <p>צוות CineMind</p>
              </div>
            `
          });
          emailsSent++;
        }
      } catch (err) {
        console.error(`Failed to send email to ${user.email}`, err);
      }
    }

    console.log(`[CRON] Successfully sent ${emailsSent} personalized newsletters.`);

    return NextResponse.json({ success: true, sent: emailsSent });
  } catch (error: any) {
    console.error('[CRON Newsletter Error]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
