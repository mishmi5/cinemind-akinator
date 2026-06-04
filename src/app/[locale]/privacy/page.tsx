import React from 'react';

export const metadata = {
  title: 'מדיניות פרטיות',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#070709] text-zinc-300 py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto bg-zinc-900/50 p-8 md:p-12 rounded-3xl border border-zinc-800">
        <h1 className="text-4xl font-black text-white mb-8 text-center bg-gradient-to-l from-indigo-500 to-cyan-500 bg-clip-text text-transparent">מדיניות פרטיות</h1>
        
        <div className="space-y-8 text-sm md:text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. שמירה על הפרטיות שלך</h2>
            <p>ב-CineMind, פרטיות המשתמשים היא ערך עליון. אנו מחויבים להגן על המידע האישי שלך ולא למכור אותו או להעבירו לצדדים שלישיים ללא הסכמתך המפורשת.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. איסוף נתונים ושימוש</h2>
            <p>אנו אוספים נתונים אודות העדפות הקולנוע שלך (היסטוריית צפייה, תשובות לשאלונים, ז'אנרים אהובים) אך ורק על מנת לשפר את אלגוריתם ה"מיקרו-ז'אנר" שלנו ולספק לך המלצות מדויקות ואישיות. הנתונים נשמרים בצורה מאובטחת תחת חוקי האבטחה המחמירים של Firebase.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. פרטי תשלום (Stripe)</h2>
            <p>כל פעולות הסליקה מתבצעות על ידי צד שלישי המוסמך לכך (Stripe). אנו לא אוספים, לא רואים ולא שומרים את מספרי כרטיסי האשראי או פרטי חשבון הבנק שלך בשום שלב.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Cookies וטכנולוגיות מעקב</h2>
            <p>האתר משתמש בקובצי עוגיות (Cookies) אך ורק לצורך ניהול התחברות (Authentication) ושמירת הסטטוס שלך באתר (כגון מניעת הצורך להתחבר מחדש בכל ביקור). איננו משתמשים בעוגיות לצורכי פרסום פולשני.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. זכויותיך</h2>
            <p>מורה לך הזכות לעיין, לתקן או למחוק לחלוטין את המידע שצברנו אודותיך (ה-DNA הקולנועי שלך). ניתן לפנות לשירות הלקוחות שלנו לשם ביצוע מחיקה מוחלטת מהמערכת.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
