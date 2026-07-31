import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "מה לראות הערב — החידון",
  description:
    "כמה שאלות על סרטים שכבר ראיתם, ובסוף שלוש המלצות שמתאימות לטעם שלכם. חינם, בלי הרשמה ובלי כרטיס אשראי.",
};

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return children;
}
