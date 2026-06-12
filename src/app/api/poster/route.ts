import { NextResponse } from 'next/server';

/** Whitelist: only valid TMDB poster paths like /abc123XYZ.jpg */
const VALID_TMDB_PATH = /^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.redirect(new URL('/placeholder-movie.png', req.url));
  }

  if (!VALID_TMDB_PATH.test(path)) {
    return NextResponse.redirect(new URL('/placeholder-movie.png', req.url));
  }

  // w500 (not w780): question cards render ≤650px wide — w500 is visually
  // identical there at ~40% fewer bytes, cutting first-paint latency on the
  // image that IS the quiz experience. Server-side cache (revalidate) means
  // each unique poster is fetched from TMDB once, not once per visitor.
  const tmdbUrl = `https://image.tmdb.org/t/p/w500${path}`;

  try {
    const response = await fetch(tmdbUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      next: { revalidate: 31536000 }
    });
    
    if (!response.ok) {
      console.warn(`Poster proxy fallback triggered: TMDB returned ${response.status}`);
      return NextResponse.redirect(new URL('/placeholder-movie.png', req.url));
    }

    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Poster proxy error:', message);
    return NextResponse.redirect(new URL('/placeholder-movie.png', req.url));
  }
}