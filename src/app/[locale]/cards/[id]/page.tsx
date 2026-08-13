import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, ShareCard } from '@/types/firebase';
import { Metadata } from 'next';
import RoastCard from '@/components/roast/RoastCard';

// TWO KEY SPACES, ONE LOOKUP. src/lib/taste/deriveTaste.ts translates the taste vector through
// TMDB_GENRES, a table keyed by numeric TMDB genre id ("27" → Horror). The brain engine stores
// its vector keyed by sub-genre TERM instead — see the subGenreVector built at the end of
// src/app/api/brain-question/route.ts — so every key misses the table, comes back "Unknown",
// and the stored roast reads "Your love for Unknown" while the archetype falls through to the
// "Basic Binge-Watcher" default nobody measured. The engine-side fix belongs in deriveTaste.ts
// (map sub-genre terms to their parent genre before the lookup). Until then this page refuses to
// repeat a placeholder as if it were a finding: an unnamed taste is stated as unnamed.
const UNNAMED = 'Unknown';
const isMeasured = (card: ShareCard) =>
  (card.topGenres || []).some(g => g && g !== UNNAMED) && !(card.roastText || '').includes(UNNAMED);

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
  const measured = isMeasured(card);
  const title = isHe
    ? `ה-DNA הקולנועי של ${card.handle}`
    : `${card.handle}'s Cinematic DNA`;
  // An unmeasured card must not announce an archetype it never earned.
  const description = measured
    ? (isHe
      ? `יצא לו ${card.archetype}. תראו מה CineMind אמר עליו.`
      // Every archetype name already starts with "The" (see ROAST_TEMPLATES), so no article here.
      : `They're ${card.archetype}. See what CineMind said.`)
    : (isHe
      ? 'תראו מה CineMind קרא בדירוגים שלו.'
      : 'See what CineMind read into their ratings.');

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
  const measured = isMeasured(card);
  // The card body stays English (see the note in generateMetadata) — this line is written to sit
  // next to the roast, not to be a translation of it.
  const honestRoast =
    "CineMind logged these ratings but hasn't named the genres behind them yet. " +
    'What it can stand behind is below: how far this taste sits from the crowd, and how sure it is.';

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
      <div className="max-w-md w-full">
        <RoastCard
          handle={card.handle}
          archetype={measured ? card.archetype : 'Taste not named yet'}
          roastText={measured ? card.roastText : honestRoast}
          topGenres={measured ? card.topGenres.filter(g => g && g !== UNNAMED) : []}
          contrarianScore={card.contrarianScore}
          confidenceScore={card.confidenceScore}
        />
      </div>
    </div>
  );
}
