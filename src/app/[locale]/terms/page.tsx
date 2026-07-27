import React from 'react';

export const metadata = {
  title: 'תקנון ותנאי שימוש',
};

const SUPPORT_EMAIL = 'hello@cinemind.co.il';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-300 py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto bg-zinc-900/50 p-8 md:p-12 rounded-3xl border border-zinc-800">
        <h1 className="text-4xl font-black text-white mb-8 text-center bg-gradient-to-l from-rose-500 to-indigo-500 bg-clip-text text-transparent">תקנון ותנאי שימוש (TOS)</h1>

        <p className="text-center text-zinc-500 text-sm mb-8">עודכן לאחרונה: 27 ביולי 2026</p>

        <div className="space-y-8 text-sm md:text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. מבוא והסכמה</h2>
            <p>ברוכים הבאים ל-CineMind. השימוש באתר, באפליקציה ובמערכת ההמלצות שלנו כפוף להסכמתכם לתנאים המפורטים בתקנון זה. אם אינכם מסכימים לתנאים, אנא הימנעו משימוש בשירות.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. פטור מאחריות - בינה מלאכותית והמלצות תוכן</h2>
            <p>מערכת CineMind מבוססת על אלגוריתמי בינה מלאכותית (AI) ומודלים סטטיסטיים להמלצת סרטים. אנו <strong className="text-rose-400">איננו מתחייבים</strong> שהסרט המומלץ יתאים במדויק לטעמך או שיהיה חף מתוכן שעשוי לפגוע בך. הבחירה לצפות בסרט היא על אחריות המשתמש בלבד, והחברה מסירה מעצמה כל אחריות לנזק, עוגמת נפש או אובדן זמן שייגרם כתוצאה מהמלצה שגויה.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. המסלול והתשלום</h2>
            <p>CineMind מציעה מסלול אחד: <strong className="text-white">מייסד</strong> — תשלום חד-פעמי של <strong className="text-white">99 ₪ כולל מע״מ</strong>, שמקנה גישה לכל החיים לחשבון שנרכש. המסלול מוגבל ל-200 מקומות, וכשהם ייגמרו הוא ייסגר לרכישה. אין כאן מנוי, אין חיוב חוזר ואין חידוש אוטומטי — משלמים פעם אחת וזהו. כל מסלול או מחיר אחר שיוצע בעתיד יחייב רק מי שירכוש אותו, ולא ישנה למפרע את מה שכבר נרכש.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. ביטול עסקה והחזר כספי</h2>
            <p>הרכישה היא עסקת מכר מרחוק לפי חוק הגנת הצרכן, התשמ״א-1981, ויש לך זכות ביטול מלאה:</p>
            <ul className="list-disc pr-5 space-y-2 mt-3">
              <li><strong className="text-white">14 יום לביטול.</strong> אפשר לבטל את הרכישה תוך 14 יום מיום העסקה או מיום קבלת מסמך פרטי העסקה, לפי המאוחר. עם ביטול נחזיר את התשלום, ומותר לנו לנכות דמי ביטול של 5% מהמחיר או 100 ₪ — הנמוך מביניהם.</li>
              <li><strong className="text-white">איך מבטלים.</strong> מייל ל-<a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a> עם השם והמייל שאיתו נרשמת. אפשר גם בטלפון או בדואר לכתובת שבסעיף 8. נשיב תוך 14 יום מקבלת הודעת הביטול.</li>
              <li><strong className="text-white">ביטול מורחב.</strong> אדם עם מוגבלות, אזרח ותיק או עולה חדש רשאי לבטל תוך 4 חודשים מיום העסקה, בכפוף להצגת תעודה.</li>
              <li><strong className="text-white">עסקה מתמשכת.</strong> אם בעתיד נציע שירות בחיוב מתמשך, אפשר יהיה לבטל אותו בכל רגע, והחיוב ייפסק תוך 3 ימי עסקים מיום מסירת הודעת הביטול (או תוך 6 ימי עסקים אם נמסרה בדואר רשום).</li>
            </ul>
            <p className="mt-3">שירות שכבר נוצל לא נגרע מזכות הביטול. אם משהו בתקנון הזה סותר את חוק הגנת הצרכן — החוק גובר.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. גיל המשתמש</h2>
            <p>השירות מיועד לבני 18 ומעלה. מתחת לגיל 18 מותר להשתמש רק באישור הורה או אפוטרופוס, שהוא גם זה שמבצע את הרכישה. המערכת מציגה סרטים בכל דירוגי הגיל, כולל תוכן שאינו מתאים לקטינים, ואיננו מסננים לפי גיל. הורה שמגלה שילדו נרשם ללא אישורו מוזמן לפנות אלינו ונמחק את החשבון ואת המידע שנצבר.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. אבטחת סליקה</h2>
            <p>CineMind <strong className="text-white">אינה</strong> שומרת את פרטי כרטיס האשראי של הלקוח. כל פעולות הסליקה מתבצעות באופן מוצפן ובתקן PCI-DSS המחמיר ביותר דרך חברת הסליקה הבינלאומית Stripe.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. קניין רוחני (IP)</h2>
            <p>כל זכויות הקניין הרוחני באתר, לרבות המותג, העיצוב (UI/UX), מנוע השאלות ואלגוריתם ה&quot;מיקרו-ז&apos;אנר&quot;, שייכות ל-CineMind. חל איסור מוחלט על העתקה, שעתוק, או שימוש מסחרי ללא אישור בכתב. נתוני הסרטים, הפוסטרים והתקצירים מגיעים מ-TMDB ונשארים בבעלות בעליהם.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. מי אנחנו ואיך יוצרים קשר</h2>
            {/* TODO(owner): real company name, ח.פ./ע.מ. and address before launch */}
            <ul className="list-disc pr-5 space-y-2">
              <li>שם העוסק: <strong className="text-white">CineMind</strong> <span className="text-amber-400">[[TODO — שם החברה הרשמי טרם הוזן]]</span></li>
              <li>ח.פ. / ע.מ.: <span className="text-amber-400">[[TODO — מספר ח.פ./ע.מ. טרם הוזן]]</span></li>
              <li>כתובת: <span className="text-amber-400">[[TODO — כתובת העסק טרם הוזנה]]</span></li>
              <li>טלפון: <span className="text-amber-400">[[TODO — טלפון שירות טרם הוזן]]</span></li>
              <li>דוא״ל: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. דין וסמכות שיפוט</h2>
            <p>על תקנון זה ועל כל שימוש בשירות חלים דיני מדינת ישראל בלבד. סמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בתל אביב-יפו.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. שינויים בתקנון</h2>
            <p>CineMind שומרת לעצמה את הזכות לעדכן את תנאי השימוש מעת לעת. תאריך העדכון האחרון מופיע בראש העמוד. שינוי לא יפגע בזכויות של רכישה שכבר בוצעה.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
