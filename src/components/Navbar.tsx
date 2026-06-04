'use client';

import React, { useState, useEffect } from 'react';
import { Link } from '@/i18n/routing';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const [vibeClicked, setVibeClicked] = useState(false);
  const { userData } = useAuth();
  
  const xp = userData?.economy?.xp || 0;
  const streak = userData?.streak?.current || 0;
  const multiplier = userData?.economy?.xpMultiplier || 1.0;

  const handleVibeClick = () => {
    setVibeClicked(true);
    setTimeout(() => setVibeClicked(false), 4000);
  };

  const t = useTranslations('Navigation');
  
  return (
    <nav className="relative z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b border-white/5 bg-[#070709]/80 backdrop-blur-xl sticky top-0 w-full">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-zinc-500 hover:text-white transition-colors bg-white/5 w-8 h-8 rounded-full items-center justify-center border border-white/10 hidden md:flex">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
        <Link href="/" className="text-xl font-black tracking-tight text-white flex items-center gap-2 hover:opacity-80 transition-opacity">
          <CineMindLogo />
          <span className="hidden sm:block">CineMind</span>
        </Link>
      </div>
      
      <div className="flex items-center gap-4 md:gap-6 text-xs md:text-sm font-medium text-zinc-400">
        <Link href="/arena" className="hover:text-rose-400 transition-colors flex items-center gap-1 font-bold">
          <span className="text-xl">👾</span> {t('arena')}
        </Link>
        <Link href="/pulse" className="hover:text-orange-400 transition-colors flex items-center gap-1 font-bold text-orange-500/80">
          <span className="text-xl">🔥</span> {t('pulse')}
        </Link>
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
        <Link href="/pricing" className="hover:text-indigo-400 transition-colors flex items-center gap-1">
          <span className="text-indigo-500">Premium</span> {t('premium').replace('Premium', '').trim()}
        </Link>
        <button onClick={handleVibeClick} className="hover:text-white transition-colors group relative hidden lg:block">
          {t('vibe')} 🦇
          {vibeClicked && (
            <div className="absolute top-full mt-4 -right-4 w-56 p-3 bg-zinc-900 border border-rose-500/50 rounded-xl text-xs text-rose-300 shadow-2xl z-50 whitespace-normal leading-relaxed animate-in fade-in zoom-in duration-200">
              <div className="absolute -top-2 right-12 w-4 h-4 bg-zinc-900 border-t border-l border-rose-500/50 rotate-45"></div>
              <span className="relative z-10 font-bold">עובדים על משהו שישאיר אותך ער עד 4 בבוקר עם עיניים אדומות 👀.</span>
              <br/><br/>
              <span className="relative z-10 text-zinc-400">בינתיים, לך תעשה חידון ותפסיק ללחוץ על כפתורים רנדומליים באקרנצ'יק.</span>
            </div>
          )}
        </button>
        <LanguageSwitcher />
        <Link href="/login" className="px-4 py-1.5 md:px-5 md:py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all border border-white/10">
          {t('login')}
        </Link>
      </div>
    </nav>
  );
}
