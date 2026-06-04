import React from 'react';

export const metadata = {
  title: 'תקנון ותנאי שימוש',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-300 py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto bg-zinc-900/50 p-8 md:p-12 rounded-3xl border border-zinc-800">
        <h1 className="text-4xl font-black text-white mb-8 text-center bg-gradient-to-l from-rose-500 to-indigo-500 bg-clip-text text-transparent">תקנון ותנאי שימוש (TOS)</h1>
        
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
            <h2 className="text-xl font-bold text-white mb-3">3. מדיניות ביטולים והחזרים (No Refunds Policy)</h2>
            <p>משום ש-CineMind מציעה שירות דיגיטלי (גישה למסד הנתונים, הפעלת אלגוריתם ה-DNA הקולנועי וטוקנים של AI), <strong className="text-rose-400">לא יינתן החזר כספי לאחר רכישת מנוי או קרדיטים</strong> מרגע תחילת השימוש במערכת. באפשרותך לבטל את המנוי החודשי בכל עת, והביטול ייכנס לתוקף בתום מחזור החיוב הנוכחי.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. אבטחת סליקה</h2>
            <p>CineMind <strong className="text-white">אינה</strong> שומרת את פרטי כרטיס האשראי של הלקוח. כל פעולות הסליקה מתבצעות באופן מוצפן ובתקן PCI-DSS המחמיר ביותר דרך חברת הסליקה הבינלאומית Stripe.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. קניין רוחני (IP)</h2>
            <p>כל זכויות הקניין הרוחני באתר, לרבות המותג, העיצוב (UI/UX), מנוע השאלות ואלגוריתם ה"מיקרו-ז'אנר" הם רכושה הבלעדי של חברת CineMind. חל איסור מוחלט על העתקה, שעתוק, או שימוש מסחרי ללא אישור בכתב.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. שינויים בתקנון</h2>
            <p>CineMind שומרת לעצמה את הזכות לעדכן את תנאי השימוש מעת לעת. המשך שימוש באתר לאחר שינוי מהווה הסכמה לתנאים המעודכנים.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
