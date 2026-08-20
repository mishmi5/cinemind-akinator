import type { MetadataRoute } from "next";

// Lives at src/app (not under [locale]) so it serves /robots.txt for real. The
// next-intl proxy skips any path containing a dot, so this route is never rewritten.
// Keep in sync with the fallback in src/app/[locale]/layout.tsx.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cinemind.co.il";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/en/admin",
        "/profile",
        "/en/profile",
        "/api/",
        // A duel play page is a private two-player session behind an invite id.
        "/duel/*/play",
        "/en/duel/*/play",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
