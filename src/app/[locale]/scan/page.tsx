'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { CineMindLogo } from '@/components/Navbar';
import type { SessionState, AnswerType, MovieContext, EasterEggType } from '@/types';
import quizToasts from '@/data/quiz-toasts.json';
import posthog from 'posthog-js';
import RoastReveal from '@/components/roast/RoastReveal';
import { useAuth } from '@/context/AuthContext';

interface StartingMovie extends MovieContext {
  dynamicQuestion: string;
}

// Hermetic fallback component — transient network blips get ONE retry with a
// cache-buster before surrendering to the CSS placeholder. A single dropped
// packet must not blank the poster for the whole question.
const ImageWithFallback = ({ src, alt, className }: { src: string, alt: string, className: string }) => {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(false);
    setAttempt(0);
  }, [src]);

  const handleError = () => {
    if (attempt < 1) {
      setTimeout(() => setAttempt(a => a + 1), 1200);
    } else {
      setError(true);
    }
  };

  if (error || !src) {
    return (
      <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-950 ${className.replace('opacity-90', '').replace('opacity-80', '')}`}>
        <svg className="w-16 h-16 text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16M3 8h4m-4 8h4M17 8h4m-4 8h4M14 4H10v16h4V4z" />
        </svg>
        <span className="text-zinc-600 font-black tracking-[0.3em] text-xs uppercase">CineMind</span>
      </div>
    );
  }
  
  const effectiveSrc = attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;
  return <img key={effectiveSrc} src={effectiveSrc} alt={alt} className={className} onError={handleError} />;
};

const STARTING_POOL: StartingMovie[] = [
  { id: "155", title: "האביר האפל", originalDetails: "The Dark Knight · 2008", rating: 9.0, posterUrl: "/api/poster?path=/3KAtr9OX8Bq2FAvZtrjYcdUuBYp.jpg", overview: "באטמן מתמודד עם הג'וקר, פושע פסיכופתי...", trailerId: "EXeTwQWrcwY", dynamicQuestion: "האם היית רוצה לראות מאבק פסיכולוגי בין גיבור לא נחמד לנבל גאון?", easterEgg: { type: 'oscar' }, _genreIds: [28, 80] },
  { id: "27205", title: "התחלה", originalDetails: "Inception · 2010", rating: 8.8, posterUrl: "/api/poster?path=/nPO8aNT4uGtDAY0bZZZACfP66Lo.jpg", overview: "גנב מקצועי נכנס לחלומות של אנשים...", trailerId: "YoHD9XEInc0", dynamicQuestion: "מד\"ב מתוחכם על חלומות ומציאות מדומה נשמע טוב?",easterEgg: { type: 'oscar' }, _genreIds: [28, 878] },
  { id: "680", title: "ספרות זולה", originalDetails: "Pulp Fiction · 1994", rating: 8.9, posterUrl: "/api/poster?path=/hBS14aC5tyUasDhMGy0ihvp8hTB.jpg", overview: "סיפוריהם של פושעים בלוס אנג'לס...", trailerId: "s7EdQ4FqbhY", dynamicQuestion: "עד כמה אתה מתחבר לדיאלוגים שנונים, דם, וקפיצות בזמן?",easterEgg: { type: 'wazzap' }, _genreIds: [80] },
  { id: "348", title: "הנוסע השמיני", originalDetails: "Alien · 1979", rating: 8.5, posterUrl: "/api/poster?path=/odmhIedIOFZXj98yLcXRBl5UrNq.jpg", overview: "צוות חללית נתקל ביצור חייזרי קטלני...", trailerId: "LjLamj-b0I8", dynamicQuestion: "קלאסיקת אימה בחלל עם מפלצת בלתי ניתנת לעצירה - כן או לא?",easterEgg: { type: 'blood' }, _genreIds: [27, 878] },
  { id: "603", title: "מטריקס", originalDetails: "The Matrix · 1999", rating: 8.7, posterUrl: "/api/poster?path=/xC1MsxS9wJ3EcBjIRJv8PkhFtzJ.jpg", overview: "העולם שאנחנו מכירים הוא בעצם אשליה.", trailerId: "vKQi3bBA1y8", dynamicQuestion: "האם מציאות מדומה, סייברפאנק וקרבות קונג-פו עושים לך את זה?",easterEgg: { type: 'matrix' }, _genreIds: [878, 28] },
  { id: "98", title: "גלדיאטור", originalDetails: "Gladiator · 2000", rating: 8.2, posterUrl: "/api/poster?path=/zJjf7dAIBBHsJjK6L38D3bzOWek.jpg", overview: "גנרל רומי נבגד והופך לגלדיאטור...", trailerId: "owK1qxDselE", dynamicQuestion: "אפוס היסטורי ענק עם קרבות חרבות עד המוות - מדבר אליך?",easterEgg: { type: 'oscar' }, _genreIds: [28, 12] },
  { id: "157336", title: "בין כוכבים", originalDetails: "Interstellar · 2014", rating: 8.6, posterUrl: "/api/poster?path=/9W7qYnmi1W3648YXVJvpjk82MUf.jpg", overview: "מסע אפי בחלל להצלת האנושות...", trailerId: "zSWdZVtXT7E", dynamicQuestion: "מסע חלל מרהיב שגורם לך לחשוב על משמעות החיים - איך זה נשמע?",easterEgg: { type: 'oscar' }, _genreIds: [878, 12] },
  { id: "4232", title: "צעקה", originalDetails: "Scream · 1996", rating: 8.4, posterUrl: "/api/poster?path=/lr9ZIrmuwVmZhpZuTCW8D9g0ZJe.jpg", overview: "רוצח סדרתי במסכה רודף אחרי קבוצת בני נוער.", trailerId: "AWm_mkbdpCA", dynamicQuestion: "האם מתאים לך רוצח בשר ודם שמחסל בני נוער אחד אחד (סלאשר)?",easterEgg: { type: 'wazzap' }, _genreIds: [27] },
  { id: "22970", title: "בקתה ביער", originalDetails: "The Cabin in the Woods · 2011", rating: 8.0, posterUrl: "/api/poster?path=/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg", overview: "חמישה חברים נוסעים לבקתה מבודדת ומגלים שהכל חלק מניסוי מטורף.", trailerId: "NsIilFNNmkY", dynamicQuestion: "האם היית רוצה סרט שמפרק את כל חוקי האימה בצורה קומית וגאונית?",easterEgg: { type: 'blood' }, _genreIds: [27, 35] },
  { id: "11036", title: "היומן", originalDetails: "The Notebook · 2004", rating: 8.0, posterUrl: "/api/poster?path=/s4kMNZZwJ0LXnR6iHpDMfuehhHe.jpg", overview: "סיפור אהבה מרגש חוצה עשורים מעבר להבדלי מעמדות.", trailerId: "FC6biTjEyZw", dynamicQuestion: "בא לך סיפור אהבה קלאסי סוחף ורומנטי שיגרום לך לבכות?", easterEgg: { type: 'oscar' }, _genreIds: [10749, 18] },
  { id: "862", title: "צעצוע של סיפור", originalDetails: "Toy Story · 1995", rating: 8.3, posterUrl: "/api/poster?path=/oLII3pJFSfeLFDKCZbaUIAXEqqz.jpg", overview: "צעצועים קמים לתחייה כשבני האדם לא מסתכלים.", trailerId: "v-PjgYDrg70", dynamicQuestion: "היית זורם על הרפתקת אנימציה מופלאה ומחממת לב לכל המשפחה?", easterEgg: { type: 'oscar' }, _genreIds: [16, 10751, 35] }
];

const SOUNDS = {
  // Dead Google Sounds API removed to prevent CORB / Uncaught promise errors
};

const getDynamicPhrase = (count: number) => {
  if (count < 2) return null; 
  if (count === 2 || count === 3) return "🧠 המערכת מזהה דפוס מעניין בטעם שלך...";
  if (count === 4 || count === 5) return "🎯 מצמצמים מ-50,000 סרטים ל-Top 1%...";
  if (count === 6 || count === 7) return "⚡ ה-DNA הקולנועי שלך כמעט מפוענח לחלוטין.";
  return "🔥 קרובים לשלמות. רק המדויקים ביותר שרדו את הסינון.";
};

export default function ScanMovieEvaluation() {
  const locale = useLocale();
  const t = useTranslations('Scan');
  const tNav = useTranslations('Navigation');
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [activeTrailer, setActiveTrailer] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [animateCard, setAnimateCard] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [historyState, setHistoryState] = useState<SessionState[]>([]);
  const [activeToast, setActiveToast] = useState<{ text: string, emoji: string } | null>(null);
  const [activeEffect, setActiveEffect] = useState<EasterEggType | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [timeLeft, setTimeLeft] = useState(899); // 14:59 in seconds
  const [showSocialProof, setShowSocialProof] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  // Titles shown this session — sent to the server so same-title movies
  // (remakes, re-releases) are never served twice in one quiz.
  const seenTitlesRef = useRef<string[]>([]);

  useEffect(() => {
    Object.keys(SOUNDS).forEach(key => {
      const audio = new Audio(SOUNDS[key as keyof typeof SOUNDS]);
      audio.preload = "auto";
      audioRefs.current[key] = audio;
    });

    const localAsked = JSON.parse(localStorage.getItem('cinemind_asked_movies') || '[]');

    const initSession = async () => {
      try {
        const res = await fetch('/api/next-question', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'x-asked-ids': JSON.stringify(localAsked),
            'x-locale': locale
          },
          body: JSON.stringify({ sessionId: `session_${Date.now()}`, isInit: true })
        });
        if (res.ok) {
          const data: SessionState = await res.json();
          const newHistory = [...localAsked, ...(data.askedMovieIds || [])].slice(-20);
          localStorage.setItem('cinemind_asked_movies', JSON.stringify(newHistory));
          setSession(data);
        } else {
          loadLocalFallback(localAsked);
        }
      } catch (e) { loadLocalFallback(localAsked); }
    };
    
    initSession();
  }, []);

  const loadLocalFallback = (localAsked: string[]) => {
    let availableStarts = STARTING_POOL.filter(m => !localAsked.includes(m.id));
    if (availableStarts.length === 0) availableStarts = STARTING_POOL; 
    const randomStart = availableStarts[Math.floor(Math.random() * availableStarts.length)];
    setSession({
      sessionId: `session_${Date.now()}`, isComplete: false, confidenceScore: 0.01, historyCount: 0,
      askedMovieIds: [randomStart.id], currentVectorState: { possibleMoviesRemaining: 15000, leadingMicroGenres: [] },
      currentQuestion: { id: `init_${Date.now()}`, text: randomStart.dynamicQuestion, movie: randomStart },
      userAffinities: {}
    });
  };

  const showToast = (messages: string[], emoji: string) => {
    const text = messages[Math.floor(Math.random() * messages.length)];
    setActiveToast({ text, emoji });
    setTimeout(() => setActiveToast(null), 4000);
  };

  const handleStarClick = (star: AnswerType) => {
    if (!session || !session.currentQuestion || session.isComplete || loading) return;

    if (star === 5) {
      // Random visual effect
      const effects: EasterEggType[] = ['oscar', 'blood', 'wazzap', 'matrix'];
      setActiveEffect(effects[Math.floor(Math.random() * effects.length)]);
      
      showToast(quizToasts.fiveStarToasts, '✨');
      
      try {
        const audioEl = document.getElementById(`audio-${activeEffect}`) as HTMLAudioElement;
        if (audioEl) {
          audioEl.currentTime = 0;
          audioEl.volume = 0.8;
          audioEl.play().catch(e => console.warn("Audio play blocked", e));
        }
      } catch (e) {}
      setTimeout(() => setActiveEffect(null), 2000);
    } else if (star === 4) {
      showToast(quizToasts.fourStarToasts, '😏');
    } else if (star === 3) {
      showToast(quizToasts.threeStarToasts, '🤷');
    } else if (star === 2) {
      showToast(quizToasts.twoStarToasts, '😐');
    } else if (star === 1) {
      showToast(quizToasts.oneStarToasts, '💩');
    }
    
    submitAnswer(star);
  };

  const submitAnswer = async (answer: AnswerType) => {
    setLoading(true);
    setAnimateCard(true);

    // שמירה בהיסטוריה כדי לאפשר "אחורה"
    setHistoryState(prev => [...prev, session!]);
    const currentTitle = session!.currentQuestion?.movie?.title;
    if (currentTitle && !seenTitlesRef.current.includes(currentTitle)) {
      seenTitlesRef.current.push(currentTitle);
    }

    try {
      const doFetch = () => fetch('/api/next-question', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-confidence': session!.confidenceScore.toString(),
          'x-history-count': session!.historyCount.toString(),
          'x-asked-ids': JSON.stringify(session!.askedMovieIds),
          'x-affinities': JSON.stringify(session!.userAffinities || {}),
          'x-locale': locale
        },
        body: JSON.stringify({
          sessionId: session!.sessionId, questionId: session!.currentQuestion!.id,
          answer, movieId: session!.currentQuestion!.movie?.id,
          genreIds: session!.currentQuestion!.movie?._genreIds || [],
          niches: session!.currentQuestion!.movie?._niches || [],
          // Same-title repeats (remakes/re-releases) feel like duplicates — let the
          // server exclude them. Body (not header) because Hebrew titles aren't
          // valid ISO-8859-1 header values.
          askedTitles: seenTitlesRef.current.slice(-60)
        })
      });

      let response = await doFetch();
      // A rate-limited or transiently failing request must NOT silently swallow
      // the user's vote — that erodes their taste profile without any feedback.
      // Back off briefly and retry up to twice before giving up.
      for (let attempt = 0; !response.ok && (response.status === 429 || response.status >= 500) && attempt < 2; attempt++) {
        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
        response = await doFetch();
      }

      if (!response.ok) throw new Error('Failed');
      const newState: SessionState = await response.json();
      // Union with everything this session has already seen — after using "Back",
      // the restored (older) asked-list could let the server re-serve a movie the
      // user already answered. A movie must never appear twice in one quiz.
      newState.askedMovieIds = Array.from(new Set([...(session!.askedMovieIds || []), ...(newState.askedMovieIds || [])]));
      localStorage.setItem('cinemind_asked_movies', JSON.stringify(newState.askedMovieIds));
      
      // EXPOSE STATE FOR E2E TESTING
      if (newState.isComplete) {
        (window as any).__cinemind_final_affinities = newState.userAffinities;
        (window as any).__cinemind_final_movies = newState.finalMovies || [];
      }

      if (newState.isComplete && user) {
        const token = await user.getIdToken();
        fetch('/api/user/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            tasteVector: {
              affinities: newState.userAffinities || {},
              confidenceScore: newState.confidenceScore,
              totalAnswers: newState.historyCount,
            },
            proofToken: (newState as any).proofToken
          }),
        }).catch(err => console.error("Bootstrap failed", err));
      }

      setTimeout(() => {
        setSession(newState);
        setHoveredStar(null);
        if (typeof answer === 'number' && answer >= 4) setCombo(prev => prev + 1); else setCombo(0);
        setAnimateCard(false); 
        setLoading(false);
      }, 300);
    } catch (error) {
      setLoading(false);
      setAnimateCard(false);
    }
  };

  const handleBack = () => {
    if (historyState.length > 0) {
      const prevState = historyState[historyState.length - 1];
      setHistoryState(prev => prev.slice(0, -1));
      // Restore the previous question but KEEP the full asked-history — rolling
      // it back would let already-seen movies be served again.
      setSession({ ...prevState, askedMovieIds: session?.askedMovieIds || prevState.askedMovieIds });
      showToast(quizToasts.backButtonToasts, '🙄');
    }
  };

  // FOMO Mechanics Effect
  useEffect(() => {
    if (session?.isComplete && !isRevealed) {
      const timer = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      
      const socialTimer = setTimeout(() => {
        setShowSocialProof(true);
        setTimeout(() => setShowSocialProof(false), 5000);
      }, 7000); // Show social proof after 7 seconds
      
      return () => {
        clearInterval(timer);
        clearTimeout(socialTimer);
      };
    }
  }, [session?.isComplete, isRevealed]);

  if (!session) {
    return (
      <main className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse"><CineMindLogo className="w-20 h-20" /><div className="text-zinc-500 font-bold tracking-widest text-lg">{t('loading_db')}</div></div>
      </main>
    );
  }

  const confidencePercentage = Math.max(1, Math.round(session.confidenceScore * 100));
  const dynamicPhrase = getDynamicPhrase(session.historyCount);
  return (
    <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#0a0a0c] text-white font-sans overflow-x-hidden pb-20 relative">
      
      {activeEffect === 'oscar' && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="absolute text-7xl animate-[fall_1.5s_ease-in_forwards]" style={{ left: `${Math.random() * 100}vw`, animationDelay: `${Math.random() * 0.3}s` }}>🏆</div>
          ))}
          <style>{`@keyframes fall { 0% { transform: translateY(-100px) rotate(0deg); } 100% { transform: translateY(100vh) rotate(360deg); } }`}</style>
        </div>
      )}
      {activeEffect === 'blood' && (
        <div className="fixed inset-0 z-[100] pointer-events-none bg-red-900/50 mix-blend-overlay">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle,rgba(220,38,38,0.9)_0%,transparent_80%)] animate-[ping_1s_ease-out_forwards]"></div>
        </div>
      )}
      {activeEffect === 'wazzap' && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-9xl font-black text-rose-500 transform -rotate-12 animate-bounce drop-shadow-[0_0_50px_rgba(225,29,72,1)] tracking-tighter">WAZZZAAAP?! 😜</div>
        </div>
      )}
      {activeEffect === 'matrix' && (
        <div className="fixed inset-0 z-[100] pointer-events-none bg-black/90 flex flex-col">
          {Array.from({ length: 80 }).map((_, i) => (
            <div key={i} className="text-emerald-500 font-mono text-xl font-bold opacity-80 absolute" style={{ left: `${Math.random() * 100}vw`, top: `${Math.random() * 100}vh` }}>{Math.random().toString(36).substring(2, 10)}</div>
          ))}
        </div>
      )}

      {activeTrailer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg p-4 animate-in fade-in duration-300">
          <div className="relative w-full max-w-6xl aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_120px_rgba(225,29,72,0.4)]">
            <button onClick={() => setActiveTrailer(null)} className="absolute top-6 right-6 z-10 px-6 py-3 bg-black/60 hover:bg-black/90 text-white rounded-full border border-white/20 transition-all font-bold">✕</button>
            <iframe src={`https://www.youtube.com/embed/${activeTrailer}?autoplay=1&rel=0&modestbranding=1`} className="w-full h-full" allowFullScreen></iframe>
          </div>
        </div>
      )}

      {activeToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-zinc-900 border border-rose-500/50 rounded-2xl shadow-2xl animate-in slide-in-from-bottom-5 fade-in duration-300 max-w-sm text-center">
          <span className="text-3xl mb-2 block">{activeToast.emoji}</span>
          <span className="text-rose-300 font-bold text-base leading-tight">{activeToast.text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')}</span>
        </div>
      )}

      <nav className="relative z-20 flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#070709]">
        <Link href="/" className="text-2xl font-black tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity"><CineMindLogo className="w-8 h-8" />CineMind</Link>
        <div className="flex items-center gap-6 text-sm font-medium text-zinc-400"><Link href="/arena" className="hover:text-rose-400 font-bold transition-colors text-base">👾 {tNav('arena')}</Link><span className="text-zinc-600">{t('anonymous')}</span></div>
      </nav>

      <div className="w-full max-w-5xl mx-auto px-4 mt-8 mb-4 flex items-center justify-between">
        <div className="flex-1 bg-white/10 rounded-full h-2 relative overflow-hidden ml-6">
          <div className="absolute top-0 right-0 h-full bg-gradient-to-l from-rose-600 to-orange-500 transition-all duration-700 shadow-[0_0_10px_rgba(244,63,94,0.5)]" style={{ width: `${confidencePercentage}%` }}></div>
        </div>
        <span className="text-rose-500 font-black text-sm">{confidencePercentage}%</span>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 mb-6 flex justify-between items-center text-sm font-bold">
        {combo > 0 ? (
          <div className="text-rose-500 font-black animate-bounce text-base drop-shadow-[0_0_10px_rgba(225,29,72,0.5)]">🔥 Combo {combo}</div>
        ) : <div />}
        <div className="text-orange-500 flex items-center gap-2 text-base"><span>⚡</span> {t('brain_scan')}</div>
      </div>

      <div className="max-w-2xl mx-auto flex flex-col items-center">
        
        {session.isComplete ? (
          <div className="w-full mt-12 animate-in fade-in zoom-in duration-700">
            <div className="text-center mb-12"><span className="inline-block px-6 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full text-base font-bold mb-6">✅ {t('perfect_match')}</span><h2 className="text-6xl font-black mb-4">{t('cracked_you')}</h2><p className="text-zinc-400 text-xl">{t('perfect_movie_desc')}</p></div>
            
            {session.finalMovies?.map((movie) => (
              <div key={movie.id} className="relative bg-[#111113] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col items-center p-8 md:p-12 text-center mb-12 max-w-4xl mx-auto">
                
                {/* Blurred Content Container */}
                <div className={`transition-all duration-1000 ${isRevealed ? 'opacity-100 blur-none' : 'opacity-30 blur-[15px] select-none pointer-events-none'} w-full`}>
                  <div className="w-48 md:w-64 aspect-[2/3] mx-auto relative rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.8)] bg-zinc-900 mb-8">
                    <ImageWithFallback src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
                  </div>
                  <h3 className="text-4xl md:text-5xl font-black mb-4 text-white" dir={locale === 'he' ? 'rtl' : 'ltr'}>
                    {isRevealed ? movie.title : `${movie.title.charAt(0)}_______`}
                  </h3>
                  <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-sm font-bold mb-6">
                    {movie.matchScore}% {t('match_perfect')}
                  </div>
                  <p className="text-zinc-300 text-base leading-relaxed max-w-xl mx-auto">
                    {isRevealed ? movie.overview : t('hidden_overview')}
                  </p>
                </div>

                {/* Paywall Overlay */}
                {!isRevealed && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/60 to-transparent p-4 sm:p-8">
                    <div className="bg-zinc-900/95 backdrop-blur-3xl border border-rose-500/40 rounded-[2rem] p-6 sm:p-10 max-w-lg w-full text-center shadow-[0_0_80px_rgba(225,29,72,0.25)] animate-in slide-in-from-bottom-10 fade-in duration-700">
                      <div className="text-5xl mb-6">🤫</div>
                      <h4 className="text-3xl font-black text-white mb-4">{t('your_movie_waits')}</h4>
                      {/* Personalized hook: the user's MEASURED taste axes — real data
                          is the most persuasive sales copy there is. */}
                      {(session.currentVectorState?.leadingMicroGenres?.length ?? 0) > 1 && (
                        <div className="flex flex-wrap justify-center gap-2 mb-4">
                          {session.currentVectorState.leadingMicroGenres.slice(1, 4).map((axis) => (
                            <span key={axis} className="px-3 py-1 bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 rounded-full text-sm font-bold">
                              {axis}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-zinc-400 mb-8 text-lg font-medium leading-relaxed">
                        {t('cut_bullshit')}
                      </p>
                      
                      <div className="flex flex-col gap-4 w-full relative">
                        {/* FOMO Timer */}
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600/20 border border-red-500/30 text-red-400 font-mono text-sm px-4 py-1.5 rounded-full flex items-center gap-2 whitespace-nowrap animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                          <span>⏱️ {t('fomo_timer_warning')}</span>
                          <span className="font-bold">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</span>
                        </div>

                        <Link 
                          href="/pricing" 
                          onClick={() => posthog.capture('paywall_click_starter')}
                          className="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl font-black text-xl transition-all shadow-[0_0_30px_rgba(225,29,72,0.4)] hover:scale-[1.02] flex items-center justify-center gap-2 animate-[pulse_2s_infinite]"
                        >
                          {posthog.getFeatureFlag('paywall_cta_text') === 'test' ? t('discover_now') : t('discover_now')} <span>—</span> ₪9 {t('only')}
                        </Link>
                        
                        {/* Loss Aversion */}
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wide px-2 text-center">
                          ⚠️ {t('fomo_loss_aversion')}
                        </div>

                        <Link 
                          href="/pricing" 
                          onClick={() => posthog.capture('paywall_click_elite')}
                          className="w-full py-4 bg-white/[0.03] hover:bg-white/10 text-white border border-white/10 rounded-2xl font-bold transition-all hover:border-white/20"
                        >
                          {t('or_elite')}
                        </Link>
                      </div>
                      
                      <div className="mt-8 pt-6 border-t border-white/5">
                        <p className="text-zinc-500 text-sm">
                          {t('already_elite')} <button onClick={() => setIsRevealed(true)} className="text-rose-400 hover:text-rose-300 font-bold transition-colors underline underline-offset-4">{t('login_test')}</button>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {isRevealed && movie.trailerId && (
                  <button onClick={() => setActiveTrailer(movie.trailerId)} className="mt-8 px-8 py-3 bg-rose-600/90 hover:bg-rose-500 text-white rounded-full flex items-center justify-center gap-2 font-bold transition-all shadow-[0_0_20px_rgba(225,29,72,0.5)] hover:scale-105 z-30">
                    ▶ {t('watch_trailer')}
                  </button>
                )}
              </div>
            ))}
            
            {isRevealed && (
              <div className="mt-12 bg-gradient-to-r from-rose-500/10 to-indigo-500/10 border border-indigo-500/30 rounded-[2rem] p-8 text-center max-w-3xl mx-auto shadow-[0_0_30px_rgba(99,102,241,0.15)] relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-rose-500 to-indigo-500"></div>
                <h3 className="text-2xl font-black mb-3 text-white">{t('liked_recommendation')}</h3>
                <p className="text-zinc-300 text-base mb-6 leading-relaxed">
                  {t('keep_enjoying')}
                </p>
                <Link href="/pricing" className="inline-block px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:scale-105 active:scale-95">
                  {t('upgrade_elite')}
                </Link>
              </div>
            )}
            
            <div className="mt-16 border-t border-zinc-800 pt-16 w-full">
              <RoastReveal />
            </div>

            {/* FOMO Social Proof Toast */}
            {showSocialProof && (
              <div className="fixed bottom-6 right-6 bg-zinc-900/95 border border-emerald-500/30 shadow-[0_10px_40px_rgba(16,185,129,0.2)] p-4 rounded-2xl z-50 flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-500">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping relative">
                  <div className="absolute inset-0 bg-emerald-500 rounded-full opacity-50"></div>
                </div>
                <span className="text-white text-sm font-bold">{t('fomo_social_proof')}</span>
              </div>
            )}

          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            
            <div className={`w-full bg-[#111113] border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl relative transition-all duration-300 ${animateCard ? 'opacity-0 -translate-x-10 scale-95' : 'opacity-100 translate-x-0 scale-100'}`}>
              
              <div className="relative w-full h-[55vh] min-h-[400px] max-h-[550px] md:h-[650px] md:max-h-none bg-zinc-900">
                <ImageWithFallback src={session.currentQuestion?.movie?.posterUrl || ''} alt="Movie" className="absolute inset-0 w-full h-full object-cover object-top opacity-100" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111113] via-transparent to-transparent"></div>
                {session.currentQuestion?.movie?.trailerId && (
                  <button onClick={() => setActiveTrailer(session.currentQuestion?.movie?.trailerId || null)} className={`absolute top-6 ${locale === 'he' ? 'right-6' : 'left-6'} bg-red-600/90 text-white text-sm font-bold px-5 py-2.5 rounded-full flex items-center gap-2 backdrop-blur-md hover:bg-red-500 transition-colors z-10 shadow-lg`}>
                    ▶ {t('watch_trailer')}
                  </button>
                )}
                <div className="absolute bottom-6 left-6 bg-orange-500 text-white text-base font-black px-4 py-1.5 rounded-xl flex items-center gap-1.5 z-10 shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                  {session.currentQuestion?.movie?.rating} ★
                </div>
              </div>

              <div className="px-6 md:px-8 pb-10 relative z-10 -mt-20 md:-mt-24 text-center">
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-black mb-2 text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">{session.currentQuestion?.movie?.title}</h3>
                <p className="text-xs text-zinc-300 font-mono mb-5 uppercase tracking-[0.2em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{session.currentQuestion?.movie?.originalDetails}</p>
                <p className="text-sm md:text-base text-zinc-200 leading-relaxed mb-8 h-10 md:h-12 overflow-hidden text-ellipsis line-clamp-2 max-w-lg mx-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-medium">{session.currentQuestion?.movie?.overview}</p>
                
                <div className="text-xl sm:text-2xl md:text-3xl font-black text-white bg-white/[0.04] py-5 px-6 md:py-6 md:px-8 rounded-3xl border border-white/10 shadow-inner flex items-center justify-center mx-2 min-h-[90px] md:min-h-[100px] leading-tight">
                  {session.currentQuestion?.text}
                </div>
              </div>
            </div>

            <div className={`w-full mt-10 flex flex-col items-center transition-opacity duration-300 ${animateCard ? 'opacity-0' : 'opacity-100'}`}>
              
              {dynamicPhrase && (
                <div className="text-sm text-zinc-400 flex items-center gap-2 mb-8 animate-in fade-in duration-500 font-medium">
                  <span className="text-rose-500 text-lg">✓</span> {dynamicPhrase}
                </div>
              )}

              <div className="w-full flex justify-between items-center px-4 mb-6">
                <span className="text-sm text-zinc-500 font-black uppercase tracking-widest">{t('hate')}</span>
                <div className="stars-container flex gap-2 sm:gap-4 md:gap-6" dir="ltr">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star} 
                      disabled={loading} 
                      onMouseEnter={() => setHoveredStar(star)} 
                      onMouseLeave={() => setHoveredStar(null)} 
                      onClick={() => handleStarClick(star as AnswerType)} 
                      className="p-1 sm:p-2 group transition-transform hover:scale-110 active:scale-90"
                    >
                      <svg className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 transition-all duration-200 ${(hoveredStar !== null && (locale === 'he' ? star >= hoveredStar : star <= hoveredStar)) ? 'text-orange-500 fill-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.8)] scale-110' : 'text-zinc-700 fill-transparent stroke-current stroke-1'}`} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                    </button>
                  ))}
                </div>
                <span className="text-sm text-zinc-500 font-black uppercase tracking-widest">{t('love')}</span>
              </div>
              
              <div className="flex gap-4 mt-6">
                <button disabled={loading} onClick={() => submitAnswer('NOT_SEEN')} className="px-8 py-3 rounded-full border border-white/10 hover:bg-white/10 text-base font-bold text-zinc-400 transition-all shadow-lg hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                  {t('not_seen')} <span>{locale === 'he' ? '›' : '‹'}</span>
                </button>
                {historyState.length > 0 && (
                  <button disabled={loading} onClick={handleBack} className="px-6 py-3 rounded-full border border-rose-500/30 hover:bg-rose-500/10 text-base font-bold text-rose-400 transition-all shadow-lg hover:shadow-[0_0_15px_rgba(225,29,72,0.2)]">
                    <span>{locale === 'he' ? '‹' : '›'}</span> {t('back')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}