'use client';

import React from 'react';
import { useLocale } from 'next-intl';

/**
 * "Skip to content" bypass link (WCAG 2.4.1 / IS 5568).
 * Visible only while focused, and it must be the first focusable element on the page,
 * so render it above the Navbar. The target id lives on the page's content wrapper.
 */
export default function SkipLink({ href = '#main-content' }: { href?: string }) {
  const locale = useLocale();
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[200] focus:px-5 focus:py-3 focus:rounded-xl focus:bg-white focus:text-black focus:font-bold focus:shadow-2xl focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-rose-500"
    >
      {locale === 'he' ? 'דלג לתוכן הראשי' : 'Skip to main content'}
    </a>
  );
}
