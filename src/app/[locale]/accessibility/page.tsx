import Link from 'next/link';
import { getLocale } from 'next-intl/server';

// ACCESSIBILITY STATEMENT.
//
// Israeli law expects a consumer website to publish one — the equal-rights regulations point at
// standard 5568, which adopts WCAG 2.0 level AA. The site had no statement and no accessibility
// link anywhere in the footer, which is the first thing an inspection looks for.
//
// Everything below describes what is ACTUALLY true of the site today. It deliberately does not
// claim full conformance: parts of the product have not been audited by a certified accessibility
// surveyor, and saying otherwise in a legal document would be a false statement. The two owner
// details — the coordinator's name and contact — are marked, exactly like the company details in
// the terms, because only the owner can supply them.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'hello@cinemind.co.il';

export default async function AccessibilityPage() {
  const locale = await getLocale();
  const he = locale !== 'en';

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-8">
      <h2 className="text-xl font-black text-white mb-3">{title}</h2>
      <div className="text-zinc-300 leading-relaxed space-y-3">{children}</div>
    </section>
  );

  return (
    <main dir={he ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white font-sans">
      <div className="max-w-3xl mx-auto px-5 py-16">
        <h1 className="text-4xl font-black mb-3">{he ? 'הצהרת נגישות' : 'Accessibility statement'}</h1>
        <p className="text-zinc-400 mb-10">
          {he ? 'עודכן לאחרונה: אוגוסט 2026' : 'Last updated: August 2026'}
        </p>

        <Section title={he ? 'מה אנחנו מכוונים אליו' : 'What we aim for'}>
          <p>
            {he
              ? 'CineMind נבנה לפי תקן ישראלי 5568, שמאמץ את הנחיות WCAG 2.0 ברמה AA. אנחנו מתייחסים לנגישות כחלק מהמוצר ולא כתוספת, ומתקנים ליקויים כשהם מתגלים.'
              : 'CineMind is built against Israeli standard 5568, which adopts WCAG 2.0 level AA. Accessibility is treated as part of the product rather than an addition, and defects are fixed as they are found.'}
          </p>
        </Section>

        <Section title={he ? 'מה כבר נעשה' : 'What has been done'}>
          <ul className="list-disc ps-6 space-y-2">
            <li>{he ? 'האתר כולו בעברית עם כיוון RTL מלא, כולל טפסים, דירוגים ופסי התקדמות.' : 'The site is fully right-to-left in Hebrew, including forms, ratings and progress bars.'}</li>
            <li>{he ? 'אפשר להפעיל את החידון במקלדת בלבד: לכל כוכב דירוג יש שם קריא, וסימון מיקוד גלוי.' : 'The quiz can be operated by keyboard alone: every rating star carries a readable name and a visible focus ring.'}</li>
            <li>{he ? 'לכל תמונה יש טקסט חלופי, ולכל כפתור שמורכב מסמל בלבד יש שם.' : 'Every image has alternative text, and every icon-only button has a name.'}</li>
            <li>{he ? 'כרטיס הסרט מוכרז לקוראי מסך כשהוא מתחלף, כדי שלא ידורג אותו סרט פעמיים.' : 'The film card is announced to screen readers when it changes, so the same film is not rated twice.'}</li>
            <li>{he ? 'שטחי הלחיצה בניווט ובתחתית העמוד הם 44 פיקסלים לפחות.' : 'Navigation and footer touch targets are at least 44 pixels.'}</li>
            <li>{he ? 'אפשר להגדיל את התצוגה — לא חסמנו זום.' : 'Pinch zoom is not disabled.'}</li>
          </ul>
        </Section>

        <Section title={he ? 'מה עדיין לא הושלם' : 'What is not finished'}>
          <p>
            {he
              ? 'האתר טרם עבר סקר נגישות על ידי מורשה נגישות מוסמך, ולכן איננו מצהירים על התאמה מלאה. ייתכנו רכיבים — במיוחד בדפים החדשים — שאינם עומדים בכל דרישות התקן. אנחנו ממשיכים לבדוק ולתקן.'
              : 'The site has not yet been surveyed by a certified accessibility auditor, so we do not claim full conformance. Some components — particularly on newer pages — may not meet every requirement of the standard. We continue to test and fix.'}
          </p>
        </Section>

        <Section title={he ? 'נתקלתם בבעיה?' : 'Found a problem?'}>
          <p>
            {he
              ? 'אם משהו באתר לא נגיש עבורכם, נשמח לדעת ונטפל בזה. כתבו לנו ל־'
              : 'If anything here is not accessible to you, please tell us and we will fix it. Write to '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>
            {he ? ' ותארו מה ניסיתם לעשות ומה קרה.' : ' and describe what you were trying to do and what happened.'}
          </p>
          <p className="text-amber-400">
            {he
              ? 'לפני העלייה לאוויר: יש להשלים כאן את שם רכז הנגישות ודרך יצירת קשר ישירה איתו (טלפון או מייל ייעודי), כנדרש בתקנות.'
              : 'Before launch: the accessibility coordinator’s name and a direct contact route must be filled in here, as the regulations require.'}
          </p>
        </Section>

        <nav className="pt-8 border-t border-zinc-800 flex gap-4 text-sm">
          <Link href="/terms" className="text-zinc-400 hover:text-white underline">{he ? 'תנאי שימוש' : 'Terms of Service'}</Link>
          <Link href="/privacy" className="text-zinc-400 hover:text-white underline">{he ? 'מדיניות פרטיות' : 'Privacy Policy'}</Link>
        </nav>
      </div>
    </main>
  );
}
