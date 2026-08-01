import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// The share image for every page that has none of its own. It is generated rather
// than shipped as a PNG so the Hebrew copy stays editable text.
//
// Hebrew: satori (what next/og renders through) ships a Latin-only default font and
// silently drops glyphs it cannot draw, so Hebrew comes out blank. public/fonts/
// Rubik-Bold.ttf is Google's full Rubik ttf (OFL) — Hebrew and Latin in one file —
// and passing it in `fonts` is what makes the Hebrew line render.
export const alt = 'CineMind';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// satori draws glyphs in the order the string gives them and applies no bidi algorithm, so a
// Hebrew line comes out mirrored — "הפסקת לנחש" rendered as "שחנל תקספה". I saw it in the produced
// PNG. For a line that is pure Hebrew, reversing the characters is exactly the visual order; a
// line containing Latin or digits is left alone, because reversing that would break it instead.
const visual = (t: string) => (/[A-Za-z0-9]/.test(t) ? t : [...t].reverse().join(''));

const COPY = {
  he: {
    dir: 'rtl' as const,
    // Explicit lines, not wrapping. Reversing a string fixes the glyph order, but if satori then
    // wraps it the LINES come out in the wrong order too — the sentence read bottom-up. Each line
    // is reversed on its own and stacked in reading order.
    tagline: ['הפסקת לנחש.', 'התחלת לראות.'].map(visual),
    sub: ['שלוש שאלות, ואתה מקבל', 'את הסרט שבאמת בא לך הערב.'].map(visual),
    kicker: visual('מנוע המלצות קולנועי'),
  },
  en: {
    dir: 'ltr' as const,
    tagline: ['Stop guessing.', 'Start watching.'],
    sub: ['Three questions, and you get', 'the film you actually want tonight.'],
    kicker: 'Cinematic recommendation engine',
  },
};

export default async function Image(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  const copy = locale === 'en' ? COPY.en : COPY.he;
  const rubik = await readFile(
    join(process.cwd(), 'public', 'fonts', 'Rubik-Bold.ttf')
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#0a0a0c',
          // Indigo bloom top-left, rose bloom bottom-right — the product's palette.
          backgroundImage:
            'radial-gradient(900px 500px at 12% 0%, rgba(99,102,241,0.28), transparent 60%), radial-gradient(700px 500px at 100% 110%, rgba(244,63,94,0.30), transparent 60%)',
          fontFamily: 'Rubik',
          color: '#fafafa',
          direction: copy.dir,
        }}
      >
        <div
          style={{
            display: 'flex',
            // satori lays flex rows out left-to-right whatever `direction` says, so the
            // kicker and the wordmark are pushed to the right by hand for Hebrew.
            justifyContent: copy.dir === 'rtl' ? 'flex-end' : 'flex-start',
            alignItems: 'center',
            gap: '18px',
            fontSize: '34px',
            color: '#a5b4fc',
          }}
        >
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '9999px',
              background: '#f43f5e',
            }}
          />
          {copy.kicker}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: copy.dir === 'rtl' ? 'flex-end' : 'flex-start',
            fontSize: '92px',
            lineHeight: 1.15,
            marginTop: '28px',
            letterSpacing: '-1px',
          }}
        >
          {copy.tagline.map((line) => (
            <div key={line} style={{ display: 'flex' }}>{line}</div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: copy.dir === 'rtl' ? 'flex-end' : 'flex-start',
            fontSize: '38px',
            lineHeight: 1.4,
            marginTop: '36px',
            color: '#a1a1aa',
          }}
        >
          {copy.sub.map((line) => (
            <div key={line} style={{ display: 'flex' }}>{line}</div>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: copy.dir === 'rtl' ? 'flex-end' : 'flex-start',
            marginTop: '52px',
            fontSize: '52px',
            color: '#f43f5e',
          }}
        >
          CineMind
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Rubik', data: rubik, weight: 700, style: 'normal' }],
    }
  );
}
