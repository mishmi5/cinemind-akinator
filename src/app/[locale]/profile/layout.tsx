import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// noindex to match the Disallow in src/app/robots.ts — this page shows one person's
// own taste profile and has nothing to offer a search result.
export const metadata: Metadata = {
  title: "הפרופיל שלי",
  description:
    "הטעם הקולנועי ששמרתם: הז'אנרים שאתם אוהבים, מה שלא נמליץ לכם לעולם, וה-XP שצברתם.",
  robots: { index: false, follow: false },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
