import { MovieContext } from '@/types';
import { tagMicroGenres } from './microGenres';

export interface BucketedDeck {
  action: MovieContext[];
  comedy: MovieContext[];
  horror: MovieContext[];
  drama: MovieContext[];
  scifi: MovieContext[];
  animation: MovieContext[];
  general: MovieContext[];
}

const GENRE_MAP: Record<number, string> = {
  // Action/Adventure
  28: 'action', 12: 'action',
  // Comedy
  35: 'comedy',
  // Horror/Thriller
  27: 'horror', 53: 'horror', 9648: 'horror',
  // Drama/Romance
  18: 'drama', 10749: 'drama', 80: 'drama',
  // Sci-Fi/Fantasy
  878: 'scifi', 14: 'scifi',
  // Animation/Family
  16: 'animation', 10751: 'animation'
};

const TMDB_API_KEY = process.env.TMDB_API_KEY;

let cachedDeck: MovieContext[] | null = null;
let fetchPromise: Promise<MovieContext[]> | null = null;

async function fetchPage(page: number): Promise<any[]> {
  if (!TMDB_API_KEY) return [];
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=he-IL&sort_by=popularity.desc&vote_count.gte=300&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    return [];
  }
}

export async function getMovieDeck(): Promise<MovieContext[]> {
  if (cachedDeck) return cachedDeck;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      if (!TMDB_API_KEY) {
        console.warn('TMDB_API_KEY is not defined. Using fallback.');
        return [];
      }

      const allResults: any[] = [];
      const batchSize = 10;
      const totalPages = 50;

      for (let i = 1; i <= totalPages; i += batchSize) {
        const batch: Promise<any[]>[] = [];
        for (let j = 0; j < batchSize && (i + j) <= totalPages; j++) {
          batch.push(fetchPage(i + j));
        }
        const batchResults = await Promise.all(batch);
        batchResults.forEach(results => {
          allResults.push(...results);
        });
      }

      const mappedMovies: MovieContext[] = allResults
        .filter(m => m.id && m.poster_path && m.overview && m.title)
        .map(m => {
          const mainGenreId = m.genre_ids && m.genre_ids.length > 0 ? m.genre_ids[0] : 28;
          return {
            id: m.id.toString(),
            title: m.title,
            originalDetails: `${m.original_title || m.title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
            rating: m.vote_average || 0.0,
            posterUrl: `/api/poster?path=${m.poster_path}&id=${m.id}`,
            overview: m.overview,
            trailerId: '',
            easterEgg: { type: 'oscar' },
            _genreIds: m.genre_ids || [],
            _microTags: tagMicroGenres(m.title, m.overview, m.genre_ids || [], m.vote_average || 0)
          };
        });

      // Deduplicate by ID
      const seen = new Set<string>();
      const dedupedMovies: MovieContext[] = [];
      for (const m of mappedMovies) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          dedupedMovies.push(m);
        }
      }

      cachedDeck = dedupedMovies;
      return dedupedMovies;
    } catch (error) {
      console.error('Error fetching movie deck:', error);
      return [];
    }
  })();

  return fetchPromise;
}

export function bucketMovies(movies: MovieContext[]): BucketedDeck {
  const bucketed: BucketedDeck = {
    action: [],
    comedy: [],
    horror: [],
    drama: [],
    scifi: [],
    animation: [],
    general: []
  };

  movies.forEach(m => {
    let placed = false;
    for (const g of (m._genreIds || [])) {
      const bucketName = GENRE_MAP[g];
      if (bucketName && bucketName in bucketed) {
        bucketed[bucketName as keyof BucketedDeck].push(m);
        placed = true;
        break;
      }
    }
    if (!placed) {
      bucketed.general.push(m);
    }
  });

  return bucketed;
}
