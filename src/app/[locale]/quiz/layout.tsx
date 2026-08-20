import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The English locale was served Hebrew titles and descriptions under lang="en", which is
// what makes Google misread the language of the whole site.
const COPY = {
  he: { title: "מה לראות הערב — החידון", description: "כמה שאלות על סרטים שכבר ראיתם, ובסוף שלוש המלצות שמתאימות לטעם שלכם. חינם, בלי הרשמה ובלי כרטיס אשראי." },
  en: { title: "What to watch tonight — the quiz", description: "Stop scrolling. A short quiz, then three films picked for your taste." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === 'en' ? 'en' : 'he'];
}

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return children;
}
