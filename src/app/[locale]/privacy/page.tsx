import React from 'react';
import { getTranslations } from 'next-intl/server';

const SUPPORT_EMAIL = 'hello@cinemind.co.il';

export async function generateMetadata() {
  const t = await getTranslations('Privacy');
  return { title: t('meta_title') };
}

export default async function PrivacyPage() {
  const t = await getTranslations('Privacy');

  const tags = {
    b: (chunks: React.ReactNode) => <strong className="text-white">{chunks}</strong>,
    mail: () => (
      <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">
        {SUPPORT_EMAIL}
      </a>
    ),
  };

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-300 py-20 px-4 md:px-8">
      <div className="max-w-3xl mx-auto bg-zinc-900/50 p-8 md:p-12 rounded-3xl border border-zinc-800">
        <h1 className="text-4xl font-black text-white mb-8 text-center bg-gradient-to-l from-indigo-500 to-cyan-500 bg-clip-text text-transparent">{t('title')}</h1>

        <p className="text-center text-zinc-400 text-sm mb-8">{t('updated')}</p>

        <div className="space-y-8 text-sm md:text-base leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s1_h')}</h2>
            <p>{t('s1_p')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s2_h')}</h2>
            <p>{t('s2_p')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s3_h')}</h2>
            <ul className="list-disc ps-5 space-y-2">
              <li>{t.rich('s3_li1', tags)}</li>
              <li>{t.rich('s3_li2', tags)}</li>
              <li>{t.rich('s3_li3', tags)}</li>
              <li>{t.rich('s3_li4', tags)}</li>
              <li>{t.rich('s3_li5', tags)}</li>
            </ul>
            <p className="mt-3">{t('s3_close')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s4_h')}</h2>
            <p>{t.rich('s4_p', tags)}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s5_h')}</h2>
            <p>{t.rich('s5_p', tags)}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s6_h')}</h2>
            <p>{t('s6_p')}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s7_h')}</h2>
            <p>{t.rich('s7_p', tags)}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">{t('s8_h')}</h2>
            {/* TODO(owner): real company name, ח.פ./ע.מ. and address before launch */}
            <p>
              {t('s8_owner_label')}<strong className="text-white">CineMind</strong>{' '}
              <span className="text-amber-400">{t('s8_owner_todo')}</span>
              {t('s8_contact')}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-400 underline">{SUPPORT_EMAIL}</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
