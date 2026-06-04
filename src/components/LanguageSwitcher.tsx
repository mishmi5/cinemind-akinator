'use client';

import React, { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, usePathname, routing } from '@/i18n/routing';

// Display label per locale code. Extend when routing.locales grows.
const LOCALE_LABELS: Record<string, string> = {
  he: 'עב',
  en: 'EN',
};

export default function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname(); // locale-agnostic path, e.g. "/arena"
  const [isPending, startTransition] = useTransition();

  // For a 2-locale toggle, this is the locale we switch TO.
  const nextLocale = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  const switchTo = (target: string) => {
    if (target === locale) return;
    startTransition(() => {
      // next-intl applies your 'as-needed' prefix rule automatically
      // (no prefix for 'he', '/en' for english).
      router.replace(pathname, { locale: target });
    });
  };

  return (
    <button
      type="button"
      onClick={() => switchTo(nextLocale)}
      disabled={isPending}
      aria-label={`Switch language to ${LOCALE_LABELS[nextLocale] ?? nextLocale}`}
      className="px-3 py-1.5 text-xs font-bold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all disabled:opacity-50"
    >
      {LOCALE_LABELS[nextLocale] ?? nextLocale.toUpperCase()}
    </button>
  );
}
