'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Link } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import questionsData from '@/data/arena-questions.json';

// Helper to shuffle array
const shuffleArray = (array: any[]) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export default function ArenaPage() {
  const locale = useLocale();
  const t = useTranslations('Arena');
  const [spoilerAccepted, setSpoilerAccepted] = useState(false);
  const [inGame, setInGame] = useState(false);

  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  
  const [questionIndex, setQuestionIndex] = useState(0);
  const [currentAnswers, setCurrentAnswers] = useState<any[]>([]);

  // Load a new question when index changes
  useEffect(() => {
    if (inGame && questionIndex < questionsData.length) {
      const q = questionsData[questionIndex];
      const answers = [
        { text: q.correctAbsurd, isAbsurd: true },
        ...q.trueFacts.map(fact => ({ text: fact, isAbsurd: false }))
      ];
      setCurrentAnswers(shuffleArray(answers));
    }
  }, [inGame, questionIndex]);

  const handleAnswer = (isAbsurd: boolean) => {
    let newScore = score;
    if (isAbsurd) {
      newScore = score + 50;
      setScore(newScore);
      setFeedback(t('feedback_right'));

      // Update XP globally
      const currentXp = parseInt(localStorage.getItem('cinemind_xp') || '0', 10);
      const nextXp = currentXp + 50;
      localStorage.setItem('cinemind_xp', nextXp.toString());
      window.dispatchEvent(new CustomEvent('xp-updated', { detail: { xp: nextXp } }));

    } else {
      newScore = Math.max(0, score - 20);
      setScore(newScore);
      setFeedback(t('feedback_wrong'));
    }

    // Next question after a short delay
    setTimeout(() => {
      setFeedback(null);
      setQuestionIndex(prev => (prev + 1) % questionsData.length);
    }, 1500);
  };

  return (
    <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden">
      <Navbar />
      
      {!spoilerAccepted ? (
        // Spoiler Warning Screen
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-orange-600/20 rounded-full flex items-center justify-center mb-6 border border-orange-500/30 shadow-[0_0_50px_rgba(249,115,22,0.3)]">
            <span className="text-5xl">⚠️</span>
          </div>
          <h1 className="text-5xl font-black mb-4 uppercase tracking-tighter text-orange-500">{t('spoiler_title')}</h1>
          <p className="text-zinc-300 max-w-xl mx-auto mb-8 text-xl leading-relaxed">
            {t('spoiler_body_1')}
            <br />
            {t('spoiler_body_2')}
          </p>
          
          <button 
            onClick={() => setSpoilerAccepted(true)}
            className="px-10 py-4 bg-orange-600 hover:bg-orange-500 rounded-full font-bold text-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(234,88,12,0.4)]"
          >
            {t('spoiler_cta')}
          </button>
        </div>
      ) : !inGame ? (
        // Matchmaking Screen
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center animate-in fade-in duration-300">
          <div className="w-24 h-24 bg-rose-600/20 rounded-full flex items-center justify-center mb-6 border border-rose-500/30 animate-pulse shadow-[0_0_50px_rgba(225,29,72,0.3)]">
            <span className="text-4xl">👾</span>
          </div>
          <h1 className="text-5xl font-black mb-4 uppercase tracking-tighter">CineMind Arena</h1>
          <p className="text-zinc-400 max-w-lg mx-auto mb-8 text-lg">
            {t('lobby_intro')}
            <br/><span className="text-rose-500 font-bold">{t('lobby_rule')}</span>
            <br/><span className="text-zinc-400 text-sm">{t('lobby_note')}</span>
          </p>

          <div className="flex flex-col gap-4 items-center w-full mt-2">
            <button
              onClick={() => setInGame(true)}
              className="px-12 py-5 bg-gradient-to-r from-rose-500 to-purple-600 rounded-full font-black text-2xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(168,85,247,0.4)]"
            >
              {t('start')}
            </button>
            <Link 
              href="/arena/leaderboard"
              className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full font-bold text-sm text-zinc-300 transition-all hover:text-white"
            >
              {t('leaderboard_link')}
            </Link>
          </div>
        </div>
      ) : (
        // Active Game Screen
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 relative animate-in slide-in-from-bottom-8 duration-500">
          
          <div className="w-full max-w-4xl flex justify-center items-center mb-12 px-4 md:px-8">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-500 rounded-full border-4 border-white shadow-lg mb-2 flex items-center justify-center text-2xl">😎</div>
              <span className="font-bold text-blue-400">{t('you')}</span>
              <span className="text-2xl font-black">{score} pts</span>
            </div>
          </div>

          <div className="bg-zinc-900/80 border-2 border-rose-500 rounded-3xl p-6 md:p-10 max-w-3xl w-full text-center transform -rotate-1 shadow-[0_0_50px_rgba(225,29,72,0.2)] relative transition-all">
            
            {feedback && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-3 rounded-full font-bold border border-white/20 animate-bounce whitespace-nowrap z-50 text-lg shadow-2xl">
                {feedback}
              </div>
            )}

            <h2 className="text-3xl md:text-4xl font-black mb-4">{questionsData[questionIndex]?.question}</h2>
            <p className="text-sm text-rose-400 font-bold mb-8">{t('remember')}</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentAnswers.map((answer, i) => (
                <button 
                  key={i}
                  disabled={feedback !== null}
                  onClick={() => handleAnswer(answer.isAbsurd)} 
                  className="py-4 px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-rose-600 hover:text-white font-bold text-lg md:text-xl transition-all transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-white/5"
                >
                  {answer.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}