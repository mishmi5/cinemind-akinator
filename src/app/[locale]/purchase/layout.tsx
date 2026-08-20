import type { Metadata } from "next";

// page.tsx is a client component, so metadata has to live in a layout. Without this the receipt
// page inherited the landing page's title and description — someone landing here from Stripe saw
// "הפסקת לנחש. התחלת לראות." in the tab while checking whether their payment went through.
const COPY = {
  he: { title: "אישור רכישה", description: "בדיקת סטטוס העסקה והגישה שנפתחה בעקבותיה." },
  en: { title: "Purchase confirmation", description: "The status of your payment and the access it opened." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...COPY[locale === 'en' ? 'en' : 'he'],
    // A receipt keyed on a session id has nothing to offer a search engine.
    robots: { index: false, follow: false },
  };
}

export default function PurchaseLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
