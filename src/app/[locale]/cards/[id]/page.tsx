import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, ShareCard } from '@/types/firebase';
import { Metadata } from 'next';
import RoastCard from '@/components/roast/RoastCard';

type Props = {
  params: Promise<{ locale: string; id: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const { locale, id } = params;

  const snap = await adminDb.collection(COLLECTIONS.cards).doc(id).get();
  if (!snap.exists) return {};

  const card = snap.data() as ShareCard;

  // This link is meant to be forwarded into Hebrew WhatsApp groups, so the framing
  // text follows the route's locale. The card's own content (archetype, roast) is
  // generated in English and stored that way in Firestore — see lib/taste/deriveTaste.ts.
  // TODO(owner): to make the shared card fully Hebrew, the archetype names and the
  // roast templates in src/lib/taste/deriveTaste.ts need Hebrew versions first.
  const isHe = locale !== "en";
  const title = isHe
    ? `ה-DNA הקולנועי של ${card.handle}`
    : `${card.handle}'s Cinematic DNA`;
  const description = isHe
    ? `יצא לו ${card.archetype}. תראו מה CineMind אמר עליו.`
    // Every archetype name already starts with "The" (see ROAST_TEMPLATES), so no article here.
    : `They're ${card.archetype}. See what CineMind said.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      // The dynamic OG image lives next to this page and is picked up by convention;
      // naming it explicitly keeps the locale prefix out of the URL.
      images: [`/cards/${id}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/cards/${id}/opengraph-image`],
    },
    // A share card belongs to one person and is reachable only by its link.
    robots: { index: false, follow: false },
  };
}

export default async function CardPage(props: Props) {
  const params = await props.params;
  const { id } = params;

  const snap = await adminDb.collection(COLLECTIONS.cards).doc(id).get();
  if (!snap.exists) {
    notFound();
  }

  const card = snap.data() as ShareCard;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
      <div className="max-w-md w-full">
        <RoastCard 
          handle={card.handle}
          archetype={card.archetype}
          roastText={card.roastText}
          topGenres={card.topGenres}
          contrarianScore={card.contrarianScore}
          confidenceScore={card.confidenceScore}
        />
      </div>
    </div>
  );
}
