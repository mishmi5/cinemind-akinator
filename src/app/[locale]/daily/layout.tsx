import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "הסרט של היום",
  description:
    "סרט אחד ביום, דירוג מהיר, והשוואה לציון של כל השאר. חוזרים מחר והרצף ממשיך.",
};

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
