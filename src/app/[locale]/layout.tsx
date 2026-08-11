import type { Metadata, Viewport } from "next";
import { Rubik, Geist_Mono } from "next/font/google";
import "../globals.css";
import FloatingChatWidget from "@/components/FloatingChatWidget";
import Script from "next/script";

// Hebrew is the product's primary language and Geist carries no Hebrew glyphs, so every
// Hebrew word was rendered in whatever face the device happened to have, with the 900 weight
// synthesised on top of a face that does not own one. Rubik ships a real Hebrew subset and a
// variable weight axis up to 900, and it is the same family the share-image routes already
// draw with (public/fonts/Rubik-Bold.ttf) — so the OG card and the page it links to finally
// match. Geist Mono stays for the Latin year/details line, where the contrast is deliberate.
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#070709",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

import { headers } from "next/headers";

// The public origin. NEXT_PUBLIC_SITE_URL wins so a preview deploy shares its own
// URLs; without it we fall back to production, never to localhost — an unset
// metadataBase makes Next emit og:image on http://localhost, which no crawler can fetch.
// TODO(owner): set NEXT_PUBLIC_SITE_URL in Netlify (production + previews).
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cinemind.co.il";

// The default share image is generated, not shipped: ./opengraph-image.tsx in this
// segment. Next's file convention emits og:image + twitter:image (with type, width,
// height and alt) for every page under /[locale] that has none of its own, and wins over
// anything listed here, so it is left to do the job alone. Its URL is built from
// metadataBase in production; in development Next forces it to localhost on purpose
// (see getSocialImageMetadataBaseFallback in next/dist/lib/metadata/resolvers).

// next-intl's proxy already computes the locale alternates for the current URL and
// sends them as an HTTP `Link` header. A layout has no access to the pathname, so we
// reuse that instead of guessing, and swap the request origin for the public one.
function alternatesFromLinkHeader(link: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!link) return out;
  for (const entry of link.split(/,\s*(?=<)/)) {
    const m = entry.match(/^<([^>]+)>.*hreflang="([^"]+)"/);
    if (!m) continue;
    try {
      out[m[2]] = new URL(new URL(m[1]).pathname, SITE_URL).toString();
    } catch { /* not a URL — skip this entry */ }
  }
  return out;
}

const COPY = {
  he: {
    title: "CineMind — הפסקת לנחש. התחלת לראות.",
    description:
      "מנוע המלצות קולנועי מבוסס AI שקורא את הטעם שלך מסרטים שכבר ראית, ועוצר ברגע שהוא בטוח. דיוק ברמת תת-ז'אנר.",
    social:
      "מדרגים סרטים שכבר ראיתם, והמנוע עוצר ברגע שהוא בטוח — ומביא בדיוק את הסרט הבא.",
    locale: "he_IL",
  },
  en: {
    title: "CineMind — Stop guessing. Start watching.",
    description:
      "An AI recommendation engine that reads your taste from films you have already seen, and stops the moment it is sure. Sub-genre resolution.",
    social:
      "Rate films you have already seen. The engine stops when it is sure, and hands you the next one.",
    locale: "en_US",
  },
} as const;

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  const copy = locale === "en" ? COPY.en : COPY.he;
  const languages = alternatesFromLinkHeader((await headers()).get("link"));

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: copy.title,
      template: "%s | CineMind",
    },
    description: copy.description,
    alternates: {
      // "./" resolves against the current pathname, so every page gets its own canonical.
      canonical: languages[locale] ?? "./",
      languages,
    },
    openGraph: {
      title: copy.title,
      description: copy.social,
      siteName: "CineMind",
      locale: copy.locale,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.social,
    },
    ...staticMetadata,
  };
}

const staticMetadata: Metadata = {
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CineMind",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "64x64 32x32 24x24 16x16" },
      { url: "/icons/icon-192x192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512x512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

import { PostHogProvider, PostHogPageView } from '@/providers/posthog';
import { Suspense } from 'react';
import { AuthProvider } from '@/context/AuthContext';

import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import SkipLink from '@/components/SkipLink';

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  // Providing all messages to the client
  // side is the easiest way to get started
  const messages = await getMessages();

  // Set direction based on locale
  const dir = locale === 'he' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${rubik.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Organization + WebSite. Only claims that are true: name, URL, logo, language.
            No SearchAction — the site has no search page to point one at. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${SITE_URL}/#organization`,
                  name: "CineMind",
                  url: SITE_URL,
                  logo: `${SITE_URL}/icons/icon-512x512.svg`,
                },
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#website`,
                  name: "CineMind",
                  url: SITE_URL,
                  inLanguage: locale === "he" ? "he-IL" : "en",
                  publisher: { "@id": `${SITE_URL}/#organization` },
                },
              ],
            }),
          }}
        />
        <NextIntlClientProvider messages={messages}>
          <PostHogProvider>
            <AuthProvider>
              <Suspense fallback={null}>
                <PostHogPageView />
              </Suspense>
              {/* The bypass link belongs here, not on individual pages. It was on three of them —
                  scan, profile and login — so the other nine, including the landing page, the
                  pricing page and both legal pages, had no way for a keyboard or screen-reader user
                  to skip the navigation, and no main landmark to skip to. WCAG 2.4.1 is a level-A
                  criterion and Israeli standard 5568 adopts it, so this was a compliance gap on the
                  pages a visitor is most likely to land on. Putting it in the layout means a new
                  page cannot be added without it. */}
              <SkipLink />
              {/* A div, not a <main>. Most pages here already ARE a <main> at their root — the
                  landing page, pricing, the legal pages, arena, daily and the rest — so wrapping
                  them in another one gave every page two main landmarks, which is its own defect.
                  The bypass target does not have to be the landmark; it only has to be where the
                  link lands. */}
              <div id="main-content" className="flex-1 flex flex-col">
                {children}
              </div>
            </AuthProvider>

            <footer className="border-t border-zinc-800 bg-zinc-950 py-6 mt-auto">
              <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-zinc-500">
                <div className="text-center sm:text-right">
                  &copy; {new Date().getFullYear()} CineMind. {locale === 'he' ? 'כל הזכויות שמורות.' : 'All rights reserved.'}
                </div>
                <nav className="flex gap-2 sm:gap-4">
                  <a href="/terms" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 hover:text-zinc-300 transition-colors rounded-lg active:bg-white/5">{locale === 'he' ? 'תנאי שימוש' : 'Terms of Service'}</a>
                  <a href="/privacy" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 hover:text-zinc-300 transition-colors rounded-lg active:bg-white/5">{locale === 'he' ? 'מדיניות פרטיות' : 'Privacy Policy'}</a>
                  {/* The link an accessibility inspection looks for first, and the route a visitor
                      who cannot use the site needs before anything else. */}
                  <a href="/accessibility" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 hover:text-zinc-300 transition-colors rounded-lg active:bg-white/5">{locale === 'he' ? 'הצהרת נגישות' : 'Accessibility'}</a>
                </nav>
              </div>
            </footer>

            <FloatingChatWidget />

            {/* Service Worker Registration */}
            <Script id="sw-register" strategy="afterInteractive">{`
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(function(registration) {
                    console.log('[CineMind] SW registered, scope:', registration.scope);
                  }).catch(function(err) {
                    console.warn('[CineMind] SW registration failed:', err);
                  });
                });
              }
            `}</Script>
          </PostHogProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
