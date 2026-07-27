import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import FloatingChatWidget from "@/components/FloatingChatWidget";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

import { headers } from 'next/headers';
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const dump: Record<string, string> = {};
  h.forEach((v, k) => { dump[k] = v.slice(0, 120); });
  return { other: { 'x-debug-headers': JSON.stringify(dump) } };
}

export const metadataOld: Metadata = {
  title: {
    default: "CineMind — הפסקת לנחש. התחלת לראות.",
    template: "%s | CineMind",
  },
  description:
    "מנוע המלצות קולנועי מבוסס AI שמפענח את ה-DNA הקולנועי שלך תוך 3 שאלות. דיוק כירורגי ברמת מיקרו-ז'אנר.",
  // TODO(owner): אין תמונת שיתוף. צריך ליצור public/og/og-default.png בגודל 1200x630
  // ואז להוסיף כאן images: ["/og/og-default.png"] גם ל-openGraph וגם ל-twitter.
  // הקבצים הקיימים ב-public/icons הם SVG וריבועיים — פייסבוק, ווטסאפ וטוויטר לא מציגים אותם.
  openGraph: {
    title: "CineMind — הפסקת לנחש. התחלת לראות.",
    description:
      "מנוע המלצות שמפענח את הטעם הקולנועי שלך תוך שלוש שאלות ומביא לך בדיוק את הסרט הבא.",
    siteName: "CineMind",
    locale: "he_IL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CineMind — הפסקת לנחש. התחלת לראות.",
    description:
      "מנוע המלצות שמפענח את הטעם הקולנועי שלך תוך שלוש שאלות ומביא לך בדיוק את הסרט הבא.",
  },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <PostHogProvider>
            <AuthProvider>
              <Suspense fallback={null}>
                <PostHogPageView />
              </Suspense>
              <main className="flex-1">
                {children}
              </main>
            </AuthProvider>

            <footer className="border-t border-zinc-800 bg-zinc-950 py-6 mt-auto">
              <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-zinc-500">
                <div className="text-center sm:text-right">
                  &copy; {new Date().getFullYear()} CineMind. {locale === 'he' ? 'כל הזכויות שמורות.' : 'All rights reserved.'}
                </div>
                <nav className="flex gap-2 sm:gap-4">
                  <a href="/terms" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 hover:text-zinc-300 transition-colors rounded-lg active:bg-white/5">{locale === 'he' ? 'תנאי שימוש' : 'Terms of Service'}</a>
                  <a href="/privacy" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 hover:text-zinc-300 transition-colors rounded-lg active:bg-white/5">{locale === 'he' ? 'מדיניות פרטיות' : 'Privacy Policy'}</a>
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
