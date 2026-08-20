import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "הדופק היומי",
  description: "שלושה סרטים ביום, דירוג מהיר, והרצף שלך ממשיך. הדופק היומי של CineMind.",
};

export default function PulseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
