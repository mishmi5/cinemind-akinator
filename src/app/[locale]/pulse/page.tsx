'use client';

import React, { useState, useEffect } from 'react';
import { Link } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { CineMindLogo } from '@/components/Navbar';
import type { SessionState, AnswerType } from '@/types';
import { useAuth } from '@/context/AuthContext';
import quizToasts from '@/data/quiz-toasts.json';

// Simple fallback component for images
const ImageWithFallback = ({ src, alt, className }: { src: string, alt: string, className: string }) => {
  const [error, setError] = useState(false);
  useEffect(() => { setError(false); }, [src]);
  if (error || !src) return <div className={`bg-zinc-800 flex items-center justify-center ${className}`} />;
  return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
};

export default function DailyPulsePage() {
  const locale = useLocale();
  const t = useTranslations('Pulse');
  const tScan = useTranslations('Scan');
  const tNav = useTranslations('Navigation');
  
  const { user, userData } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [pulseCount, setPulseCount] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [earnedXP, setEarnedXP] = useState(0);
  
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [activeToast, setActiveToast] = useState<{ text: string, emoji: string } | null>(null);
  const [animateCard, setAnimateCard] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const alreadyDone = userData?.streak?.lastPulseDate === todayStr;

  useEffect(() => {
    if (alreadyDone) return;
    
    // Start pulse session
    const initSession = async () => {
      try {
        const localAsked = JSON.parse(localStorage.getItem('cinemind_asked_movies') || '[]');
        const res = await fetch('/api/next-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-asked-ids': JSON.stringify(localAsked), 'x-locale': locale },
          body: JSON.stringify({ sessionId: `pulse_${Date.now()}`, isInit: true })
        });
        if (res.ok) {
          const data = await res.json();
          setSession(data);
        }
      } catch (e) { console.error(e); }
    };
    initSession();
  }, [alreadyDone, locale]);

  const showToast = (messages: string[], emoji: string) => {
    const text = messages[Math.floor(Math.random() * messages.length)];
    setActiveToast({ text, emoji });
    setTimeout(() => setActiveToast(null), 3000);
  };

  const claimPulse = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/user/pulse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEarnedXP(data.xpDelta);
        setIsDone(true);
        // Dispatch event so Navbar updates instantly
        window.dispatchEvent(new CustomEvent('xp-updated', { detail: { xp: data.updatedEconomy.xp } }));
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const submitAnswer = async (answer: AnswerType) => {
    setLoading(true);
    setAnimateCard(true);

    if (pulseCount >= 2) {
      // Finished 3 questions!
      await claimPulse();
      return;
    }

    try {
      const response = await fetch('/api/next-question', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-asked-ids': JSON.stringify(session!.askedMovieIds),
          'x-locale': locale
        },
        body: JSON.stringify({
          sessionId: session!.sessionId, questionId: session!.currentQuestion!.id,
          answer, movieId: session!.currentQuestion!.movie?.id,
          genreIds: session!.currentQuestion!.movie?._genreIds || []
        })
      });

      if (response.ok) {
        const newState = await response.json();
        setTimeout(() => {
          setSession(newState);
          setPulseCount(p => p + 1);
          setAnimateCard(false); 
          setLoading(false);
          setHoveredStar(null);
        }, 300);
      }
    } catch (error) {
      setLoading(false);
      setAnimateCard(false);
    }
  };

  const handleStarClick = (star: AnswerType) => {
    if (loading || isDone) return;
    if (star === 5) showToast(quizToasts.fiveStarToasts, '✨');
    else if (star === 1) showToast(quizToasts.oneStarToasts, '💩');
    submitAnswer(star);
  };

  if (isDone) {
    return (
      <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center px-4 animate-in fade-in zoom-in duration-500">
        <div className="text-7xl mb-6 animate-bounce">🔥</div>
        <h1 className="text-5xl font-black mb-4 text-center">{t('success_title')}</h1>
        <p className="text-zinc-400 text-xl text-center mb-8">{t('success_desc')}</p>
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-3xl p-8 text-center shadow-[0_0_50px_rgba(249,115,22,0.2)]">
          <div className="text-orange-500 font-black text-4xl mb-2">+{earnedXP} XP</div>
          <div className="text-orange-400/80 font-bold text-lg">{t('reward')}</div>
        </div>
        <Link href="/" className="mt-12 px-10 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-full font-black transition-all">
          {t('back_to_arena')}
        </Link>
      </main>
    );
  }

  if (alreadyDone) {
    return (
      <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center pt-20 px-4">
        <div className="text-7xl mb-6">🔥</div>
        <h1 className="text-4xl font-black mb-4">{t('done_today')}</h1>
        <Link href="/" className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-all">
          {tNav('arena')}
        </Link>
      </main>
    );
  }

  if (!user) {
    return (
      <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] flex flex-col items-center justify-center px-4">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-2xl font-bold text-white mb-2">{tNav('login')}</h2>
        {/* ponytail: inline copy — messages/*.json is owned by another change; move here to a Pulse key when that lands */}
        <p className="text-zinc-400 text-center">
          {locale === 'he' ? 'צריך להתחבר כדי לשחק בדופק היומי.' : 'You need to log in to play the Daily Pulse.'}
        </p>
        <Link href="/login" className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold text-white transition-all">
          {tNav('login')}
        </Link>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse"><CineMindLogo className="w-20 h-20" /></div>
      </main>
    );
  }

  return (
    <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white font-sans overflow-x-hidden pb-20 relative">
      <nav className="relative z-20 flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#070709]">
        <Link href="/" className="text-2xl font-black tracking-tight flex items-center gap-2"><CineMindLogo className="w-8 h-8" />CineMind</Link>
      </nav>

      <div className="w-full max-w-5xl mx-auto px-4 mt-8 mb-4 text-center">
        <h1 className="text-3xl font-black text-orange-500">{t('title')}</h1>
        <div className="flex justify-center gap-2 mt-4" dir="ltr">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-2 w-16 rounded-full transition-colors ${i <= pulseCount ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' : 'bg-white/10'}`} />
          ))}
        </div>
      </div>

      {activeToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-zinc-900 border border-orange-500/50 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300">
          <span className="text-2xl mr-2">{activeToast.emoji}</span>
          <span className="text-orange-300 font-bold">{activeToast.text}</span>
        </div>
      )}

      <div className="max-w-2xl mx-auto flex flex-col items-center mt-8 px-4">
        <div className={`w-full bg-[#111113] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl relative transition-all duration-300 ${animateCard ? 'opacity-0 -translate-x-10 scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
          <div className="relative w-full h-[300px] md:h-[450px] bg-zinc-900">
            <ImageWithFallback src={session.currentQuestion?.movie?.posterUrl || ''} alt="Movie" className="absolute inset-0 w-full h-full object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#111113] to-transparent"></div>
          </div>
          <div className="px-6 md:px-8 pb-10 relative z-10 -mt-20 text-center">
            <h3 className="text-3xl md:text-4xl font-black mb-2 text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">{session.currentQuestion?.movie?.title}</h3>
            <p className="text-xs text-zinc-300 font-mono mb-8 uppercase tracking-[0.2em]">{session.currentQuestion?.movie?.originalDetails}</p>
            <div className="text-xl md:text-2xl font-black text-white bg-white/[0.04] py-5 px-6 rounded-3xl border border-white/10 shadow-inner flex items-center justify-center mx-2 min-h-[90px] leading-tight">
              {session.currentQuestion?.text}
            </div>
          </div>
        </div>

        <div className={`w-full mt-10 flex flex-col items-center transition-opacity duration-300 ${animateCard ? 'opacity-0' : 'opacity-100'}`}>
          <div className="w-full flex justify-between items-center px-4 mb-6">
            <span className="text-sm text-zinc-500 font-black uppercase">{tScan('hate')}</span>
            <div className="flex gap-2 sm:gap-4 md:gap-6" dir="ltr">
              {[1, 2, 3, 4, 5].map((star) => (
                <button 
                  key={star} disabled={loading} onMouseEnter={() => setHoveredStar(star)} onMouseLeave={() => setHoveredStar(null)} onClick={() => handleStarClick(star as AnswerType)} 
                  className="p-1 sm:p-2 group transition-transform hover:scale-110 active:scale-90"
                >
                  <svg className={`w-12 h-12 md:w-16 md:h-16 transition-all duration-200 ${(hoveredStar !== null && (locale === 'he' ? star >= hoveredStar : star <= hoveredStar)) ? 'text-orange-500 fill-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] scale-110' : 'text-zinc-700 fill-transparent stroke-current stroke-1'}`} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                </button>
              ))}
            </div>
            <span className="text-sm text-zinc-500 font-black uppercase">{tScan('love')}</span>
          </div>
          <button disabled={loading} onClick={() => submitAnswer('NOT_SEEN')} className="mt-4 px-8 py-3 rounded-full border border-white/10 hover:bg-white/10 text-base font-bold text-zinc-400 transition-all">
            {tScan('not_seen')}
          </button>
        </div>
      </div>
    </main>
  );
}
