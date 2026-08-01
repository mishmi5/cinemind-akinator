import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The English locale was served Hebrew titles and descriptions under lang="en", which is
// what makes Google misread the language of the whole site.
const COPY = {
  he: { title: "טבלת השיאים של הארנה", description: "מי צבר הכי הרבה XP בטריוויה של CineMind, ואיפה אתם ברשימה." },
  en: { title: "Arena leaderboard", description: "Your Arena score. Scores live on this device until accounts open." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === 'en' ? 'en' : 'he'];
}

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
