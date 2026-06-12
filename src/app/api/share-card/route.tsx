import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Archetype → visual identity for the shareable card.
// The card is the viral loop: people share *identity*, not content
// (Spotify Wrapped insight). WhatsApp-first for the Israeli market.
const ARCHETYPE_STYLE: Record<string, { emoji: string; color: string; he: string }> = {
  'The Pretentious Cinephile': { emoji: '🎩', color: '#8b5cf6', he: 'הסנוב הקולנועי' },
  'The Basic Binge-Watcher': { emoji: '🛋️', color: '#64748b', he: 'הבולען הסדרתי' },
  'The Action Junkie': { emoji: '💥', color: '#f97316', he: 'מכור האקשן' },
  'The Escapist': { emoji: '🌌', color: '#06b6d4', he: 'האסקפיסט' },
  'The Cinematic Edge-Lord': { emoji: '🔪', color: '#dc2626', he: 'שגריר האופל' },
  'The Hopeless Romantic': { emoji: '💘', color: '#ec4899', he: 'הרומנטיקן חסר התקנה' },
  'The Chaos Demon': { emoji: '🌀', color: '#a855f7', he: 'שד הכאוס' },
  'The Family & Animation Enthusiast': { emoji: '🧸', color: '#22c55e', he: 'ילד הנשמה' },
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const archetype = searchParams.get('archetype') || 'The Basic Binge-Watcher';
  const locale = searchParams.get('locale') || 'he';
  const style = ARCHETYPE_STYLE[archetype] || ARCHETYPE_STYLE['The Basic Binge-Watcher'];
  const title = locale === 'he' ? style.he : archetype;
  const tagline = locale === 'he'
    ? 'מה הארכיטיפ הקולנועי שלך? בדקו ב-CineMind'
    : "What's your movie personality? Find out on CineMind";

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a0c 0%, #18181b 60%, #0a0a0c 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 140 }}>{style.emoji}</div>
        <div
          style={{
            display: 'flex',
            fontSize: 72,
            fontWeight: 900,
            color: style.color,
            marginTop: 20,
            textShadow: `0 0 60px ${style.color}`,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#a1a1aa', marginTop: 24 }}>{tagline}</div>
        <div
          style={{
            display: 'flex',
            marginTop: 40,
            padding: '14px 40px',
            background: '#e11d48',
            borderRadius: 999,
            fontSize: 32,
            fontWeight: 700,
          }}
        >
          CineMind 🎬
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
