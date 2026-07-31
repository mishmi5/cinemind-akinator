'use client';

import React, { useState } from 'react';
import { Link } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import Navbar from '@/components/Navbar';
import SkipLink from '@/components/SkipLink';

// ponytail: no auth provider is wired yet (AuthContext only does anonymous sign-in,
// and nothing in src/ calls signInWithEmailAndPassword / signInWithPopup).
// Until it is, every control here is disabled instead of faking a login.
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const locale = useLocale();

  return (
    <div dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden flex flex-col selection:bg-rose-500/30">

      <SkipLink />

      {/* תאורת רקע עדינה */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-rose-900/10 blur-[150px] pointer-events-none"></div>

      <Navbar />

      {/* אזור ההתחברות */}
      <div id="main-content" className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pt-10 pb-20">
        
        {/* כותרת קטנה מעל הקופסה */}
        <div className="mb-6 flex items-center gap-2 text-2xl font-black tracking-tight">
          CineMind <span className="text-2xl">🎬</span>
        </div>

        {/* קופסת ההתחברות */}
        <div className="w-full max-w-[420px] bg-[#0e0e11] border border-white/5 rounded-3xl p-8 sm:p-10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          
          <div className="text-center mb-8">
            <span className="inline-block px-3 py-1 rounded-full border border-rose-900/50 bg-rose-500/10 text-rose-500 text-xs font-bold mb-4">
              ברוך הבא חזרה
            </span>
            <h1 className="text-3xl font-black text-white mb-2">ברוך השב להוליווד</h1>
            <p className="text-zinc-400 text-sm font-medium">האלגוריתם מתגעגע לטעם הגרוע שלך בסרטים 😜</p>
          </div>

          {/* הודעת מצב — אין עדיין חשבונות */}
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300 text-center">
            החשבונות עוד לא נפתחו. אפשר לשחק בלי להתחבר, וההתחברות תיפתח בקרוב.
          </div>

          {/* כפתורי התחברות חברתית */}
          <div className="space-y-3 mb-6">
            <button disabled className="w-full flex items-center justify-center gap-3 bg-white text-black py-3 px-4 rounded-xl font-bold hover:bg-gray-100 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:active:scale-100">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              המשך עם Google
            </button>
            
            <button disabled className="w-full flex items-center justify-center gap-3 bg-black text-white border border-white/10 py-3 px-4 rounded-xl font-bold hover:bg-white/5 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-black disabled:active:scale-100">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.78.78-.04 1.94-.84 3.34-.73 1.09.08 2.08.51 2.76 1.34-2.47 1.41-2.03 4.41.28 5.48-1.07 2.87-2.31 4.99-3.46 6.1zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.02 4.45-3.74 4.25z"/>
              </svg>
              המשך עם Apple
            </button>
          </div>

          {/* מפריד */}
          <div className="relative flex items-center py-4 mb-4">
            <div className="flex-grow border-t border-white/5"></div>
            <span className="flex-shrink-0 mx-4 text-zinc-400 text-xs font-medium">או באמצעות מייל</span>
            <div className="flex-grow border-t border-white/5"></div>
          </div>

          {/* טופס התחברות אימייל / סיסמה */}
          <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-bold text-zinc-400 block text-start">אימייל</label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none text-zinc-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                {/* The field itself stays dir="ltr" so an address reads correctly, which means its
                    OWN logical start is always left — so the padding that clears the icon has to be
                    expressed physically, against the wrapper's direction. */}
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full bg-[#070709] border border-white/10 rounded-xl py-3 ${locale === 'he' ? 'pr-11 pl-4' : 'pl-11 pr-4'} text-white placeholder:text-zinc-600 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed`}
                  dir="ltr"
                  autoComplete="email"
                  disabled
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-password" className="text-xs font-bold text-zinc-400 block text-start">סיסמה</label>
              <div className="relative">
                <div className="absolute inset-y-0 start-0 flex items-center ps-4 pointer-events-none text-zinc-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="הסיסמה שלך"
                  className="w-full bg-[#070709] border border-white/10 rounded-xl py-3 ps-11 pe-4 text-white placeholder:text-zinc-600 focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  autoComplete="current-password"
                  disabled
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled
              className="w-full mt-6 group relative flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-rose-500 to-red-600 rounded-xl text-white font-bold text-sm hover:from-rose-400 hover:to-red-500 transition-all shadow-[0_0_20px_rgba(225,29,72,0.3)] hover:shadow-[0_0_30px_rgba(225,29,72,0.5)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100"
            >
              <span>כניסה</span>
              <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          </form>

          <div className="mt-8 text-center text-sm font-medium">
            <span className="text-zinc-400">רוצה להתחיל עכשיו? </span>
            <Link href="/quiz" className="text-rose-500 hover:text-rose-400 transition-colors">התחלת שאלון בלי חשבון</Link>
          </div>

        </div>

        <div className="mt-8 text-xs text-zinc-400 font-medium flex flex-col gap-1 items-center">
          <span>בכניסה אתה מסכים ל<Link href="/terms" className="text-indigo-400 hover:underline">תנאי השימוש</Link> ול<Link href="/privacy" className="text-indigo-400 hover:underline">מדיניות הפרטיות</Link>.</span>
        </div>
      </div>
    </div>
  );
}