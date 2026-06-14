// TMDB grounding for the taste brain: real candidate movies for questions, and
// title→movie resolution so LLM-proposed recommendations are validated (no
// hallucinated films or wrong posters).
import type { MovieContext } from '@/types';

const KEY = process.env.TMDB_API_KEY;

export const GENRE_NAMES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
export const genreNames = (ids?: number[]) => (ids || []).map(id => GENRE_NAMES[id]).filter(Boolean);

export interface BrainCandidate { id: string; title: string; year?: string; genres: string[]; _genreIds?: number[]; }

const langOf = (locale: string) => (locale === 'en' ? 'en-US' : 'he-IL');

/** A broad, popular, real candidate pool for the brain to choose the next question
 *  from. Random year keeps successive quizzes fresh. Excludes already-seen ids. */
export async function fetchCandidatePool(seenIds: string[], locale = 'he', size = 25): Promise<BrainCandidate[]> {
  if (!KEY) return [];
  const seen = new Set(seenIds);
  const year = 1980 + Math.floor(Math.random() * (2024 - 1980 + 1));
  const page = 1 + Math.floor(Math.random() * 5);
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${KEY}&language=${langOf(locale)}&sort_by=popularity.desc&vote_count.gte=300&primary_release_year=${year}&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((m: any) => m.poster_path && m.overview && !seen.has(m.id.toString()))
      .slice(0, size)
      .map((m: any) => ({
        id: m.id.toString(), title: m.title,
        year: m.release_date ? m.release_date.split('-')[0] : undefined,
        genres: genreNames(m.genre_ids), _genreIds: m.genre_ids,
      }));
  } catch { return []; }
}

/** Build a full MovieContext for a TMDB movie id (poster, overview, genres). */
export async function movieById(id: string, locale = 'he'): Promise<MovieContext | null> {
  if (!KEY || !/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${KEY}&language=${langOf(locale)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const m = await res.json();
    if (!m.poster_path) return null;
    return {
      id: m.id.toString(), title: m.title || m.original_title,
      originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
      rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}`,
      overview: m.overview || '', trailerId: '', easterEgg: { type: 'oscar' },
      _genreIds: (m.genres || []).map((g: any) => g.id),
    };
  } catch { return null; }
}

/** Resolve an LLM-proposed {title, year} to a REAL TMDB movie — grounding the recs.
 *  Search runs in en-US (TMDB matches English/original titles far more reliably than
 *  localized ones), then details are fetched in the user's locale. */
export async function resolveByTitle(title: string, year: string | null, locale = 'he'): Promise<MovieContext | null> {
  if (!KEY) return null;
  try {
    const q = encodeURIComponent(title);
    const yq = year ? `&year=${encodeURIComponent(year)}` : '';
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${KEY}&language=en-US&query=${q}${yq}`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.results || []).find((m: any) => m.poster_path && m.overview) || (data.results || [])[0];
    if (!hit) return null;
    return movieById(hit.id.toString(), locale);
  } catch { return null; }
}

export async function getTrailer(id: string): Promise<string> {
  if (!KEY || !/^\d+$/.test(id)) return '';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}/videos?api_key=${KEY}&language=en-US`, { next: { revalidate: 3600 } });
    if (!res.ok) return '';
    const data = await res.json();
    const t = (data.results || []).find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
    return t ? t.key : '';
  } catch { return ''; }
}
