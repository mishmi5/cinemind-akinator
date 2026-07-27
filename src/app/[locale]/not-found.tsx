import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "הדף לא נמצא",
  description: "הכתובת הזאת לא קיימת ב-CineMind.",
};

// ponytail: lives under [locale] on purpose — the next-intl proxy rewrites every
// unmatched path into this segment, so it inherits <html lang dir> from the locale layout.
// A root src/app/not-found.tsx would have no root layout to render inside.
export default function NotFound() {
  return (
    <main
      dir="rtl"
      className="min-h-screen bg-[#070709] text-white flex flex-col items-center justify-center px-4 text-center"
    >
      <div className="text-7xl font-black text-rose-500 mb-4">404</div>
      <h1 className="text-3xl font-black mb-3">הדף הזה לא קיים</h1>
      <p className="text-zinc-400 max-w-md">
        אולי הכתובת השתנתה, ואולי הקלדנו אותה לא נכון. בכל מקרה, אין פה כלום.
      </p>
      <Link
        href="/"
        className="mt-10 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-all"
      >
        חזרה לדף הבית
      </Link>
    </main>
  );
}
