import { ImageResponse } from 'next/og';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, ShareCard } from '@/types/firebase';

// This image is deliberately Latin-only. next/og renders through satori, whose built-in
// font is Latin — Hebrew glyphs come out as blank boxes unless a Hebrew font file is
// passed in `fonts`. Everything drawn here (archetype, roast, genres) is generated in
// English by src/lib/taste/deriveTaste.ts, so there is nothing to translate yet, and
// shipping boxes would be worse than shipping English.
// TODO(owner): the one field that can already be Hebrew is card.handle, which the user
// types themselves — a Hebrew handle renders blank here. Fixing it means committing a
// Hebrew font (e.g. public/fonts/Rubik-Bold.ttf, ~200KB), reading it with fs.readFile
// and passing it as `fonts: [{ name: 'Rubik', data, weight: 700, style: 'normal' }]` in
// the ImageResponse options below. Same font would then also allow a Hebrew card.
export const alt = 'Cinemind Roast Card';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const snap = await adminDb.collection(COLLECTIONS.cards).doc(params.id).get();
  
  if (!snap.exists) {
    return new ImageResponse(
      (
        <div style={{ background: '#000', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h1 style={{ color: 'white' }}>Card Not Found</h1>
        </div>
      ),
      { ...size }
    );
  }

  const card = snap.data() as ShareCard;

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(to bottom right, #09090b, #18181b)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', color: 'white', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }}>
            <span style={{ color: '#fff' }}>{card.handle}</span>
            <span style={{ color: '#71717a', marginLeft: '12px' }}>DNA</span>
          </div>
          
          <div style={{ display: 'flex', padding: '8px 24px', background: 'rgba(239, 68, 68, 0.1)', border: '2px solid rgba(239, 68, 68, 0.2)', borderRadius: '9999px', color: '#ef4444', fontSize: '32px', fontWeight: 'bold', marginBottom: '40px' }}>
            {card.archetype}
          </div>

          <div style={{ fontSize: '36px', color: '#d4d4d8', fontStyle: 'italic', lineHeight: 1.4, borderLeft: '4px solid #3f3f46', paddingLeft: '24px', maxWidth: '80%' }}>
            "{card.roastText}"
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            {card.topGenres.map((g) => (
              <div key={g} style={{ padding: '8px 16px', background: '#27272a', borderRadius: '8px', color: '#e4e4e7', fontSize: '24px' }}>
                {g}
              </div>
            ))}
          </div>
          <div style={{ fontSize: '48px', fontWeight: '900', color: '#ef4444' }}>
            CineMind
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
