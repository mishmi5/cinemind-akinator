import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "כניסה",
  description: "כניסה ל-CineMind. החשבונות עוד לא נפתחו — אפשר לשחק בלי חשבון.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
