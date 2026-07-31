import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
export const metadata: Metadata = {
  title: "טבלת השיאים של הארנה",
  description: "מי צבר הכי הרבה XP בטריוויה של CineMind, ואיפה אתם ברשימה.",
};

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
