'use client';

import React from 'react';
import { Link } from '@/i18n/routing';
import Navbar from '@/components/Navbar';
import { useLocale, useTranslations } from 'next-intl';

export default function QuizIntroPage() {
  const locale = useLocale();
  const t = useTranslations('Quiz');

  return (
    <main dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#070709] text-white font-sans overflow-x-hidden selection:bg-rose-500/30 flex flex-col">
      
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-rose-900/5 blur-[150px] pointer-events-none"></div>

      <Navbar />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center pt-12 pb-20 px-4 max-w-3xl mx-auto text-center">
        
        {/* The badge used to repeat the h1 word for word, 32px above it. It now carries the two
            facts a visitor weighs before starting: how long this takes, and that nothing is asked
            of them first. */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-rose-900/50 bg-rose-950/20 text-rose-400 text-xs font-bold mb-8 shadow-[0_0_15px_rgba(225,29,72,0.1)]">
          <span>🧠</span>
          <span>{t('badge')}</span>
        </div>

        <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-tight mb-6">
          {t('title_main1')}<br />
          {t('title_main2')}<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-rose-500">CineMind</span>
        </h1>

        <div className="text-lg text-zinc-400 leading-relaxed mb-10 max-w-xl mx-auto font-medium space-y-4">
          <p>
            {t('desc_1')}
          </p>
          <p>
            {t('desc_2_1')}<strong className="text-white">{t('desc_2_2')}</strong>
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-4 mb-12">
          <div className="flex items-center gap-3 px-6 py-3 bg-white/[0.03] border border-white/10 rounded-2xl">
            <span className="text-xl">🎯</span>
            <span className="text-sm font-bold text-zinc-300">{t('feature_1')}</span>
          </div>
          <div className="flex items-center gap-3 px-6 py-3 bg-white/[0.03] border border-white/10 rounded-2xl">
            <span className="text-xl">🧬</span>
            <span className="text-sm font-bold text-zinc-300">{t('feature_2')}</span>
          </div>
          <div className="flex items-center gap-3 px-6 py-3 bg-white/[0.03] border border-white/10 rounded-2xl">
            <span className="text-xl">🏆</span>
            <span className="text-sm font-bold text-zinc-300">{t('feature_3')}</span>
          </div>
        </div>

        <div className="flex flex-col items-center mb-16 relative">
          <div className="absolute inset-0 bg-red-500 blur-[40px] opacity-20 rounded-full"></div>
          
          <Link 
            href="/scan"
            className="relative z-10 group flex items-center justify-center gap-3 px-12 py-5 bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl text-white font-black text-xl hover:from-red-400 hover:to-rose-500 transition-all duration-300 transform hover:-translate-y-1 shadow-[0_10px_30px_rgba(239,68,68,0.4)] hover:shadow-[0_15px_40px_rgba(239,68,68,0.6)] active:scale-95"
          >
            <span>{t('cta_start')}</span>
            <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </Link>
          
          <p className="mt-4 text-[11px] font-medium text-zinc-400 tracking-wide">
            {t('disclaimer')}
          </p>
        </div>

        <div className={`w-full max-w-2xl ${locale === 'he' ? 'text-right' : 'text-left'} bg-[#111113]/80 border border-red-900/30 rounded-2xl p-6 relative overflow-hidden`}>
          <div className={`absolute top-0 ${locale === 'he' ? 'right-0' : 'left-0'} bottom-0 w-1 bg-gradient-to-b from-red-500 to-rose-900`}></div>
          
          <div className="flex items-start gap-3">
            <span className="text-red-500 text-lg mt-0.5">⚠️</span>
            <div>
              {/* h2, not h4: this is the only other section on the page and it followed the h1
                  directly, so a screen-reader user heard the outline skip two levels. */}
              <h2 className="text-red-500 text-sm font-bold mb-2">{t('good_to_know')}</h2>
              <p className="text-xs md:text-sm text-zinc-400 leading-relaxed font-medium">
                {t('good_to_know_text')}
              </p>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}