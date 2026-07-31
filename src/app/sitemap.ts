import type { MetadataRoute } from "next";

// Keep in sync with the fallback in src/app/[locale]/layout.tsx.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cinemind.co.il";

// Public, indexable routes only. Left out on purpose: /admin and /profile (private),
// /login (no content), /duel/[id]/play (private session), /cards/[id] (user-generated,
// unbounded, and only meaningful to whoever got the link).
const PAGES: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/quiz", priority: 0.9, changeFrequency: "weekly" },
  { path: "/scan", priority: 0.8, changeFrequency: "monthly" },
  { path: "/daily", priority: 0.8, changeFrequency: "daily" },
  { path: "/pulse", priority: 0.7, changeFrequency: "daily" },
  { path: "/arena", priority: 0.7, changeFrequency: "weekly" },
  { path: "/arena/leaderboard", priority: 0.6, changeFrequency: "daily" },
  { path: "/duel", priority: 0.6, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // he is the default locale and carries no prefix; en is served under /en.
  return PAGES.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path || "/"}`,
    lastModified,
    changeFrequency,
    priority,
    alternates: {
      languages: {
        he: `${SITE_URL}${path || "/"}`,
        en: `${SITE_URL}/en${path}`,
      },
    },
  }));
}
