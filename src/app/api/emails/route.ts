import { NextResponse } from 'next/server';
// In production: import { Resend } from 'resend';
// const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { email, type, name } = await req.json();

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
    console.log(`[EMAIL SYSTEM] Sending '${type}' email to ${email}`);
    
    /* 
    await resend.emails.send({
      from: 'CineMind <hello@cinemind.co.il>',
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