import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "המלצות סרטים לפי הטעם שלכם",
  description:
    "מדרגים סרטים מוכרים, והמנוע מצמצם שאלה אחרי שאלה עד תת-הז'אנר המדויק שלכם. בסוף מקבלים שלושה סרטים והיכן לראות אותם.",
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return children;
}
