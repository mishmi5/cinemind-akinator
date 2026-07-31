import React from 'react';

export const metadata = {
  title: 'מדיניות פרטיות',
};

const SUPPORT_EMAIL = 'hello@cinemind.co.il';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-300 py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto bg-zinc-900/50 p-8 md:p-12 rounded-3xl border border-zinc-800">
        <h1 className="text-4xl font-black text-white mb-8 text-center bg-gradient-to-l from-indigo-500 to-cyan-500 bg-clip-text text-transparent">מדיניות פרטיות</h1>

        <p className="text-center text-zinc-400 text-sm mb-8">עודכן לאחרונה: 27 ביולי 2026</p>

        <div className="space-y-8 text-sm md:text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. מה אנחנו עושים עם המידע שלך</h2>
            <p>איננו מוכרים את המידע שלך ואיננו משכירים אותו למפרסמים. כדי שהשירות יעבוד אנחנו כן מעבירים מידע לספקים שמפעילים אותו עבורנו — הם מעבדים אותו לפי ההוראות שלנו בלבד. הרשימה נמצאת בסעיף 3.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. איסוף נתונים ושימוש</h2>
            <p>אנו אוספים את כתובת המייל שלך, את תשובותיך לשאלוני הטעם, דירוגי סרטים, היסטוריית ההמלצות ופרופיל ה&quot;מיקרו-ז&apos;אנר&quot; שנבנה מהן. בנוסף נאסף מידע טכני על השימוש: סוג הדפדפן, מכשיר, כתובת IP ואירועי שימוש באתר. המידע משמש להפעלת מנוע ההמלצות, לשליחת המיילים שביקשת ולשיפור המוצר.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. ספקים שמעבדים את המידע</h2>
            <ul className="list-disc pr-5 space-y-2">
              <li><strong className="text-white">Firebase (Google)</strong> — הרשמה, התחברות ואחסון פרופיל המשתמש והדירוגים.</li>
              <li><strong className="text-white">Stripe</strong> — סליקת התשלום. פרטי הכרטיס נמסרים ישירות ל-Stripe ואינם עוברים דרכנו.</li>
              <li><strong className="text-white">Resend</strong> — שליחת המיילים מהמערכת.</li>
              <li><strong className="text-white">PostHog</strong> — אנליטיקת מוצר. ראה סעיף 4.</li>
              <li><strong className="text-white">TMDB</strong> — מקור נתוני הסרטים. אנחנו שולחים ל-TMDB שאילתות על סרטים, לא פרטים מזהים שלך.</li>
            </ul>
            <p className="mt-3">השרתים של הספקים האלה נמצאים מחוץ לישראל, בעיקר בארצות הברית ובאיחוד האירופי, ולכן המידע נשמר ומעובד גם בחו״ל. השימוש בשירות מהווה הסכמה להעברה הזאת.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Cookies ואנליטיקה</h2>
            <p>אנחנו משתמשים בעוגיות לשתי מטרות. הראשונה היא ניהול ההתחברות ושמירת הסטטוס שלך, כדי שלא תצטרך להתחבר מחדש בכל ביקור. השנייה היא אנליטיקת מוצר דרך <strong className="text-white">PostHog</strong>, שנטענת בכל עמוד ומתעדת אילו מסכים נצפו, אילו כפתורים נלחצו ואיך התקדמת בשאלון. אנחנו קוראים את זה כדי להבין איפה אנשים נתקעים ומה לתקן. איננו מריצים רשתות פרסום ואיננו מעבירים את הנתונים האלה למפרסמים. אפשר לחסום את העוגיות בהגדרות הדפדפן, ואז חלק מהשירות לא יעבוד כרגיל.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. מייל ההמלצה השבועי</h2>
            <p>אחרי ההרשמה אנחנו שולחים לך פעם בשבוע מייל עם סרט אחד שנבחר לפי הפרופיל שלך, וכן מיילים תפעוליים כמו אישור רכישה או איפוס סיסמה. להסרה מהדיוור השבועי אפשר ללחוץ על קישור ההסרה שבתחתית כל מייל, או לשלוח בקשה ל-<a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>. הסרה מהדיוור לא מבטלת את המיילים התפעוליים ולא סוגרת את החשבון.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. כמה זמן שומרים את המידע</h2>
            <p>פרופיל המשתמש והדירוגים נשמרים כל עוד החשבון פעיל. אם ביקשת מחיקה, נמחק אותם תוך 30 יום. חשבון שלא נעשה בו שימוש שלוש שנים יימחק ביוזמתנו. נתוני האנליטיקה נשמרים ב-PostHog עד 12 חודשים. רשומות תשלום וחשבוניות נשמרות שבע שנים כנדרש בדיני המס.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. זכויותיך</h2>
            <p>שמורה לך הזכות לעיין במידע שצברנו אודותיך, לתקן אותו או למחוק אותו לחלוטין, לרבות ה-DNA הקולנועי שלך. לשם כך שלח בקשה מכתובת המייל שאיתה נרשמת ל-<a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>, ונטפל בה תוך 30 יום. אם לא קיבלת מענה מספק, אפשר לפנות לרשות להגנת הפרטיות במשרד המשפטים.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. יצירת קשר</h2>
            {/* TODO(owner): real company name, ח.פ./ע.מ. and address before launch */}
            <p>בעל מאגר המידע: <strong className="text-white">CineMind</strong> <span className="text-amber-400">[[TODO — שם החברה הרשמי, ח.פ./ע.מ. וכתובת טרם הוזנו]]</span>. לכל שאלה בנושא פרטיות: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
