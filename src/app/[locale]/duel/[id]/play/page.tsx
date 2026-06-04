'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Duel } from '@/types/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

export default function DuelPlayPage({ params }: { params: Promise<{ id: string, locale: string }> }) {
  const { id, locale } = use(params);
  const t = useTranslations('Duel');
  const { user } = useAuth();
  const [duel, setDuel] = useState<Duel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    
    const unsub = onSnapshot(doc(db, 'duels', id), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Duel;
        setDuel(data);
      } else {
        setError(t('duel_not_found', { fallback: 'Duel not found.' }));
      }
    }, (err) => {
      console.error(err);
      setError('Failed to sync duel state.');
    });

    return () => unsub();
  }, [id, user]);

  useEffect(() => {
    // If duel just became active and we are the ones who triggered it (or anyone viewing), we should call finalize
    // To prevent both calling, let's just have the UI call it and the server is idempotent.
    if (duel?.status === 'ACTIVE' && user && !isFinalizing) {
      setIsFinalizing(true);
      user.getIdToken().then(token => {
        fetch('/api/duel/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ duelId: id })
        }).catch(err => {
          console.error('Finalize failed:', err);
          setIsFinalizing(false);
        });
      });
    }
  }, [duel?.status, user, id, isFinalizing]);

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-500 font-bold p-4 text-center">{error}</div>;
  }

  if (!duel) {
    return <div className="min-h-screen flex items-center justify-center bg-black"><div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const isChallenger = duel.challenger.uid === user?.uid;
  const isOpponent = duel.opponent?.uid === user?.uid;
  const isParticipant = isChallenger || isOpponent;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col p-4 overflow-x-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black -z-10" />

      {/* HEADER */}
      <header className="py-6 px-4 text-center">
        <h1 className="text-2xl font-black bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          CineMind <span className="text-white">Duel</span>
        </h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full gap-8">
        
        {/* PENDING STATE */}
        {duel.status === 'PENDING' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center bg-zinc-900/50 p-8 rounded-3xl border border-zinc-800 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">{t('waiting_opponent', { fallback: 'Waiting for Opponent...' })}</h2>
            <p className="text-zinc-400 mb-6 text-sm">{t('invite_instructions', { fallback: 'Share this invite code with your friend to start the duel.' })}</p>
            
            <div className="bg-black border border-indigo-500/30 rounded-xl p-6 mb-6">
              <span className="text-4xl font-black tracking-[0.2em] text-indigo-400">{duel.inviteCode}</span>
            </div>
            
            <button 
              onClick={() => navigator.clipboard.writeText(duel.inviteCode)}
              className="bg-white text-black font-bold py-3 px-6 rounded-xl hover:bg-zinc-200 transition-colors w-full"
            >
              {t('copy_code', { fallback: 'Copy Code' })}
            </button>
          </motion.div>
        )}

        {/* ACTIVE (FINALIZING) STATE */}
        {duel.status === 'ACTIVE' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center w-full max-w-2xl">
            <h2 className="text-3xl font-black mb-8 animate-pulse text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-fuchsia-400">
              {t('analyzing_dna', { fallback: 'Analyzing Cinematic DNA...' })}
            </h2>
            
            <div className="flex justify-between items-center gap-4 bg-zinc-900/40 p-8 rounded-3xl border border-zinc-800">
              <div className="flex-1 text-center">
                <div className="w-20 h-20 mx-auto bg-indigo-500/20 rounded-full flex items-center justify-center border border-indigo-500/50 mb-4 animate-pulse">
                  <span className="text-2xl">😎</span>
                </div>
                <div className="font-bold">{duel.challenger.handle}</div>
              </div>
              <div className="text-4xl font-black text-zinc-700 mx-4">VS</div>
              <div className="flex-1 text-center">
                <div className="w-20 h-20 mx-auto bg-fuchsia-500/20 rounded-full flex items-center justify-center border border-fuchsia-500/50 mb-4 animate-[pulse_1s_ease-in-out_infinite]">
                  <span className="text-2xl">😈</span>
                </div>
                <div className="font-bold">{duel.opponent?.handle}</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* COMPLETE STATE */}
        {duel.status === 'COMPLETE' && duel.comparison && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-3xl flex flex-col gap-6">
            
            <div className="text-center mb-4">
              <h2 className="text-4xl font-black mb-2 text-white">
                {t('match_result', { fallback: 'Match Result' })}
              </h2>
              <div className="inline-block bg-zinc-900 border border-zinc-800 rounded-full px-6 py-2">
                <span className="text-zinc-400 mr-2">{t('similarity', { fallback: 'Similarity Score:' })}</span>
                <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
                  {(duel.comparison.similarity * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Player 1 Card */}
              <div className={`p-6 rounded-3xl border ${duel.winnerUid === duel.challenger.uid ? 'bg-indigo-900/20 border-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]' : 'bg-zinc-900/50 border-zinc-800'}`}>
                {duel.winnerUid === duel.challenger.uid && <div className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">👑 Winner</div>}
                <h3 className="text-xl font-bold mb-1">{duel.challenger.handle}</h3>
                <p className="text-sm text-zinc-400 mb-4">{duel.challenger.tasteSnapshot?.archetype}</p>
                <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">{t('top_genres', { fallback: 'Top Genres' })}</div>
                <div className="flex flex-wrap gap-2">
                  {duel.comparison.challengerEdge.map(g => (
                    <span key={g} className="px-3 py-1 bg-zinc-800 rounded-lg text-xs">{g}</span>
                  ))}
                </div>
              </div>

              {/* Player 2 Card */}
              <div className={`p-6 rounded-3xl border ${duel.winnerUid === duel.opponent?.uid ? 'bg-fuchsia-900/20 border-fuchsia-500 shadow-[0_0_30px_rgba(217,70,239,0.2)]' : 'bg-zinc-900/50 border-zinc-800'}`}>
                {duel.winnerUid === duel.opponent?.uid && <div className="text-xs font-black text-fuchsia-400 uppercase tracking-widest mb-4">👑 Winner</div>}
                <h3 className="text-xl font-bold mb-1">{duel.opponent?.handle}</h3>
                <p className="text-sm text-zinc-400 mb-4">{duel.opponent?.tasteSnapshot?.archetype}</p>
                <div className="text-xs text-zinc-500 mb-2 uppercase tracking-wider">{t('top_genres', { fallback: 'Top Genres' })}</div>
                <div className="flex flex-wrap gap-2">
                  {duel.comparison.opponentEdge.map(g => (
                    <span key={g} className="px-3 py-1 bg-zinc-800 rounded-lg text-xs">{g}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* AI ROAST */}
            <div className="mt-4 bg-zinc-950 border border-zinc-800 p-8 rounded-3xl text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent" />
              <div className="text-xs font-black text-red-500 uppercase tracking-widest mb-4">{t('ai_verdict', { fallback: 'AI Judge Verdict' })}</div>
              <p className="text-lg md:text-xl font-medium leading-relaxed italic text-zinc-300">
                "{duel.comparison.verdict}"
              </p>
            </div>

            <div className="text-center mt-6">
              <a href="/" className="inline-block px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-colors">
                {t('home', { fallback: 'Back to Home' })}
              </a>
            </div>

          </motion.div>
        )}

      </main>
    </div>
  );
}
