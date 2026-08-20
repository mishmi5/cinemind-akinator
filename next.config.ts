import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // apis.google.com and the Firebase auth iframe were missing, so the browser blocked Google
  // sign-in outright: "Loading the script 'https://apis.google.com/js/api.js' violates the
  // following Content Security Policy directive", once per attempt, on a button the login page
  // renders. The policy stays deny-by-default; these are the two origins Firebase Auth needs.
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://eu-assets.i.posthog.com https://apis.google.com https://www.gstatic.com; connect-src 'self' https://api.themoviedb.org https://api.stripe.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.posthog.com; img-src 'self' data: https://image.tmdb.org https://api.dicebear.com https://img.youtube.com https://lh3.googleusercontent.com; frame-src 'self' https://js.stripe.com https://www.youtube.com https://accounts.google.com https://*.firebaseapp.com; style-src 'self' 'unsafe-inline';" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Every response announced "x-powered-by: Next.js". It buys an attacker a free hint about which
  // CVEs to try and buys us nothing.
  poweredByHeader: false,
  // Needed by src/app/global-not-found.tsx — the only root layout lives under
  // the dynamic [locale] segment, so unmatched URLs have no layout to render inside.
  experimental: {
    globalNotFound: true,
  },
  allowedDevOrigins: ['10.0.0.12', '10.0.0.1', 'localhost'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
