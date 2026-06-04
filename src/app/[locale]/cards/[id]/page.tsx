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
  const { id } = params;

  const snap = await adminDb.collection(COLLECTIONS.cards).doc(id).get();
  if (!snap.exists) return {};

  const card = snap.data() as ShareCard;
  
  return {
    title: `${card.handle}'s Cinematic DNA`,
    description: `They are a ${card.archetype}. See their Roast!`,
    openGraph: {
      title: `${card.handle}'s Cinematic DNA`,
      description: card.roastText,
      images: [`/cards/${id}/opengraph-image`]
    }
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
