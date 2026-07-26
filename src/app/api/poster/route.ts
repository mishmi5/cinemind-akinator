import { NextResponse } from 'next/server';

/** Whitelist: only valid TMDB poster paths like /abc123XYZ.jpg */
const VALID_TMDB_PATH = /^\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');
  const id = searchParams.get('id');

  if (!path) {
    return new NextResponse('Missing path', { status: 400 });
  }

  if (!VALID_TMDB_PATH.test(path)) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  let tmdbUrl = `https://image.tmdb.org/t/p/w780${path}`;

  try {
    let response = await fetch(tmdbUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });
    
    // SELF-HEALING: If TMDB returns 404 and we have the movie ID, 
    // it means they changed their primary poster. Fetch the new one dynamically!
    if (!response.ok && id && process.env.TMDB_API_KEY) {
      console.warn(`Poster proxy: TMDB 404 for ${path}. Attempting self-healing with ID ${id}...`);
      const movieRes = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${process.env.TMDB_API_KEY}`);
      if (movieRes.ok) {
        const movieData = await movieRes.json();
        if (movieData.poster_path && movieData.poster_path !== path) {
          tmdbUrl = `https://image.tmdb.org/t/p/w780${movieData.poster_path}`;
          response = await fetch(tmdbUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
            }
          });
          console.log(`Poster proxy: Self-healed ID ${id} with new poster ${movieData.poster_path}!`);
        }
      }
    }

    if (!response.ok) {
      console.warn(`Poster proxy fallback triggered: TMDB returned ${response.status}`);
      return new NextResponse('Not found', { status: 404 });
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
    return new NextResponse('Internal error', { status: 500 });
  }
}