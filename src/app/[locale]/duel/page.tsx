'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import Navbar from '@/components/Navbar';

export default function DuelLobbyPage() {
  const locale = useLocale();
  const t = useTranslations('Duel');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user } = useAuth();

  const handleCreateDuel = async () => {
    if (!user) {
      setError(t('must_login'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/duel/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      router.push(`/duel/${data.duelId}/play`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleJoinDuel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode || inviteCode.length < 3) return;
    if (!user) {
      setError(t('must_login'));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // /api/duel/join needs a duelId, and the user only typed an invite code —
      // look the duel up by its code first.
      const { db } = await import('@/lib/firebase');
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const duelsRef = collection(db, 'duels');
      const q = query(duelsRef, where('inviteCode', '==', inviteCode.toUpperCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) throw new Error(t('invalid_code'));
      const duelId = snap.docs[0].id;

      const token = await user.getIdToken();
      const res = await fetch('/api/duel/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ duelId, inviteCode: inviteCode.toUpperCase() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      router.push(`/duel/${duelId}/play`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-black text-white flex flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-black to-black -z-10" />

      <Navbar />

      <div className="flex-1 flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 backdrop-blur-xl p-8 rounded-3xl text-center shadow-2xl"
      >
        <h1 className="text-4xl font-black mb-2 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          {t('title')}
        </h1>
        <p className="text-zinc-400 mb-8">
          {t('subtitle')}
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-sm">
            {error}
          </div>
        )}

        {/* A duel needs two identified players, and sign-in is not wired yet — every control on
            /login is deliberately disabled. So for every visitor today, pressing "create" only
            produced a red error box. A control that can never succeed reads as broken rather than
            as unfinished, so we say plainly that it is not open yet and hide the controls until
            authentication ships. Nothing links here; this page is reachable only by direct URL. */}
        {!user ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm text-zinc-300 leading-relaxed">
            {locale === 'he'
              ? 'דו-קרב טעמים עוד לא פתוח. הוא דורש שני שחקנים מזוהים, וההתחברות עדיין לא עלתה לאוויר. עד אז — השאלון עצמו עובד במלואו ואינו דורש חשבון.'
              : 'Taste duels are not open yet. A duel needs two identified players, and sign-in is not live. The quiz itself works in full and needs no account.'}
          </div>
        ) : (
        <>
        <button
          onClick={handleCreateDuel}
          disabled={loading}
          className="w-full bg-white text-black font-bold py-4 rounded-xl mb-8 hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : t('create_button')}
        </button>

        <div className="relative flex items-center py-5">
          <div className="flex-grow border-t border-zinc-800"></div>
          <span className="flex-shrink-0 mx-4 text-zinc-400 text-sm">{t('or')}</span>
          <div className="flex-grow border-t border-zinc-800"></div>
        </div>

        <form onSubmit={handleJoinDuel} className="flex gap-2">
          <input
            type="text"
            placeholder={t('code_placeholder')}
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-center uppercase tracking-widest focus:outline-none focus:border-indigo-500 transition-colors"
            maxLength={6}
          />
          <button
            type="submit"
            disabled={loading || inviteCode.length < 3}
            className="bg-indigo-600 font-bold py-3 px-6 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {t('join_button')}
          </button>
        </form>
        </>
        )}
      </motion.div>
      </div>
    </div>
  );
}
