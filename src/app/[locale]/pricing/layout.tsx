import type { Metadata } from "next";

// ponytail: page.tsx is a client component, so metadata has to live in a layout.
// The English locale was served Hebrew titles and descriptions under lang="en", which is
// what makes Google misread the language of the whole site.
const COPY = {
  he: { title: "כמה זה עולה", description: "החידון ושלוש ההמלצות שיוצאות ממנו חינם. משלמים רק אם רוצים שהטעם יישמר וימשיכו להגיע המלצות — ₪99 פעם אחת, בלי חיוב חוזר." },
  en: { title: "Pricing", description: "The quiz and the three films it produces are free. You pay only to keep your taste profile and keep the recommendations coming — ₪99 once, no recurring charge." },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  return COPY[locale === 'en' ? 'en' : 'he'];
}

// Keep in sync with the fallback in src/app/[locale]/layout.tsx.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://cinemind.co.il";

// Only what the page actually sells: one Founder plan, ₪99 once, capped at 200 seats.
// No rating and no review count — we have neither, and inventing them is a manual action
// in Google's eyes. The seat cap is stated in text, not as inventoryLevel: 200 is the
// total cap, not the number still available, and nothing tracks the remainder yet.
const productJsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "CineMind Founder",
  description:
    "גישה לכל החיים לפרופיל הטעם השמור ולהמלצות שממשיכות להגיע. תשלום אחד, לא מנוי. מוגבל ל-200 מקומות.",
  brand: { "@type": "Brand", name: "CineMind" },
  offers: {
    "@type": "Offer",
    url: `${SITE_URL}/pricing`,
    price: "99",
    priceCurrency: "ILS",
    availability: "https://schema.org/InStock",
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      {children}
    </>
  );
}
