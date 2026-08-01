import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The English locale was served Hebrew titles and descriptions under lang="en", which is
// what makes Google misread the language of the whole site.
const COPY = {
  he: { title: "ארנה — טריוויה על סרטים", description: "שאלות טריוויה על סרטים שכולם ראו, עם תשובות שנשמעות מומצאות ואחת מהן נכונה. יש ספוילרים, אתם מוזהרים." },
  en: { title: "Arena — movie trivia", description: "Movie trivia where the ridiculous answer is the one that scores." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === 'en' ? 'en' : 'he'];
}

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
