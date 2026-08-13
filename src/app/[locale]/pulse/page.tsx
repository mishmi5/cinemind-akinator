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
  // THE BLACK SCREEN. The end of the pulse used to be a side effect of the XP grant: the third
  // answer called claimPulse(), and only a 2xx from /api/user/pulse ever set isDone. Any other
  // outcome — a 500, an expired token, an offline phone — left animateCard stuck at true, which
  // is opacity-0 on both the card and the star row, on a #0a0a0c page, with no nav below the
  // header. Three answers in, the product went dark. The ending is now its own state: answering
  // three films finishes the pulse, and the reward is reported separately, whether it landed or not.
  const [finished, setFinished] = useState(false);
  const [answers, setAnswers] = useState<{ title: string; rating: AnswerType }[]>([]);
  const [earnedXP, setEarnedXP] = useState<number | null>(null);
  const [claimFailed, setClaimFailed] = useState(false);
  const [initFailed, setInitFailed] = useState(false);

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
        } else {
          setInitFailed(true);
        }
      } catch (e) { console.error(e); setInitFailed(true); }
    };
    initSession();
  }, [alreadyDone, locale]);

  const showToast = (messages: string[], emoji: string) => {
    const text = messages[Math.floor(Math.random() * messages.length)];
    setActiveToast({ text, emoji });
    setTimeout(() => setActiveToast(null), 3000);
  };

  const claimPulse = async () => {
    if (!user) { setClaimFailed(true); return; }
    setLoading(true);
    setClaimFailed(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/user/pulse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEarnedXP(data.xpDelta);
        // Dispatch event so Navbar updates instantly
        window.dispatchEvent(new CustomEvent('xp-updated', { detail: { xp: data.updatedEconomy.xp } }));
      } else {
        setClaimFailed(true);
      }
    } catch (e) {
      console.error(e);
      setClaimFailed(true);
    }
    setLoading(false);
  };

  const submitAnswer = async (answer: AnswerType) => {
    setLoading(true);
    setAnimateCard(true);

    const rated = session?.currentQuestion?.movie?.title;
    if (rated) setAnswers(a => [...a, { title: rated, rating: answer }]);

    if (pulseCount >= 2) {
      // Finished 3 questions — the ending belongs to the user, not to the XP ledger.
      setPulseCount(3);
      setFinished(true);
      setAnimateCard(false);
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
      } else {
        // Same class of trap as the claim: a non-2xx left the card faded out and the buttons
        // dead. Put the card back and let the person answer again.
        setLoading(false);
        setAnimateCard(false);
      }
    } catch (error) {
      setLoading(false);
      setAnimateCard(false);
    }
  };

  const handleStarClick = (star: AnswerType) => {
    if (loading || finished) return;
    if (star === 5) showToast(quizToasts.fiveStarToasts, '✨');
    else if (star === 1) showToast(quizToasts.oneStarToasts, '💩');
    submitAnswer(star);
  };

  if (finished) {
    return (
      <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center px-4 py-16 animate-in fade-in duration-500">
        <div className="text-6xl mb-4">🔥</div>
        <h1 className="text-4xl md:text-5xl font-black mb-3 text-center">{t('success_title')}</h1>

        {/* The reward is reported, not assumed. When the grant fails the person still gets an
            ending and a retry, instead of a page that pretends nothing happened. */}
        {earnedXP !== null ? (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-3xl px-8 py-6 text-center shadow-[0_0_50px_rgba(249,115,22,0.2)] mb-10">
            <div className="text-orange-500 font-black text-4xl mb-1">+{earnedXP} XP</div>
            <div className="text-orange-400/80 font-bold">{t('reward')}</div>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-3xl px-8 py-6 text-center mb-10 max-w-md">
            <p className="text-zinc-300 font-bold mb-4">{claimFailed ? t('claim_failed') : t('claiming')}</p>
            {claimFailed && (
              <button onClick={claimPulse} disabled={loading} className="px-6 py-2 bg-orange-600 hover:bg-orange-500 rounded-full font-black transition-all disabled:opacity-50">
                {t('claim_retry')}
              </button>
            )}
          </div>
        )}

        {/* What the three answers actually were. This is the only thing the pulse truly knows
            about the user — three films is a taste sample, not a profile, and the note says so
            rather than inventing a verdict. */}
        <section className="w-full max-w-md">
          <h2 className="text-lg font-black mb-4 text-zinc-200">{t('summary_title')}</h2>
          <ul className="flex flex-col gap-2 mb-4">
            {answers.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-4 bg-[#111113] border border-white/5 rounded-2xl px-5 py-3">
                <span className="font-bold text-white truncate">{a.title}</span>
                <span className="text-sm font-black text-orange-400 whitespace-nowrap">
                  {a.rating === 'NOT_SEEN' ? t('rating_unseen')
                    : (a.rating as number) >= 4 ? t('rating_loved')
                    : (a.rating as number) === 3 ? t('rating_ok')
                    : t('rating_disliked')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-zinc-400 text-sm leading-relaxed">{t('summary_note')}</p>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 mt-10">
          <Link href="/scan" className="px-8 py-3 bg-rose-600 hover:bg-rose-500 rounded-full font-black transition-all text-center">
            {t('cta_scan')}
          </Link>
          <Link href="/daily" className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-black transition-all text-center">
            {t('cta_daily')}
          </Link>
          <Link href="/" className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full font-black transition-all text-center">
            {t('back_to_arena')}
          </Link>
        </div>
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
        {/* The Pulse keeps its streak on the server, so it needs an account — and every control on
            /login is disabled until sign-in opens. Sending people there was a dead end, so the way
            out points at the daily challenge, which runs without an account. */}
        <p className="text-zinc-400 text-center max-w-sm">
          {locale === 'he'
            ? 'הדופק היומי דורש חשבון, וההרשמה עדיין סגורה. בינתיים אפשר לשחק באתגר היומי בלי חשבון.'
            : 'The Daily Pulse needs an account, and sign-in is not open yet. The daily challenge runs without one.'}
        </p>
        <Link href="/daily" className="mt-8 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold text-white transition-all">
          {tNav('daily')}
        </Link>
      </main>
    );
  }

  // A failed init used to spin the logo forever, which is the same dead end as the black screen
  // one screen later: nothing to read, nothing to press.
  if (initFailed) {
    return (
      <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🎬</div>
        <p className="text-zinc-300 font-bold max-w-sm mb-8">{t('load_failed')}</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 rounded-full font-black transition-all">
            {t('retry')}
          </button>
          <Link href="/" className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full font-black transition-all">
            {t('back_to_arena')}
          </Link>
        </div>
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
          {/* The same inversion that ruined every Hebrew rating on /scan lived on here: dir="ltr"
              inside an RTL page put star 1 — which submits "hated" — physically under "אוהב", and
              the highlight logic then compensated cosmetically so the fill grew from the love end
              while the click still sent 1. Inheriting the page direction keeps the value and the
              label on the same side. The labels also sit ABOVE the row on a phone: at 360px the
              three-across layout pushed "אוהב" to x=-35, entirely off screen, and the user had to
              guess which end meant loved. */}
          <div className="w-full flex flex-col items-center px-4 mb-6">
            <div className="w-full max-w-sm flex justify-between items-center mb-2">
              <span className="text-sm text-zinc-400 font-black uppercase">{tScan('hate')}</span>
              <span className="text-sm text-zinc-400 font-black uppercase">{tScan('love')}</span>
            </div>
            <div className="flex gap-2 sm:gap-4 md:gap-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <button 
                  key={star} disabled={loading} onMouseEnter={() => setHoveredStar(star)} onMouseLeave={() => setHoveredStar(null)}
                  onFocus={() => setHoveredStar(star)} onBlur={() => setHoveredStar(null)}
                  aria-label={locale === 'he' ? `דירוג ${star} מתוך 5` : `Rate ${star} out of 5`}
                  onClick={() => handleStarClick(star as AnswerType)} 
                  className="p-1 sm:p-2 group transition-transform hover:scale-110 active:scale-90"
                >
                  <svg className={`w-12 h-12 md:w-16 md:h-16 transition-all duration-200 ${(hoveredStar !== null && star <= hoveredStar) ? 'text-orange-500 fill-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] scale-110' : 'text-zinc-700 fill-transparent stroke-current stroke-1'}`} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                </button>
              ))}
            </div>
          </div>
          <button disabled={loading} onClick={() => submitAnswer('NOT_SEEN')} className="mt-4 px-8 py-3 rounded-full border border-white/10 hover:bg-white/10 text-base font-bold text-zinc-400 transition-all">
            {tScan('not_seen')}
          </button>
        </div>
      </div>
    </main>
  );
}
