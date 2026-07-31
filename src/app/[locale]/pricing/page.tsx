'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useSearchParams } from 'next/navigation';

// The cap is a real product decision (200 seats). The number of seats already
// taken is NOT tracked anywhere yet, so we show the cap and nothing else — an
// invented "37 מקומות נשארו" would be a lie.
// TODO(owner): when purchases are persisted (Stripe webhook -> DB), fetch the
// count here and render "נשארו X מתוך 200". Until then this stays a plain cap.
const FOUNDER_SEATS = 200;

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      alert('התשלום בוטל. אם משהו נתקע, כתוב לנו.');
    }
  }, [searchParams]);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType: 'founder' }),
      });

      const data = await response.json();

      if (data.url) {
        // העברה מאובטחת לעמוד התשלום של Stripe
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert('לא הצלחנו לפתוח את עמוד התשלום. נסה שוב בעוד רגע.');
      setLoading(false);
    }
  };

  return (
    <main dir="rtl" className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl md:text-6xl font-black mb-6 text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-rose-500 tracking-tight">
          שוב גולל שעה בנטפליקס? 🍿
        </h1>
        <p className="text-zinc-400 text-lg md:text-xl mb-16 max-w-2xl mx-auto">
          החידון ושלושת הסרטים שיוצאים ממנו חינם, בלי כרטיס ובלי הרשמה. משלמים רק מי שרוצה שהטעם שלו יישמר.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">

          {/* Free */}
          <div className="bg-[#111113] border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all flex flex-col text-right">
            <h2 className="text-2xl font-black mb-4">חינם, תמיד</h2>
            <div className="text-5xl font-black text-white mb-2">₪0</div>
            <p className="text-zinc-400 mb-6">בלי כרטיס אשראי ובלי פתיחת חשבון.</p>
            <ul className="text-zinc-300 space-y-2 mb-8 text-sm leading-relaxed">
              <li>· החידון המלא</li>
              <li>· שלושה סרטים, וההסבר למה דווקא הם</li>
              <li>· טריילר לכל סרט</li>
              <li>· איפה רואים אותו בישראל</li>
            </ul>

            <Link
              href="/scan"
              className="mt-auto w-full py-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              התחל את החידון
            </Link>
          </div>

          {/* Founder */}
          <div className="bg-gradient-to-br from-indigo-900/40 to-[#070709] border border-indigo-500/50 rounded-3xl p-8 flex flex-col relative text-right shadow-[0_0_50px_rgba(99,102,241,0.2)]">
            <div className="absolute -top-4 right-8 bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-black tracking-widest shadow-lg whitespace-nowrap">
              {FOUNDER_SEATS} מקומות
            </div>
            <h2 className="text-2xl font-black mb-4 text-indigo-400">מייסד</h2>
            <div className="text-5xl font-black text-white mb-2">
              ₪99<span className="text-xl text-zinc-400"> פעם אחת</span>
            </div>
            <p className="text-indigo-200/60 mb-6">תשלום אחד, גישה לכל החיים. לא מנוי, אין חיוב חוזר.</p>
            <ul className="text-zinc-300 space-y-2 mb-8 text-sm leading-relaxed">
              <li>· פרופיל הטעם שלך נשמר</li>
              <li>· חידונים חוזרים בלי הגבלה</li>
              <li>· מייל שבועי עם סרט שמתאים לך</li>
              <li>· היסטוריה של כל &quot;למה הסרט הזה&quot;</li>
            </ul>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="mt-auto w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] disabled:opacity-50"
            >
              {loading ? 'טוען...' : 'קח מקום מייסד'}
            </button>
            <div className="flex justify-center gap-4 mt-4 opacity-50">
              <span className="text-xs border border-white/20 px-2 py-1 rounded">💳 אשראי</span>
              <span className="text-xs border border-white/20 px-2 py-1 rounded"> Pay</span>
              <span className="text-xs border border-white/20 px-2 py-1 rounded">G Pay</span>
            </div>
          </div>

        </div>

        {/* What happens after the 200 */}
        <div className="mt-12 max-w-2xl mx-auto bg-white/[0.03] border border-white/10 rounded-2xl p-6 text-right">
          <h3 className="font-black text-lg mb-2">מה קורה כשה-{FOUNDER_SEATS} ייגמרו</h3>
          <p className="text-zinc-400 text-sm leading-relaxed">
            המסלול נסגר, והמוצר עובר למנוי של ₪19 לחודש. מי שקנה מקום מייסד ממשיך לקבל את הכל
            ב-₪0, בלי חיוב, לתמיד.
          </p>
        </div>

        {/* Price & cancellation terms */}
        <div className="mt-6 max-w-2xl mx-auto text-right text-zinc-400 text-sm leading-relaxed space-y-2">
          <p>המחיר סופי וכולל מע״מ. אין תוספות בקופה.</p>
          <p>
            אפשר לבטל את העסקה תוך 14 יום מיום הרכישה ולקבל החזר, לפי חוק הגנת הצרכן.
            הפרטים ב<Link href="/terms" className="text-zinc-300 underline underline-offset-4 hover:text-white">תנאי השימוש</Link>.
          </p>
        </div>

        {/* Trust Badges & Security Microcopy */}
        <div className="mt-16 max-w-2xl mx-auto text-center border-t border-zinc-800 pt-8">
          <div className="flex justify-center items-center gap-6 mb-4 grayscale opacity-60">
            <div className="flex items-center gap-2 text-sm font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
              256-bit SSL Encryption
            </div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              100% Secure Checkout
            </div>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed">
            CineMind לעולם לא שומרת את פרטי כרטיס האשראי שלך בשרתיה. <br/>
            התשלום מוצפן ומאובטח במלואו ע&quot;י <strong className="text-zinc-400">Stripe</strong> - העומדת בתקן המחמיר PCI-DSS.
          </p>
        </div>
      </div>
    </main>
  );
}
