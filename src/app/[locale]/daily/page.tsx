'use client';

import React, { useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { CineMindLogo } from '@/components/Navbar';
import { shareCard } from '@/lib/share';

interface DailyMovie {
  id: string; title: string; originalTitle: string;
  posterUrl: string; overview: string; globalRating: number;
}
interface DailyPayload {
  date: string; secondsUntilNextDrop: number; movie: DailyMovie;
  comparison: { source: string; rating: number };
}

// Streak lives client-side (localStorage) — zero-backend Duolingo mechanic.
function bumpStreak(date: string): number {
  try {
    const raw = JSON.parse(localStorage.getItem('cinemind_daily_streak') || '{}');
    if (raw.lastDate === date) return raw.count || 1;
    const yesterday = new Date(date); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    const count = raw.lastDate === yStr ? (raw.count || 0) + 1 : 1;
    localStorage.setItem('cinemind_daily_streak', JSON.stringify({ lastDate: date, count }));
    return count;
  } catch { return 1; }
}

function getStreak(): { lastDate?: string; count: number } {
  try { return { count: 0, ...JSON.parse(localStorage.getItem('cinemind_daily_streak') || '{}') }; }
  catch { return { count: 0 }; }
}

export default function DailyChallengePage() {
  const locale = useLocale();
  const he = locale === 'he';
  const [data, setData] = useState<DailyPayload | null>(null);
  const [myRating, setMyRating] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [streak, setStreak] = useState(0);
  const [shareState, setShareState] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/daily-challenge?locale=${locale}`)
      .then(r => r.json())
      .then((d: DailyPayload) => {
        setData(d);
        setSecondsLeft(d.secondsUntilNextDrop);
        const s = getStreak();
        setStreak(s.count);
        try {
          const voted = JSON.parse(localStorage.getItem('cinemind_daily_votes') || '{}');
          if (voted[d.date] !== undefined) setMyRating(voted[d.date]);
        } catch {}
      })
      .catch(() => {});
  }, [locale]);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const vote = (star: number) => {
    if (!data || myRating !== null) return;
    setMyRating(star);
    try {
      const voted = JSON.parse(localStorage.getItem('cinemind_daily_votes') || '{}');
      voted[data.date] = star;
      localStorage.setItem('cinemind_daily_votes', JSON.stringify(voted));
    } catch {}
    setStreak(bumpStreak(data.date));
  };

  const doShare = async () => {
    if (!data || myRating === null) return;
    const world = (data.comparison.rating / 2).toFixed(1);
    const text = he
      ? `🎬 אתגר הטעם היומי של CineMind: נתתי ל"${data.movie.title}" ${myRating}/5. העולם נתן ${world}/5. סטריק: ${streak}🔥 — מה הדירוג שלך?`
      : `🎬 CineMind Daily Taste Challenge: I rated "${data.movie.title}" ${myRating}/5. The world says ${world}/5. Streak: ${streak}🔥 — what's yours?`;
    const r = await shareCard(`${window.location.origin}/${locale}/daily`, text);
    setShareState(r === 'copied' ? (he ? 'הועתק ✓' : 'Copied ✓') : r === 'shared' ? (he ? 'שותף ✓' : 'Shared ✓') : null);
  };

  const hh = Math.floor(secondsLeft / 3600), mm = Math.floor((secondsLeft % 3600) / 60), ss = secondsLeft % 60;
  const worldHalf = data ? data.comparison.rating / 2 : 0;

  return (
    <main dir={he ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white font-sans pb-20">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#070709]">
        <Link href="/" className="text-2xl font-black tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity">
          <CineMindLogo className="w-8 h-8" />CineMind
        </Link>
        <div className="flex items-center gap-3 text-sm font-bold">
          {streak > 0 && <span className="text-orange-400">🔥 {streak}</span>}
          <span className="bg-red-600/20 border border-red-500/30 text-red-400 font-mono px-4 py-1.5 rounded-full">
            ⏱️ {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 mt-10 text-center">
        <span className="inline-block px-5 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-sm font-bold mb-4">
          {he ? '🎯 אתגר הטעם היומי' : '🎯 Daily Taste Challenge'}
        </span>
        <h1 className="text-4xl md:text-5xl font-black mb-2">{he ? 'סרט אחד. כל העולם מדרג.' : 'One film. The whole world rates.'}</h1>
        <p className="text-zinc-400 text-lg mb-10">{he ? 'דרגו לפני חצות והשוו את עצמכם לעולם.' : 'Rate before midnight and see how you compare.'}</p>

        {!data ? (
          <div className="animate-pulse text-zinc-500 font-bold py-20">{he ? 'טוען את הסרט של היום...' : "Loading today's film..."}</div>
        ) : (
          <div className="bg-[#111113] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div className="relative w-full h-[420px] bg-zinc-900">
              <img src={data.movie.posterUrl} alt={data.movie.title} className="absolute inset-0 w-full h-full object-cover object-top" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111113] via-transparent to-transparent" />
            </div>
            <div className="px-8 pb-10 -mt-16 relative z-10">
              <h2 className="text-4xl font-black mb-1 drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">{data.movie.title}</h2>
              <p className="text-xs text-zinc-400 font-mono uppercase tracking-[0.2em] mb-6">{data.movie.originalTitle}</p>

              {myRating === null ? (
                <div className="flex justify-center gap-3" dir="ltr">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => vote(star)}
                      onMouseEnter={() => setHovered(star)} onMouseLeave={() => setHovered(null)}
                      className="p-2 transition-transform hover:scale-110 active:scale-90">
                      <svg className={`w-12 h-12 transition-all ${hovered !== null && star <= hovered ? 'text-orange-500 fill-orange-500 scale-110' : 'text-zinc-700 fill-transparent stroke-current stroke-1'}`} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="animate-in fade-in zoom-in duration-500">
                  <div className="flex items-center justify-center gap-8 mb-6">
                    <div className="text-center">
                      <div className="text-5xl font-black text-orange-400">{myRating}/5</div>
                      <div className="text-zinc-500 text-sm font-bold mt-1">{he ? 'אתה' : 'You'}</div>
                    </div>
                    <div className="text-3xl text-zinc-600 font-black">VS</div>
                    <div className="text-center">
                      <div className="text-5xl font-black text-cyan-400">{worldHalf.toFixed(1)}/5</div>
                      <div className="text-zinc-500 text-sm font-bold mt-1">{he ? 'העולם' : 'The World'}</div>
                    </div>
                  </div>
                  <p className="text-zinc-300 font-bold mb-6">
                    {Math.abs(myRating - worldHalf) >= 1.5
                      ? (he ? '🌶️ דעה חריגה! אתה רואה משהו שהעולם מפספס.' : "🌶️ Hot take! You see something the world doesn't.")
                      : (he ? '🤝 מיינסטרים נחמד. העולם מסכים איתך.' : '🤝 Comfortably mainstream. The world agrees.')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button onClick={doShare} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black transition-all hover:scale-[1.02]">
                      {shareState || (he ? '📤 שתפו את התוצאה' : '📤 Share your result')}
                    </button>
                    <Link href="/scan" className="px-8 py-3 bg-rose-600 hover:bg-rose-500 rounded-2xl font-black transition-all hover:scale-[1.02]">
                      {he ? '🧠 גלו את הארכיטיפ שלכם' : '🧠 Discover your archetype'}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="text-zinc-600 text-xs font-bold mt-6 uppercase tracking-widest">
          {he ? 'סרט חדש בכל חצות (שעון ישראל)' : 'New film every midnight (Israel time)'}
        </p>
      </div>
    </main>
  );
}
