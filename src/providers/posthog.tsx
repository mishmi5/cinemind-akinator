'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Without a REAL key, init fires network requests that 404/401 and pollute the
    // console — which the QA swarm (correctly) treats as a churn-class bug. A
    // placeholder key is truthy, so `if (key)` alone is not enough: skip init for
    // any empty or placeholder value, matching the codebase's `…_placeholder`
    // sentinel pattern (resend/stripe/telegram). posthog-js no-ops capture() when
    // never initialized, so analytics calls elsewhere stay safe.
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (typeof window !== 'undefined' && key && !key.includes('placeholder')) {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
        capture_pageview: false // Disable automatic pageview capture, as we capture manually
      });
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname && typeof window !== 'undefined') {
      let url = window.origin + pathname;
      if (searchParams?.toString()) {
        url = url + '?' + searchParams.toString();
      }
      posthog.capture('$pageview', {
        $current_url: url,
      });
    }
  }, [pathname, searchParams]);

  return null;
}
