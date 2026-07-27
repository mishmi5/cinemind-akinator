'use client';

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { Link } from '@/i18n/routing';

export default function LeaderboardPage() {
  // The only number this page can back is the XP this browser actually earned.
  // There is no global table yet: scores are not written to any server, so any
  // ranking shown here would be invented. ponytail: localStorage is the whole
  // data source until arena scores are persisted per account.
  const [myXp, setMyXp] = useState(0);

  useEffect(() => {
    setMyXp(parseInt(localStorage.getItem('cinemind_xp') || '0', 10));
  }, []);

  return (
    <main dir="rtl" className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden pb-20 selection:bg-rose-500/30">

      {/* Dynamic Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[600px] bg-indigo-900/10 blur-[120px] pointer-events-none"></div>

      <Navbar />

      <div className="relative z-10 max-w-3xl mx-auto px-4 mt-8 md:mt-16 flex flex-col items-center">

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-bold mb-6">
          <span>🏆</span>
          <span>CineMind Hall of Fame</span>
        </div>

        <h1 className="text-4xl md:text-5xl font-black mb-4 text-center tracking-tight">
          טבלת המובילים <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-rose-500">בקרוב</span>
        </h1>

        <p className="text-zinc-400 mb-10 text-center max-w-md mx-auto">
          עוד אין טבלה משותפת. הנקודות שלך נשמרות כרגע רק בדפדפן הזה, ולכן אין לנו במה להשוות אותך לשחקנים אחרים.
        </p>

        {/* Your own score — the one figure we can actually show */}
        <div className="w-full bg-[#111113]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-8 sm:p-12 shadow-2xl text-center animate-in fade-in duration-1000">
          <div className="text-sm font-bold text-zinc-500 mb-2">ה-XP שלך</div>
          <div className="text-6xl font-black text-indigo-400 font-mono drop-shadow-[0_0_15px_rgba(99,102,241,0.4)]">{myXp}</div>
          <p className="text-zinc-500 text-sm mt-6 max-w-sm mx-auto leading-relaxed">
            כשנפתח דירוג בין שחקנים נעדכן כאן. עד אז הנקודות ממשיכות להיצבר לך בזירה.
          </p>
        </div>

        <div className="mt-12 w-full max-w-sm">
          <Link
            href="/arena"
            className="w-full flex items-center justify-center gap-2 py-4 bg-white hover:bg-zinc-200 text-black rounded-2xl font-black text-xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.2)] hover:scale-105"
          >
            חזור לזירה והעלה את ה-XP שלך 👾
          </Link>
        </div>

      </div>
    </main>
  );
}
