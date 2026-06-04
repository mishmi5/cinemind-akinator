'use client';

import { useState } from 'react';
import { shareCard } from '@/lib/share';
import { Share2, Check, ExternalLink, MessageCircle } from 'lucide-react';
import posthog from 'posthog-js';
import { useTranslations } from 'next-intl';

export default function ShareBar({ shareUrl }: { shareUrl: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
  const t = useTranslations('Roast');

  const handleShare = async () => {
    const text = t('your_archetype');
    const result = await shareCard(shareUrl, text);
    
    if (result !== 'failed') {
      setStatus(result);
      posthog.capture('roast_shared', { method: result, url: shareUrl });
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleWhatsApp = () => {
    const text = t('your_archetype');
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text + '\n' + shareUrl)}`;
    posthog.capture('roast_shared', { method: 'whatsapp', url: shareUrl });
    window.open(waUrl, '_blank');
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      <button 
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 px-6 rounded-full transition-all animate-in zoom-in"
      >
        {status === 'copied' ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
        {status === 'copied' ? t('copied') : t('share_cta')}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={handleWhatsApp}
          className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold py-2 px-4 rounded-full transition-all"
        >
          <MessageCircle className="w-4 h-4" />
          {t('share_whatsapp')}
        </button>
        <button 
          onClick={() => {
            posthog.capture('roast_shared', { method: 'x', url: shareUrl });
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(t('your_archetype') + '\n' + shareUrl)}`, '_blank');
          }}
          className="flex items-center justify-center gap-2 bg-black hover:bg-zinc-800 border border-zinc-700 text-white font-bold py-2 px-4 rounded-full transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          {t('share_x')}
        </button>
      </div>
    </div>
  );
}
