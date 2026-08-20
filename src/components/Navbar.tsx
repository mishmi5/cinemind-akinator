'use client';

import React, { useState, useEffect } from 'react';
import { Link } from '@/i18n/routing';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export const CineMindLogo = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={`drop-shadow-[0_0_10px_rgba(99,102,241,0.5)] ${className}`}>
    <path d="M24 16L10 25V7L24 16Z" fill="url(#grad-pulse)" fillOpacity="0.2"/>
    <path d="M10 7L24 16L10 25" stroke="url(#grad-pulse)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="24" cy="16" r="4" fill="#070709" stroke="#f43f5e" strokeWidth="2.5"/>
    <circle cx="10" cy="7" r="3" fill="#6366f1"/>
    <circle cx="10" cy="25" r="3" fill="#f43f5e"/>
    <defs>
      <linearGradient id="grad-pulse" x1="10" y1="7" x2="24" y2="25" gradientUnits="userSpaceOnUse">
        <stop stopColor="#6366f1" />
        <stop offset="1" stopColor="#f43f5e" />
      </linearGradient>
    </defs>
  </svg>
);

export default function Navbar() {
  const router = useRouter();
  const { userData } = useAuth();

  const xp = userData?.economy?.xp || 0;
  const streak = userData?.streak?.current || 0;
  const multiplier = userData?.economy?.xpMultiplier || 1.0;

  // The profile link is worth showing only to someone who has already answered questions here;
  // a first-time visitor would follow it to an empty page. The quiz writes every film it showed
  // into this key, and with sign-in disabled it is the only trace of past play we can read.
  // ponytail: "has played" stands in for "finished a quiz" — the quiz records no completion flag.
  const [hasPlayed, setHasPlayed] = useState(false);
  useEffect(() => {
    try {
      setHasPlayed(JSON.parse(localStorage.getItem('cinemind_recent_movies') || '[]').length > 0);
    } catch { /* private mode or bad JSON: treat as a first visit */ }
  }, []);

  const t = useTranslations('Navigation');
  const locale = useLocale();
  // ponytail: inline copy — messages/*.json is owned by another change right now.
  const backLabel = locale === 'he' ? 'חזרה לעמוד הקודם' : 'Back to the previous page';

  return (
    <nav className="relative z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b border-white/5 bg-[#070709]/80 backdrop-blur-xl sticky top-0 w-full">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          aria-label={backLabel}
          className="text-zinc-400 hover:text-white transition-colors bg-white/5 w-11 h-11 rounded-full items-center justify-center border border-white/10 hidden md:flex"
        >
          <svg className="w-4 h-4" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <Link href="/" className="text-xl font-black tracking-tight text-white flex items-center gap-2 hover:opacity-80 transition-opacity">
          <CineMindLogo />
          {/* sr-only rather than hidden: below sm the wordmark was removed from the tree and the
              link was left with nothing but an SVG, so it had no accessible name at all. */}
          <span className="sr-only sm:not-sr-only">CineMind</span>
        </Link>
      </div>
      
      <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm font-medium text-zinc-400">
        {/* Below sm the four labels ran the row past the edge of a 360px phone, so there the emoji
            carries the link and the label stays in the accessibility tree — the same sr-only trick
            the wordmark above uses, rather than dropping the destinations on small screens. */}
        <Link href="/arena" className="hover:text-rose-400 transition-colors flex items-center gap-1 font-bold">
          <span className="text-xl" aria-hidden="true">👾</span>
          <span className="sr-only sm:not-sr-only">{t('arena')}</span>
        </Link>
        <Link href="/pulse" className="hover:text-orange-400 transition-colors flex items-center gap-1 font-bold text-orange-500/80">
          <span className="text-xl" aria-hidden="true">🔥</span>
          <span className="sr-only sm:not-sr-only">{t('pulse')}</span>
        </Link>
        <Link href="/daily" className="hover:text-rose-400 transition-colors flex items-center gap-1 font-bold">
          <span className="text-xl" aria-hidden="true">🎯</span>
          <span className="sr-only sm:not-sr-only">{t('daily')}</span>
        </Link>
        {hasPlayed && (
          <Link href="/profile" className="hover:text-indigo-400 transition-colors flex items-center gap-1 font-bold">
            <span className="text-xl" aria-hidden="true">🧬</span>
            <span className="sr-only sm:not-sr-only">{t('profile')}</span>
          </Link>
        )}
        {xp > 0 && (
          <div className="hidden sm:flex items-center gap-1 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full font-bold text-indigo-400">
            <span>✨</span> {xp} XP
          </div>
        )}
        {streak > 0 && (
          <div className="hidden sm:flex items-center gap-1 px-3 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full font-bold text-orange-400" title={`Streak Multiplier: x${multiplier.toFixed(1)}`}>
            <span>🔥</span> {streak} ({multiplier.toFixed(1)}x)
          </div>
        )}
        {/* The paid tier is called "מייסד" on the pricing page and in the terms, so the nav says
            that too. It used to read "Premium מנויים" — a second name for the tier, and the word
            "subscriptions" on a product that sells one payment and never charges again. */}
        <Link href="/pricing" className="hover:text-indigo-400 transition-colors flex items-center gap-1">
          <span className="text-indigo-400">{t('premium')}</span>
        </Link>
        {/* The "Vibe חצות" button was a tooltip gag for a feature that does not exist, and the row
            has to hold the two destinations a returning visitor came back for. The Navigation.vibe
            string stays in messages for whenever that feature is real. */}
        <LanguageSwitcher />
        <Link href="/login" className="px-4 py-1.5 md:px-5 md:py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all border border-white/10">
          {t('login')}
        </Link>
      </div>
    </nav>
  );
}
