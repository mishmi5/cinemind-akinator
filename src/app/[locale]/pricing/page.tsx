'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useSearchParams } from 'next/navigation';

export default function PricingPage() {
  const [loadingPlan, setLoadingPlan] = useState<'credits' | 'elite' | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      alert('התשלום בוטל. אם נתקלת בבעיה, אנחנו כאן כדי לעזור!');
    }
  }, [searchParams]);

  const handleCheckout = async (planType: 'credits' | 'elite') => {
    setLoadingPlan(planType);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType }),
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
      alert('אירעה שגיאה ביצירת עמוד התשלום. ודא שהמפתחות מוגדרים כראוי.');
      setLoadingPlan(null);
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
          חלאס עם התירוצים. תן לאלגוריתם שלנו להציל לך את הערב. שתי אפשרויות קלות, בלי חארטות.
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          
          {/* Starter (Single Reveal) */}
          <div className="bg-[#111113] border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all flex flex-col">
            <h2 className="text-2xl font-black mb-4">חשיפה חד-פעמית</h2>
            <div className="text-5xl font-black text-white mb-2">₪9</div>
            <p className="text-zinc-500 mb-8">רוצה לדעת רק איזה סרט יצא לך עכשיו? פחות מחצי פופקורן בקולנוע.</p>
            
            <button 
              onClick={() => handleCheckout('credits')}
              disabled={loadingPlan !== null}
              className="mt-auto w-full py-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loadingPlan === 'credits' ? 'טוען...' : 'גלה את הסרט'}
            </button>
            <div className="flex justify-center gap-4 mt-4 opacity-50">
               <span className="text-xs border border-white/20 px-2 py-1 rounded"> Pay</span>
               <span className="text-xs border border-white/20 px-2 py-1 rounded">G Pay</span>
            </div>
          </div>

          {/* Pack (Decoy Effect) */}
          <div className="bg-[#111113] border border-white/10 rounded-3xl p-8 hover:border-white/20 transition-all flex flex-col relative">
            <div className="absolute top-4 right-4 bg-rose-500/20 text-rose-400 text-xs font-bold px-3 py-1 rounded-full border border-rose-500/30">
              משתלם יותר
            </div>
            <h2 className="text-2xl font-black mb-4">חבילת ה-10</h2>
            <div className="text-5xl font-black text-white mb-2 flex items-end gap-3">
              ₪29 <span className="text-2xl text-zinc-600 line-through mb-1">₪49</span>
            </div>
            <p className="text-zinc-500 mb-8">10 המלצות. מחיר רצפה כדי שלא תגיד שאנחנו לא מתחשבים. תקף לשנה.</p>
            
            <button 
              onClick={() => handleCheckout('credits')}
              disabled={loadingPlan !== null}
              className="mt-auto w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_0_15px_rgba(225,29,72,0.3)]"
            >
              {loadingPlan === 'credits' ? 'טוען...' : 'קנה חבילה'}
            </button>
            <div className="flex justify-center gap-4 mt-4 opacity-50">
               <span className="text-xs border border-white/20 px-2 py-1 rounded">💳 אשראי</span>
               <span className="text-xs border border-white/20 px-2 py-1 rounded"> Pay</span>
            </div>
          </div>

          {/* Subscription Elite */}
          <div className="bg-gradient-to-br from-indigo-900/40 to-[#070709] border border-indigo-500/50 rounded-3xl p-8 flex flex-col relative transform md:-translate-y-4 shadow-[0_0_50px_rgba(99,102,241,0.2)]">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-500 text-white px-4 py-1 rounded-full text-xs font-black tracking-widest shadow-lg whitespace-nowrap">
              CineMind Elite
            </div>
            <h2 className="text-2xl font-black mb-4 text-indigo-400">להתחתן עם האלגוריתם 💍</h2>
            <div className="text-5xl font-black text-white mb-2">₪34<span className="text-xl text-zinc-500">/חודש</span></div>
            <p className="text-indigo-200/60 mb-8">המלצות בלי הגבלה, פרופיל לומד וקסטומיזציה מטורפת. פתרון קבע להתלבטות.</p>
            
            <button 
              onClick={() => handleCheckout('elite')}
              disabled={loadingPlan !== null}
              className="mt-auto w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] disabled:opacity-50"
            >
              {loadingPlan === 'elite' ? 'טוען...' : 'בחר מסלול'}
            </button>
            <div className="flex justify-center gap-4 mt-4 opacity-50">
               <span className="text-xs border border-white/20 px-2 py-1 rounded"> Pay</span>
               <span className="text-xs border border-white/20 px-2 py-1 rounded">G Pay</span>
               <span className="text-xs border border-white/20 px-2 py-1 rounded">💳 אשראי</span>
            </div>
          </div>

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
          <p className="text-zinc-500 text-sm leading-relaxed">
            CineMind לעולם לא שומרת את פרטי כרטיס האשראי שלך בשרתיה. <br/>
            התשלום מוצפן ומאובטח במלואו ע"י <strong className="text-zinc-400">Stripe</strong> - העומדת בתקן המחמיר PCI-DSS.
          </p>
        </div>
      </div>
    </main>
  );
}