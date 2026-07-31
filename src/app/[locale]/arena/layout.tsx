import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "ארנה — טריוויה על סרטים",
  description:
    "שאלות טריוויה על סרטים שכולם ראו, עם תשובות שנשמעות מומצאות ואחת מהן נכונה. יש ספוילרים, אתם מוזהרים.",
};

export default function ArenaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
