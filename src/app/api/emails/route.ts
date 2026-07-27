import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { MARKETING_SENDER } from '@/lib/resend';
// In production: import { resend } from '@/lib/resend';
//
// welcome/purchase are transactional — a reply to something the user just did —
// so they carry no "פרסומת" marker and no unsubscribe link. If either one ever
// grows a promo section, move it to sendMarketingEmail() in @/lib/resend.
// Sender domain: cinemind.co.il everywhere (see MARKETING_SENDER; needs SPF+DKIM).

export async function POST(req: Request) {
  try {
    // This route took the recipient address and the display name straight from the body, with no
    // authentication — the moment the send below is enabled it becomes an open relay that puts
    // attacker-written HTML in anyone's inbox, from our domain. The caller must now be a signed-in
    // user, and we mail the address on their own account, never one they typed.
    const authHeader = req.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let decoded;
    try { decoded = await adminAuth.verifyIdToken(idToken); }
    catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
    const email = decoded.email;
    if (!email) return NextResponse.json({ error: 'Account has no email address' }, { status: 400 });

    const body = await req.json();
    const type = body?.type;
    // Escaped: the name was interpolated into the HTML as-is.
    const name = String(body?.name || '').slice(0, 60)
      .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

    // הגדרת תוכן האימייל לפי סוג הפעולה
    let subject = '';
    let htmlContent = '';

    if (type === 'welcome') {
      subject = 'ברוך הבא ל-CineMind Elite 🎬';
      htmlContent = `
        <div style="font-family: sans-serif; background-color: #070709; color: #ffffff; padding: 40px; text-align: center; border-radius: 12px;">
          <h1 style="color: #f43f5e;">CineMind</h1>
          <h2>הפסקת לנחש. התחלת לראות.</h2>
          <p style="color: #a1a1aa; font-size: 16px;">
            היי ${name || 'חבר'}, ברוך הבא למערכת ה-AI הקולנועית המתקדמת בעולם. 
            הטוקנים שלך מוכנים בזירה, והפרופיל שלך ממתין לניתוח הראשון.
          </p>
          <a href="https://cinemind.co.il/scan" style="display: inline-block; padding: 16px 32px; background-color: #f43f5e; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 24px;">
            התחל סריקה עכשיו
          </a>
        </div>
      `;
    } else if (type === 'purchase') {
      subject = 'השדרוג בוצע בהצלחה 🚀';
      htmlContent = `
        <div style="font-family: sans-serif; background-color: #070709; color: #ffffff; padding: 40px; text-align: center; border-radius: 12px;">
          <h1 style="color: #6366f1;">CineMind Elite</h1>
          <h2>תודה על הרכישה!</h2>
          <p style="color: #a1a1aa; font-size: 16px;">
            חשבונך שודרג בהצלחה. מעכשיו תהנה מהמלצות ללא הגבלה, פרופיל DNA מלא, וטריילרים ללא פרסומות.
          </p>
        </div>
      `;
    }

    // סימולציית שליחה (בפרודקשן מחליפים ל-resend.emails.send)
    console.log(`[EMAIL SYSTEM] Sending '${type}' email from ${MARKETING_SENDER} to ${email}`);

    /*
    await resend.emails.send({
      from: MARKETING_SENDER,
      to: email,
      subject: subject,
      html: htmlContent,
    });
    */

    return NextResponse.json({ success: true, message: 'Email sent successfully' }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Email sending failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}