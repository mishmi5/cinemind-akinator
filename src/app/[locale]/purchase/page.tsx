'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/context/AuthContext';

const SUPPORT_EMAIL = 'hello@cinemind.co.il';

// Where Stripe sends the buyer back. The session id in the URL is the only proof we have that the
// payment happened, so the page's whole job is to hand it to /api/checkout/verify and show what
// came back — including when it went wrong, so nobody is left with ₪99 gone and a blank screen.
type State =
  | { kind: 'loading' }
  | { kind: 'ok'; already: boolean }
  | { kind: 'unpaid'; paymentStatus: string }
  | { kind: 'refunded' }
  | { kind: 'error'; message: string }
  | { kind: 'no-session' };

function PurchaseInner() {
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (authLoading) return;
    if (!sessionId) {
      setState({ kind: 'no-session' });
      return;
    }
    if (!user) {
      setState({ kind: 'error', message: 'לא הצלחנו לזהות את החשבון שלך.' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/checkout/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: 'error', message: data.error || 'האימות מול Stripe נכשל.' });
          return;
        }
        if (data.status === 'unpaid') {
          setState({ kind: 'unpaid', paymentStatus: data.paymentStatus });
        } else if (data.status === 'refunded') {
          setState({ kind: 'refunded' });
        } else {
          setState({ kind: 'ok', already: data.status === 'already-granted' });
        }
      } catch {
        if (!cancelled) setState({ kind: 'error', message: 'לא הצלחנו לדבר עם השרת.' });
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, user, authLoading]);

  return (
    <main dir="rtl" className="min-h-screen bg-[#070709] text-white font-sans">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-20">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-8 md:p-12">
          {state.kind === 'loading' && (
            <>
              <h1 className="text-3xl font-black mb-4">רגע, בודקים את התשלום…</h1>
              <p className="text-zinc-400">שואלים את Stripe אם הכסף התקבל. זה לוקח שנייה או שתיים.</p>
            </>
          )}

          {state.kind === 'ok' && (
            <>
              <h1 className="text-3xl md:text-4xl font-black mb-4">
                {state.already ? 'הכל כבר מסודר' : 'התשלום התקבל. אתה מייסד.'}
              </h1>
              <p className="text-zinc-300 mb-6">
                שילמת ₪99 פעם אחת. אין חיוב חוזר ואין מנוי שצריך לזכור לבטל.
              </p>
              <p className="text-zinc-300 mb-3">מה יש לך עכשיו:</p>
              <ul className="text-zinc-400 space-y-2 mb-8 list-disc pr-5">
                <li>פרופיל הטעם שלך נשמר — כל מה שהחידון למד עליך לא נמחק בסוף הסשן.</li>
                <li>חידונים בלי הגבלה, וההמלצות משתפרות ככל שאתה עונה.</li>
                <li>מייל שבועי עם המלצות לפי הפרופיל, וההיסטוריה של מה שכבר קיבלת.</li>
              </ul>
              <div className="flex gap-3 flex-wrap">
                <Link href="/scan" className="px-6 py-3 rounded-full bg-indigo-600 hover:bg-indigo-500 font-bold">
                  קדימה, לחידון
                </Link>
                <Link href="/profile" className="px-6 py-3 rounded-full border border-zinc-700 hover:border-zinc-500">
                  לפרופיל שלי
                </Link>
              </div>
              {/* The buyer used to leave here with no record of the payment at all. Say where the
                  invoice comes from, so an inbox without one is a known problem and not a doubt. */}
              <p className="text-zinc-500 text-sm mt-8">
                החשבונית נשלחת אליך במייל מ-Stripe, לכתובת שהזנת בתשלום. אם היא לא הגיעה תוך כמה דקות,
                תבדוק בספאם, ואם גם שם אין — כתוב ל־
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a> עם מספר העסקה ונשלח אותה שוב.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                מספר העסקה: <span className="font-mono">{sessionId}</span> — שמור אותו, הוא מזהה את הרכישה מול התמיכה.
              </p>
              <p className="text-zinc-500 text-sm mt-2">
                אפשר לבטל תוך 14 יום ולקבל את הכסף בחזרה. מייל ל־
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a> עם מספר העסקה, ופרטים ב<Link href="/terms" className="text-indigo-400 underline">תקנון</Link>.
              </p>
            </>
          )}

          {state.kind === 'unpaid' && (
            <>
              <h1 className="text-3xl font-black mb-4">התשלום עוד לא הושלם</h1>
              <p className="text-zinc-300 mb-6">
                Stripe מדווח על הסטטוס <span className="font-mono">{state.paymentStatus}</span>. אם חייבו אותך בכל זאת,
                אל תשלם שוב — רענן את הדף בעוד דקה, ואם זה נשאר ככה כתוב לנו עם מספר העסקה שלמטה.
              </p>
              <Link href="/pricing" className="px-6 py-3 rounded-full border border-zinc-700 inline-block">
                חזרה לעמוד הרכישה
              </Link>
              <p className="text-zinc-500 text-sm mt-8 font-mono">{sessionId}</p>
            </>
          )}

          {state.kind === 'refunded' && (
            <>
              <h1 className="text-3xl font-black mb-4">הרכישה הזאת בוטלה</h1>
              <p className="text-zinc-300">
                הכסף הוחזר, והגישה למייסדים לא פעילה. אם זה לא מה שביקשת — כתוב ל־
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>.
              </p>
            </>
          )}

          {state.kind === 'no-session' && (
            <>
              <h1 className="text-3xl font-black mb-4">אין כאן רכישה לבדוק</h1>
              {/* "כתוב לנו" with nothing to write to: every other branch on this page gives the
                  address, this one left someone who had paid and had no access at a dead end. */}
              <p className="text-zinc-300 mb-6">
                הגעת לדף הזה בלי מזהה עסקה. אם רכשת ולא קיבלת גישה, כתוב לנו ל־
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>.
              </p>
              <Link href="/pricing" className="px-6 py-3 rounded-full border border-zinc-700 inline-block">
                לעמוד הרכישה
              </Link>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <h1 className="text-3xl font-black mb-4">משהו השתבש באימות</h1>
              <p className="text-zinc-300 mb-2">{state.message}</p>
              <p className="text-zinc-300 mb-6">
                אם חויבת — הכסף אצלנו והגישה תגיע. <strong className="text-white">אל תשלם שוב.</strong> שלח מייל ל־
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a> עם מספר העסקה,
                ונסדר את זה ידנית. אפשר גם לרענן את הדף — לחיצה חוזרת לא תחייב אותך פעמיים.
              </p>
              {sessionId && <p className="text-zinc-500 text-sm font-mono">{sessionId}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function PurchasePage() {
  // useSearchParams needs a Suspense boundary or the build refuses to prerender this route.
  return (
    <Suspense fallback={<main dir="rtl" className="min-h-screen bg-[#070709]" />}>
      <PurchaseInner />
    </Suspense>
  );
}
