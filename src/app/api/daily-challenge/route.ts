import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Daily Taste Challenge — the Wordle mechanic: one mystery film per day,
// same for everyone, 24h countdown. The shareable comparison ("me vs the
// world") is the viral hook; the countdown is the retention hook.
//
// The pick is deterministic per date: seeded index into a curated TMDB
// discover page, so every visitor sees the same film with zero storage.

function dateSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) {
    h = (h * 31 + dateStr.charCodeAt(i)) >>> 0;
  }
  return h;
}

const FALLBACK_DAILY = {
  id: '550', title: 'מועדון קרב', originalTitle: 'Fight Club · 1999',
  posterUrl: '/api/poster?path=/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg',
  overview: 'גבר מדוכא פוגש מוכר סבונים כריזמטי...',
  globalRating: 8.4,
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get('locale') || 'he';

  // Israel-local date so the drop flips at midnight IL time.
  const now = new Date();
  const ilDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
  const seed = dateSeed(ilDate);

  // Countdown to next midnight IL.
  const ilNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const midnight = new Date(ilNow); midnight.setHours(24, 0, 0, 0);
  const secondsLeft = Math.max(0, Math.floor((midnight.getTime() - ilNow.getTime()) / 1000));

  let movie = FALLBACK_DAILY;
  if (TMDB_API_KEY) {
    try {
      // Rotate through 5 pages of all-time acclaimed films (vote_count>=3000
      // keeps picks recognizable enough to rate without watching trailers).
      const page = (seed % 5) + 1;
      const lang = locale === 'en' ? 'en-US' : 'he-IL';
      const res = await fetch(
        `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${lang}&sort_by=vote_average.desc&vote_count.gte=3000&page=${page}`,
        { next: { revalidate: 3600 } }
      );
      if (res.ok) {
        const data = await res.json();
        const pool = (data.results || []).filter((m: any) => m.poster_path && m.overview);
        if (pool.length > 0) {
          const m = pool[seed % pool.length];
          movie = {
            id: m.id.toString(),
            title: m.title,
            originalTitle: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
            posterUrl: `/api/poster?path=${m.poster_path}`,
            overview: m.overview,
            globalRating: m.vote_average,
          };
        }
      }
    } catch { /* fallback stays */ }
  }

  return NextResponse.json({
    date: ilDate,
    secondsUntilNextDrop: secondsLeft,
    movie,
    // Honest comparison baseline: the real TMDB global average, not invented
    // community stats. Framed client-side as "you vs the world".
    comparison: { source: 'tmdb_global', rating: movie.globalRating },
  });
}
