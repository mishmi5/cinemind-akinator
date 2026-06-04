'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { createCard } from '@/lib/cards/createCard';
import RoastCard from './RoastCard';
import ShareBar from './ShareBar';
import { useTranslations } from 'next-intl';

export default function RoastReveal() {
  const { user, userData } = useAuth();
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [cardId, setCardId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const t = useTranslations('Roast');

  const handleGenerate = async () => {
    if (!user) return;
    setStatus('generating');
    try {
      const token = await user.getIdToken(true);
      const { cardId } = await createCard(token);
      setCardId(cardId);
      setStatus('ready');
    } catch (error: any) {
      console.error(error);
      if (error.message.includes('Incomplete taste profile')) {
        setErrorMsg(t('incomplete_profile'));
      } else {
        setErrorMsg(error.message);
      }
      setStatus('error');
    }
  };

  if (!userData?.tasteVector) {
    return null;
  }

  const { tasteVector, handle } = userData;
  const displayHandle = handle || "Anonymous";

  if (status === 'error') {
    return (
      <div className="w-full p-6 bg-red-950/30 border border-red-500/20 rounded-xl text-center">
        <p className="text-red-400 mb-4">{errorMsg}</p>
        <button onClick={() => setStatus('idle')} className="text-rose-500 font-bold hover:underline">
          {t('try_again')}
        </button>
      </div>
    );
  }

  if (status === 'ready' && cardId) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const isEn = typeof window !== 'undefined' && window.location.pathname.startsWith('/en');
    const localePrefix = isEn ? '/en' : '';
    const shareUrl = `${origin}${localePrefix}/cards/${cardId}`;

    return (
      <div data-testid="roast-reveal-ready" className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <RoastCard 
          handle={displayHandle}
          archetype={tasteVector.archetype || ''}
          roastText={tasteVector.roastText || ''}
          topGenres={tasteVector.topGenres || []}
          contrarianScore={tasteVector.contrarianScore || 0}
          confidenceScore={tasteVector.confidenceScore || 0}
        />
        <ShareBar shareUrl={shareUrl} />
      </div>
    );
  }

  return (
    <div data-testid="roast-reveal" className="w-full flex flex-col items-center gap-6 mt-8">
      {status === 'generating' ? (
        <div className="animate-pulse text-rose-500 font-bold">{t('generating')}</div>
      ) : (
        <button 
          data-testid="roast-generate-btn"
          onClick={handleGenerate}
          className="bg-rose-600 hover:bg-rose-500 text-white font-black py-4 px-8 rounded-full text-lg w-full max-w-sm transition-all shadow-[0_0_20px_rgba(225,29,72,0.4)]"
        >
          {t('generate_cta')}
        </button>
      )}
    </div>
  );
}
