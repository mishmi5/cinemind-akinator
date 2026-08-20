import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The English locale was served Hebrew titles and descriptions under lang="en", which is
// what makes Google misread the language of the whole site.
const COPY = {
  he: { title: "כניסה", description: "כניסה ל-CineMind. החשבונות עוד לא נפתחו — אפשר לשחק בלי חשבון." },
  en: { title: "Log in", description: "Log in to CineMind to keep your taste profile and the history of what was recommended to you." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === 'en' ? 'en' : 'he'];
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
