import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The English locale was served Hebrew titles and descriptions under lang="en", which is
// what makes Google misread the language of the whole site.
const COPY = {
  he: { title: "המלצות סרטים לפי הטעם שלכם", description: "מדרגים סרטים מוכרים, והמנוע מצמצם שאלה אחרי שאלה עד תת-הז'אנר המדויק שלכם. בסוף מקבלים שלושה סרטים והיכן לראות אותם." },
  en: { title: "Movie recommendations for your taste", description: "Rate a few films and get three that actually fit — with the reason, a trailer, and where to watch them in Israel." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === 'en' ? 'en' : 'he'];
}

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
