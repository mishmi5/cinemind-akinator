import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The duel/[id]/play page inherits this title until it sets its own.
export const metadata: Metadata = {
  title: "דו-קרב טעמים",
  description: "תאתגרו חבר וגלו למי יש DNA קולנועי טוב יותר.",
};

export default function DuelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
