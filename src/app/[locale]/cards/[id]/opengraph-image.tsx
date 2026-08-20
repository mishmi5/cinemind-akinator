import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS, ShareCard } from '@/types/firebase';

// Rendered with Rubik (Hebrew + Latin in one ttf) because satori's built-in font is
// Latin-only and silently drops Hebrew glyphs. The card body (archetype, roast, genres)
// is still generated in English by src/lib/taste/deriveTaste.ts; the field that can
// already be Hebrew today is card.handle, which the user types themselves.
// TODO(owner): Hebrew archetype names and roast templates in deriveTaste.ts would make
// the whole card Hebrew — the font here is no longer the blocker.
export const alt = 'Cinemind Roast Card';
// satori applies no bidi algorithm, so a Hebrew string is drawn left-to-right and comes out
// mirrored. The card body is English today, but the handle is typed by the user and is often
// Hebrew. Same treatment as the site-wide share image: reverse a line that is pure Hebrew.
const visual = (t: string) => (/[A-Za-z0-9]/.test(t) ? t : [...t].reverse().join(''));

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const rubik = await readFile(
    join(process.cwd(), 'public', 'fonts', 'Rubik-Bold.ttf')
  );
  const fonts = [
    { name: 'Rubik', data: rubik, weight: 700 as const, style: 'normal' as const },
  ];
  const snap = await adminDb.collection(COLLECTIONS.cards).doc(params.id).get();

  if (!snap.exists) {
    return new ImageResponse(
      (
        <div style={{ background: '#0a0a0c', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Rubik' }}>
          <h1 style={{ color: 'white' }}>Card Not Found</h1>
        </div>
      ),
      { ...size, fonts }
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
          fontFamily: 'Rubik',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', color: 'white', flex: 1 }}>
          <div style={{ display: 'flex', fontSize: '48px', fontWeight: 'bold', marginBottom: '16px' }}>
            <span style={{ color: '#fff' }}>{visual(String(card.handle || ''))}</span>
            <span style={{ color: '#71717a', marginLeft: '12px' }}>DNA</span>
          </div>
          
          <div style={{ display: 'flex', alignSelf: 'flex-start', padding: '8px 24px', background: 'rgba(239, 68, 68, 0.1)', border: '2px solid rgba(239, 68, 68, 0.2)', borderRadius: '9999px', color: '#ef4444', fontSize: '32px', fontWeight: 'bold', marginBottom: '40px' }}>
            {card.archetype}
          </div>

          {/* One text child, and no added quote marks — the roast often ends in one of its
              own. Two children on a non-flex node makes satori throw, which is what killed
              this image for every real card. */}
          <div style={{ display: 'flex', fontSize: '36px', color: '#d4d4d8', fontStyle: 'italic', lineHeight: 1.4, borderLeft: '4px solid #3f3f46', paddingLeft: '24px', maxWidth: '80%' }}>
            {card.roastText}
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
    { ...size, fonts }
  );
}
