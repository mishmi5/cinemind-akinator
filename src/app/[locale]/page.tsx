'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
// The banner above the fold used to be Hebrew on the English site — the very first line an
// English visitor read was in a script they may not know.
import tickerHe from '@/data/ticker-sentences.json';
import tickerEn from '@/data/ticker-sentences.en.json';

interface MoviePoster {
  id: number;
  posterUrl: string;
}

// קומפוננטת פוסטר חכמה שמשתמשת בתור גיבוי דינמי למקרה של נפילה
const SmartPoster = ({ movie, getNextBackup }: { movie: MoviePoster, getNextBackup: () => MoviePoster | null }) => {
  const [currentMovie, setCurrentMovie] = useState<MoviePoster>(movie);

  useEffect(() => { setCurrentMovie(movie); }, [movie]);

  return (
    <img 
      src={currentMovie.posterUrl} 
      alt={`Movie ${currentMovie.id}`}
      className="object-cover w-full h-full" 
      onError={() => {
        // במקרה של שגיאה - מושכים סרט ייחודי חדש מתור הגיבוי! לא פלייסבולדר ולא תמונה קבועה.
        const next = getNextBackup();
        if (next) setCurrentMovie(next);
      }}
    />
  );
};

import { MotionWrapper } from '@/components/MotionWrapper';
import { useTranslations, useLocale } from 'next-intl';

export default function LandingPage() {
  const locale = useLocale();
  const t = useTranslations('Index');
  const tickerSentences = locale === 'en' ? tickerEn : tickerHe;
  const [ticker, setTicker] = useState(tickerSentences[0]);
  const [displayMovies, setDisplayMovies] = useState<MoviePoster[]>([]);
  const [postersLoading, setPostersLoading] = useState(true);
  
  // תור גיבוי לסרטים
  const backupQueue = useRef<MoviePoster[]>([]);

  useEffect(() => {
    const fetchLivePosters = async () => {
      try {
        const res = await fetch('/api/trending');
        const data = await res.json();
        
        if (data.movies && data.movies.length >= 5) {
          // Fisher-Yates shuffle for uniform randomization
          const shuffled = [...data.movies];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          
          setDisplayMovies(shuffled.slice(0, 5));
          backupQueue.current = shuffled.slice(5);
        }
      } catch (err) {
        console.error("Error fetching posters:", err);
      } finally {
        setPostersLoading(false);
      }
    };

    fetchLivePosters();

    const messages = tickerSentences;
    let i = Math.floor(Math.random() * messages.length); // Start randomly
    setTicker(messages[i]);
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setTicker(messages[i]);
    }, 9000); // 9 seconds per message so it's easily readable
    return () => clearInterval(interval);
  }, [tickerSentences]);

  const getNextBackup = useCallback((): MoviePoster | null => {
    if (backupQueue.current.length > 0) {
      return backupQueue.current.shift() || null; // מושך את הראשון בתור ומוציא אותו
    }
    return null;
  }, []);

  return (
    <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-surface-0 text-white font-sans overflow-x-hidden selection:bg-rose-500/30">
      <div className="w-full bg-gradient-to-r from-rose-600 to-indigo-600 text-center py-2 px-4 text-xs font-bold tracking-wide flex justify-center items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
        <span className="animate-in fade-in slide-in-from-bottom-1 duration-500" key={ticker}>{ticker}</span>
      </div>

      <Navbar />

      <MotionWrapper className="relative z-10 flex flex-col items-center pt-16 pb-16 px-4 max-w-5xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter leading-tight mb-8">
          {t('title')}
        </h1>
        <h2 className="text-xl md:text-2xl text-gray-400 font-medium max-w-3xl leading-relaxed mb-10">
          {t('subtitle')}
        </h2>

        <div className="bg-black/40 border border-white/10 rounded-panel p-8 md:p-12 mb-12 w-full max-w-3xl backdrop-blur-md shadow-raise relative overflow-hidden flex flex-col items-center">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px]"></div>
          
          {/* The button comes BEFORE the riff. Below it, the paragraph ran seven lines on a phone
              and pushed the only call to action on the landing page to y=867 in an 812px viewport —
              a visitor's first screen was a wall of text with nothing to press. The copy is
              unchanged; it now reads as what it is, the pitch under the button. */}
          <Link
            href="/quiz"
            className="group relative inline-flex items-center justify-center gap-2 px-10 py-5 bg-gradient-to-r from-accent to-accent-strong rounded-control text-white font-bold text-xl hover:from-accent-soft hover:to-accent transition-all duration-300 shadow-accent active:scale-95 z-10"
          >
            <span>{t('cta')}</span>
          </Link>

          {/* The subtitle is already the <h2> directly above this card — repeating it here
              printed the same sentence twice on the landing page. */}
          <p className="text-zinc-400 leading-relaxed mt-8 relative z-10 text-lg text-center whitespace-pre-wrap">
            {t('description')}
          </p>
        </div>

        {/* Dynamic Carousel - Hermetically Protected */}
        <div className="relative w-full max-w-5xl mx-auto py-8 flex overflow-x-auto snap-x hide-scrollbar gap-4 md:justify-center px-4 min-h-[250px]">
          <div className="absolute left-0 top-0 bottom-0 w-12 md:w-24 bg-gradient-to-r from-surface-0 to-transparent z-10 pointer-events-none"></div>
          <div className="absolute right-0 top-0 bottom-0 w-12 md:w-24 bg-gradient-to-l from-surface-0 to-transparent z-10 pointer-events-none"></div>
          
          {postersLoading ? (
            <div className="w-full flex justify-start md:justify-center items-center gap-4 opacity-50 px-4 md:px-0">
               {[1,2,3,4,5].map(i => <div key={i} className="shrink-0 w-24 sm:w-28 md:w-44 aspect-[2/3] bg-zinc-800 rounded-xl animate-pulse"></div>)}
            </div>
          ) : (
            displayMovies.map((movie) => (
              <div key={movie.id} className="shrink-0 snap-center w-28 sm:w-32 md:w-44 aspect-[2/3] bg-surface-2 rounded-xl border border-white/10 overflow-hidden relative shadow-raise opacity-60 hover:opacity-100 hover:-translate-y-2 transition-all duration-500 cursor-pointer animate-in fade-in zoom-in duration-500">
                <SmartPoster movie={movie} getNextBackup={getNextBackup} />
              </div>
            ))
          )}
        </div>
      </MotionWrapper>
    </main>
  );
}