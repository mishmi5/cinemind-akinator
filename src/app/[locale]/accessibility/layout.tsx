import type { Metadata } from "next";

// page.tsx is a server component but the metadata still belongs here, alongside the other legal
// pages. Without it the accessibility statement carried the landing page's title — the tab read
// "הפסקת לנחש. התחלת לראות." while the page was a legal declaration.
const COPY = {
  he: {
    title: "הצהרת נגישות",
    description: "מה נעשה כדי שהאתר יהיה נגיש, מה עדיין לא הושלם, ואיך מדווחים על בעיית נגישות.",
  },
  en: {
    title: "Accessibility statement",
    description: "What has been done to make the site accessible, what is not finished, and how to report a problem.",
  },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === "en" ? "en" : "he"];
}

export default function AccessibilityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
