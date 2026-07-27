import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "הדף לא נמצא | CineMind",
  description: "הכתובת הזאת לא קיימת ב-CineMind.",
};

// ponytail: the app's only root layout sits under the dynamic [locale] segment, so an
// unmatched URL has no layout to render inside — src/app/not-found.tsx would come out
// with no lang and no stylesheet. global-not-found.tsx renders the whole document itself.
// Requires experimental.globalNotFound in next.config.ts.
export default function GlobalNotFound() {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-[#070709] text-white antialiased">
        <main className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
          <div className="text-7xl font-black text-rose-500 mb-4">404</div>
          <h1 className="text-3xl font-black mb-3">הדף הזה לא קיים</h1>
          <p className="text-zinc-400 max-w-md">
            אולי הכתובת השתנתה, ואולי היא הוקלדה לא נכון. בכל מקרה, אין פה כלום.
          </p>
          <a
            href="/"
            className="mt-10 px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full font-bold transition-all"
          >
            חזרה לדף הבית
          </a>
        </main>
      </body>
    </html>
  );
}
