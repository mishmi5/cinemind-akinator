import { NextResponse } from 'next/server';
import type { AnswerPayload, SessionState, MovieContext } from '@/types';
import { sendTelegramAlert } from '@/lib/telegram';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getMovieDeck, bucketMovies } from '@/lib/engine/movieDeck';
import { shuffleWithSeed } from '@/lib/engine/prng';
import { selectNextQuestion } from '@/lib/engine/selectNextQuestion';
import { scoreMovie, diversityPenalty, isMicroKey, isMicroCountKey, isGenreCountKey, microKey, microCountKey, genreCountKey, hasHatedParentGenre, confidentSubGenre } from '@/lib/engine/scoreMovie';
import { tagMicroGenres } from '@/lib/engine/microGenres';
import { extractDecade, extractKeywords, DECADE_PREFIX, WORD_PREFIX } from '@/lib/engine/atomicTaste';

const CONFIDENCE_THRESHOLD = 0.97;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

const GENRE_MAP: Record<number, { name: string, egg: 'oscar' | 'blood' | 'wazzap' | 'matrix' }> = {
  28: { name: 'אקשן', egg: 'oscar' }, 12: { name: 'הרפתקאות', egg: 'oscar' }, 16: { name: 'אנימציה', egg: 'oscar' }, 
  35: { name: 'קומדיה', egg: 'wazzap' }, 80: { name: 'פשע', egg: 'oscar' }, 18: { name: 'דרמה', egg: 'oscar' },
  14: { name: 'פנטזיה', egg: 'oscar' }, 27: { name: 'אימה', egg: 'blood' }, 9648: { name: 'מסתורין', egg: 'blood' },
  878: { name: 'מדע בדיוני', egg: 'matrix' }, 53: { name: 'מתח', egg: 'blood' }
};

async function generateDynamicQuestion(title: string, overview: string, locale: string = 'he'): Promise<string> {
  try {
    if (process.env.MOCK_GPT === 'true' || process.env.DISABLE_RATE_LIMIT === 'true') {
      throw new Error('Mocking GPT');
    }
    const prompt = locale === 'en' 
      ? `Create a hilarious, crazy, and brilliant "yes/no/stars" question about the movie "${title}".
Movie overview for context: ${overview}.
The question will be shown in a lighthearted and sarcastic movie quiz app. The goal is to make the user laugh at the twisted description of the movie when they answer.
Example: "Seen the one where [something messed up from the plot]? How many stars does that stupidity get?"
Must follow:
1. Very short (1 to 2 sentences).
2. Sarcastic humor, light, and stupid in a good way.
3. The question must ask them to RATE a film they have already seen — never whether they would like to watch it. The stars measure how much they liked it, and there is a separate "not seen" button.
4. No quotes and no intros - just the question!`
      : `צור שאלת "כן/לא/כוכבים" קורעת מצחוק, מטורללת וגאונית לגבי הסרט "${title}". 
תקציר הסרט לעזרתך: ${overview}.
השאלה תוצג באפליקציית חידון קולנוע קלילה ועוקצנית. המטרה היא לגרום למשתמש לצחוק מהתיאור העקום של הסרט כשהוא עונה.
דוגמה לאיך זה צריך להיראות: "ראית את הסרט שבו [משהו דפוק ומצחיק מהעלילה]? כמה כוכבים תיתן לטמטום כזה?"
חובה:
1. קצר מאוד (משפט אחד עד שניים).
2. הומור עוקצני, קליל, ומטומטם בקטע טוב.
3. השאלה חייבת לבקש דירוג של סרט שהמשתמש כבר ראה — לא לשאול אם היה רוצה לראות אותו. הכוכבים מודדים כמה אהב, ויש כפתור נפרד ל"לא ראיתי".
4. בלי מרכאות ובלי הקדמות - רק השאלה נטו!`;

    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt,
      temperature: 0.9,
    });
    return text.trim();
  } catch (error) {
    // ASK WHAT THE STARS MEASURE. The controls under these are a 1-5 scale running שונא→אוהב with a
    // separate "לא ראיתי" button, so the answer is always a rating of a film the person has already
    // watched. Three of these asked something else — "היית זורם על סרט כמו X", "היית רואה?" — which
    // anyone can answer about a film they have never seen, and the answer then reaches the engine as
    // if they had seen and rated it. The same defect was fixed in the brain engine's questionText;
    // /pulse runs on THIS route, so the owner met it there. The jokes stay, the question does not.
    const fallbackTemplatesHe = [
      `בוא נראה, כמה כוכבים היית נותן ל"${title}"? (רמז: זה סרט, לא מדע טילים)`,
      `ראית את "${title}"? תכלס, כמה כוכבים זה שווה?`,
      `אומרים ש-"${title}" הוא יצירת מופת. או קשקוש מוחלט. מה הדירוג שלך?`,
      `"${title}" — אם ראית אותו, כמה כוכבים הוא חוטף ממך?`,
      `נניח שאתה תקוע במעלית ומישהו שואל אותך כמה כוכבים מגיעים ל"${title}". מה אתה עונה?`
    ];
    const fallbackTemplatesEn = [
      `Let's see, how many stars would you give "${title}"? (Hint: it's a movie, not rocket science)`,
      `Seen "${title}"? Honestly, how many stars is it worth?`,
      `They say "${title}" is a masterpiece. Or total garbage. What's your rating?`,
      `"${title}" — if you've seen it, how many stars does it get from you?`,
      `Say you're stuck in a lift and someone asks how many stars "${title}" deserves. What do you say?`
    ];
    const pool = locale === 'en' ? fallbackTemplatesEn : fallbackTemplatesHe;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

const FALLBACK_POOL: MovieContext[] = [
  { id: "155", title: "האביר האפל", originalDetails: "The Dark Knight · 2008", rating: 9.0, posterUrl: "/api/poster?path=/qJ2tW6WMUDux911r6m7haRef0WH.jpg&id=155", overview: "באטמן מתמודד מול הג'וקר...", trailerId: "EXeTwQWrcwY", easterEgg: { type: 'oscar' }, _genreIds: [28, 80], _microTags: ['fast_action', 'psych_thriller'] },
  { id: "27205", title: "התחלה", originalDetails: "Inception · 2010", rating: 8.8, posterUrl: "/api/poster?path=/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg&id=27205", overview: "גנב חלומות...", trailerId: "YoHD9XEInc0", easterEgg: { type: 'matrix' }, _genreIds: [878, 28], _microTags: ['psych_thriller', 'hard_scifi'] },
  { id: "807", title: "שבעה חטאים", originalDetails: "Se7en · 1995", rating: 8.6, posterUrl: "/api/poster?path=/191nKfP0ehp3uIvWqgPbFmI4lv9.jpg&id=807", overview: "רוצח סדרתי מתוחכם...", trailerId: "znmZoVkCjpI", easterEgg: { type: 'blood' }, _genreIds: [53, 80], _microTags: ['psych_thriller', 'slasher_horror'] },
  { id: "603", title: "מטריקס", originalDetails: "The Matrix · 1999", rating: 8.7, posterUrl: "/api/poster?path=/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg&id=603", overview: "העולם הוא אשליה...", trailerId: "vKQi3bBA1y8", easterEgg: { type: 'matrix' }, _genreIds: [878, 28], _microTags: ['dystopian', 'hard_scifi', 'fast_action'] },
  { id: "680", title: "ספרות זולה", originalDetails: "Pulp Fiction · 1994", rating: 8.9, posterUrl: "/api/poster?path=/vQWk5YBFWF4bZaofAbv0tShwBvQ.jpg&id=680", overview: "פושעים בלוס אנג'לס...", trailerId: "s7EdQ4FqbhY", easterEgg: { type: 'wazzap' }, _genreIds: [80], _microTags: ['classic_noir', 'parody'] },
  { id: "238", title: "הסנדק", originalDetails: "The Godfather · 1972", rating: 9.2, posterUrl: "/api/poster?path=/3bhkrj58Vtu7enYsRolD1fZdja1.jpg&id=238", overview: "ראש משפחת פשע בניו יורק...", trailerId: "UaVTIH8mujA", easterEgg: { type: 'oscar' }, _genreIds: [18, 80], _microTags: ['classic_noir', 'arthouse_oscar'] },
  { id: "98", title: "גלדיאטור", originalDetails: "Gladiator · 2000", rating: 8.2, posterUrl: "/api/poster?path=/wN2xWp1eIwCKOD0BHTcErTBv1Uq.jpg&id=98", overview: "גנרל רומי נבגד...", trailerId: "owK1qxDselE", easterEgg: { type: 'oscar' }, _genreIds: [28, 12], _microTags: ['fast_action', 'arthouse_oscar'] },
  { id: "157336", title: "בין כוכבים", originalDetails: "Interstellar · 2014", rating: 8.6, posterUrl: "/api/poster?path=/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg&id=157336", overview: "מסע בחלל להצלת האנושות...", trailerId: "zSWdZVtXT7E", easterEgg: { type: 'oscar' }, _genreIds: [878, 12], _microTags: ['hard_scifi', 'arthouse_oscar'] },
  { id: "4232", title: "צעקה", originalDetails: "Scream · 1996", rating: 8.4, posterUrl: "/api/poster?path=/lr9ZIrmuwVmZhpZuTCW8D9g0ZJe.jpg&id=4232", overview: "רוצח במסכה...", trailerId: "AWm_mkbdpCA", easterEgg: { type: 'wazzap' }, _genreIds: [27], _microTags: ['slasher_horror', 'parody'] },
  { id: "22970", title: "בקתה ביער", originalDetails: "The Cabin in the Woods · 2011", rating: 8.0, posterUrl: "/api/poster?path=/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg&id=22970", overview: "חברים בבקתה...", trailerId: "NsIilFNNmkY", easterEgg: { type: 'blood' }, _genreIds: [27, 35], _microTags: ['slasher_horror', 'parody'] },
  { id: "11036", title: "היומן", originalDetails: "The Notebook · 2004", rating: 8.0, posterUrl: "/api/poster?path=/rNzQyW4f8B8cQeg7Dgj3n6eT5k9.jpg&id=11036", overview: "סיפור אהבה חוצה עשורים...", trailerId: "FC6biTjEyZw", easterEgg: { type: 'oscar' }, _genreIds: [10749, 18], _microTags: ['arthouse_oscar'] },
  { id: "862", title: "צעצוע של סיפור", originalDetails: "Toy Story · 1995", rating: 8.3, posterUrl: "/api/poster?path=/uXDfjJbdP4ijW5hWSBrPrlKpxab.jpg&id=862", overview: "צעצועים קמים לתחייה...", trailerId: "v-PjgYDrg70", easterEgg: { type: 'oscar' }, _genreIds: [16, 10751, 35], _microTags: ['kids_magic'] }
];

async function getTrailerForMovieId(tmdbId: string): Promise<string> {
  if (!TMDB_API_KEY || tmdbId.startsWith('fb')) return '';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}&language=en-US`, { next: { revalidate: 3600 } });
    if (!res.ok) return '';
    const data = await res.json();
    if (!data.results || data.results.length === 0) return '';
    const trailer = data.results.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
                 || data.results.find((v: any) => v.type === 'Teaser' && v.site === 'YouTube')
                 || data.results.find((v: any) => v.site === 'YouTube');
    return trailer ? trailer.key : '';
  } catch(e) {
    return '';
  }
}

async function fetchMoviesFromTMDB(page: number, affinities: Record<string, number>, locale: string = 'he', disableRandomYear: boolean = false): Promise<MovieContext[]> {
  if (!TMDB_API_KEY) return FALLBACK_POOL; 
  
  // 1. Analyze Affinities to dynamically build API query
  let likedGenres: string[] = [];
  let hatedGenres: string[] = [];
  
  Object.entries(affinities).forEach(([genreId, score]) => {
    // Only query actual numeric TMDB genre IDs
    if (genreId !== 'General' && !isMicroKey(genreId) && !isMicroCountKey(genreId) && !isGenreCountKey(genreId) && !genreId.startsWith(DECADE_PREFIX) && !genreId.startsWith(WORD_PREFIX)) {
      if (score >= 2) likedGenres.push(genreId);
      if (score <= -2) hatedGenres.push(genreId);
    }
  });

  const langParam = locale === 'en' ? 'en-US' : 'he-IL';
  
  // 🔥 SCALE: Unlock 100,000+ movies!
  // TMDB caps at 500 pages. By picking a random year between 1980 and 2024, 
  // we access 500 pages of THAT specific year, exponentially growing our movie pool.
  let url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&vote_count.gte=300&page=${page}`;
  
  if (!disableRandomYear) {
    const randomYear = Math.floor(Math.random() * (2024 - 1980 + 1)) + 1980;
    url += `&primary_release_year=${randomYear}`;
  }
  
  if (likedGenres.length > 0) {
    url += `&with_genres=${likedGenres.slice(0,2).join(',')}`;
  }
  if (hatedGenres.length > 0) {
    url += `&without_genres=${hatedGenres.join(',')}`;
  }

  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return FALLBACK_POOL;
    const data = await res.json();
    
    return data.results.filter((m: any) => m.poster_path && m.overview).map((m: any) => {
      const mainGenreId = m.genre_ids && m.genre_ids.length > 0 ? m.genre_ids[0] : 28;
      const eggType = GENRE_MAP[mainGenreId]?.egg || 'oscar';
      return {
        id: m.id.toString(), title: m.title, originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
        rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}&id=${m.id}`, overview: m.overview,
        trailerId: '', easterEgg: { type: eggType }, _genreIds: m.genre_ids,
        _microTags: tagMicroGenres(m.title, m.overview, m.genre_ids || [], m.vote_average || 0)
      };
    });
  } catch (e) { return FALLBACK_POOL; }
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    if (!(await checkRateLimit(ip, 50, 60000))) { // Max 50 requests per minute
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    const payload: AnswerPayload = await req.json();
    const currentConfidence = payload.currentConfidence !== undefined
      ? payload.currentConfidence
      : parseFloat(req.headers.get('x-current-confidence') || '0.01');

    const currentCount = payload.historyCount !== undefined
      ? payload.historyCount
      : parseInt(req.headers.get('x-history-count') || '0', 10);

    const locale = payload.locale || req.headers.get('x-locale') || 'he';

    let askedMovieIds: string[] = payload.askedMovieIds || [];
    if (!payload.askedMovieIds) {
      try {
        askedMovieIds = JSON.parse(req.headers.get('x-asked-ids') || '[]');
      } catch {
        askedMovieIds = [];
      }
    }

    let userAffinities: Record<string, number> = payload.userAffinities || {};
    if (!payload.userAffinities) {
      try {
        userAffinities = JSON.parse(req.headers.get('x-affinities') || '{}');
      } catch {
        userAffinities = {};
      }
    }

    // Track movies the user has SEEN (rated 1-2 on high-profile titles = likely already watched)
    // These are excluded from final recommendations.
    let seenMovieIds: string[] = payload.seenMovieIds || [];

    let seed = payload.seed !== undefined && payload.seed !== null && !isNaN(payload.seed) ? payload.seed : null;
    if (seed === null) {
      const sessionSeedHeader = req.headers.get('x-session-seed');
      seed = sessionSeedHeader ? parseInt(sessionSeedHeader, 10) : null;
    }

    // Load movie deck early so we can read movie tags for answer-time credit
    let deck = await getMovieDeck();
    if (deck.length === 0) deck = FALLBACK_POOL;

    if (payload.isInit) {
      if (seed === null || isNaN(seed)) {
        seed = (process.env.MOCK_GPT === 'true' || process.env.DISABLE_RATE_LIMIT === 'true')
          ? 42
          : Math.floor(Math.random() * 2147483647);
      }

      const flatShuffledDeck = shuffleWithSeed(deck, seed);
      const bucketed = bucketMovies(deck);
      const action = shuffleWithSeed(bucketed.action, seed + 1);
      const comedy = shuffleWithSeed(bucketed.comedy, seed + 2);
      const horror = shuffleWithSeed(bucketed.horror, seed + 3);
      const drama = shuffleWithSeed(bucketed.drama, seed + 4);
      const scifi = shuffleWithSeed(bucketed.scifi, seed + 5);
      const animation = shuffleWithSeed(bucketed.animation, seed + 6);
      const general = shuffleWithSeed(bucketed.general, seed + 7);
      const shuffledBuckets = { action, comedy, horror, drama, scifi, animation, general };

      const askedSet = new Set(askedMovieIds);
      const selected = selectNextQuestion(shuffledBuckets, askedSet, {}, 0, flatShuffledDeck, seed);

      if (!selected) {
        return NextResponse.json({ error: 'No movies available' }, { status: 500 });
      }

      if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
      askedMovieIds.push(selected.id);

      return NextResponse.json({
        sessionId: payload.sessionId || `session_${Date.now()}`,
        seed,
        isComplete: false, confidenceScore: 0.01, historyCount: 0,
        askedMovieIds, userAffinities: {},
        currentVectorState: { leadingMicroGenres: [locale === 'en' ? 'Initializing global scan...' : 'מאתחל סריקה גלובלית...'] },
        currentQuestion: { id: `init_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected }
      }, { status: 200 });
    }

    if (seed === null || isNaN(seed)) {
      seed = 12345; // default fallback seed
    }

    // 👑 אלגוריתם התקדמות כירורגי ודינמי לחלוטין
    let confidenceBoost = 0.002; 
    
    if (payload.movieId && !askedMovieIds.includes(payload.movieId)) {
      askedMovieIds.push(payload.movieId);
      // A rating outside 1..5 was taken at face value — answer:99 wrote an affinity of 96.
      if (typeof payload.answer === 'number'
          && Number.isInteger(payload.answer) && payload.answer >= 1 && payload.answer <= 5) {
        const weight = (payload.answer - 3); 
        
        if (payload.answer === 5 || payload.answer === 1) {
          confidenceBoost = Math.random() * 0.015 + 0.02; // 0.02 to 0.035 (takes ~25-35 Qs for decisive users)
        } else if (payload.answer === 4 || payload.answer === 2) {
          confidenceBoost = Math.random() * 0.01 + 0.01; // 0.01 to 0.02 (takes ~45-50 Qs)
        } else {
          confidenceBoost = 0.005; // Meh answer takes almost forever
        }
        
        if (weight !== 0) {
          userAffinities['General'] = (userAffinities['General'] || 0) + weight;

          // Update specific genre affinities!
          if (payload.genreIds && payload.genreIds.length > 0) {
            payload.genreIds.forEach(g => {
              userAffinities[g.toString()] = (userAffinities[g.toString()] || 0) + weight;
              // Track exposure count for conviction (per-exposure average) scoring.
              const gck = genreCountKey(g);
              userAffinities[gck] = (userAffinities[gck] || 0) + 1;
            });
          }

          const ratedMovie = deck.find(m => m.id === payload.movieId);
          if (ratedMovie) {
            // Credit micro-genre affinities
            if (ratedMovie._microTags) {
              ratedMovie._microTags.forEach(t => {
                const k = microKey(t);
                userAffinities[k] = (userAffinities[k] || 0) + weight;
                // Track exposure count for conviction (per-exposure average) scoring.
                const ck = microCountKey(t);
                userAffinities[ck] = (userAffinities[ck] || 0) + 1;
              });
            }

            // Layer 3: Credit Decade affinity
            const decade = extractDecade(ratedMovie.originalDetails);
            if (decade) {
              const key = `${DECADE_PREFIX}${decade}`;
              userAffinities[key] = (userAffinities[key] || 0) + weight;
            }

            // Layer 3: Credit Keyword affinities
            const words = extractKeywords(ratedMovie.title, ratedMovie.overview);
            words.forEach(w => {
              const key = `${WORD_PREFIX}${w}`;
              userAffinities[key] = (userAffinities[key] || 0) + weight;
            });

            // 🎯 UNSEEN TRACKING: Low rating (1-2★) on a well-known movie (rating≥7)
            // signals the user has SEEN it (and disliked it). Track for exclusion from recs.
            if (payload.answer <= 2 && (ratedMovie.rating || 0) >= 7.0) {
              if (!seenMovieIds.includes(payload.movieId)) {
                seenMovieIds.push(payload.movieId);
              }
            }
          }
        } else {
          // Neutral answer (3★) — could mean unseen OR indifferent.
          // We do NOT mark as seen to avoid false exclusions.
        }
      }
    }

    // 🎯 Signal-based completion (PM mandate: never reveal below ~97% certainty).
    // Finish only when the engine genuinely KNOWS the user's sub-genre — i.e. a
    // micro-genre is conviction-locked with strong raw signal over enough
    // exposures — or at the hard question cap. This replaces the old random
    // confidence accumulator, making completion deterministic and robust.
    const MIN_QUESTIONS_BEFORE_COMPLETE = 12; // 0-indexed → ~13 answers
    const HARD_CAP_INDEX = 59; // 0-indexed → 60th question
    const knownSubGenre = confidentSubGenre(userAffinities);
    let isComplete = false;
    if (currentCount >= HARD_CAP_INDEX) {
      isComplete = true; // hard cap
    } else if (currentCount >= MIN_QUESTIONS_BEFORE_COMPLETE && knownSubGenre) {
      isComplete = true; // engine is confident about the sub-genre
    }
    // Display confidence (cosmetic FOMO meter) — derived from real signal.
    let newConfidence = knownSubGenre
      ? 0.98
      : Math.min(0.95, currentConfidence + confidenceBoost);

    const flatShuffledDeck = shuffleWithSeed(deck, seed);
    const bucketed = bucketMovies(deck);
    const action = shuffleWithSeed(bucketed.action, seed + 1);
    const comedy = shuffleWithSeed(bucketed.comedy, seed + 2);
    const horror = shuffleWithSeed(bucketed.horror, seed + 3);
    const drama = shuffleWithSeed(bucketed.drama, seed + 4);
    const scifi = shuffleWithSeed(bucketed.scifi, seed + 5);
    const animation = shuffleWithSeed(bucketed.animation, seed + 6);
    const general = shuffleWithSeed(bucketed.general, seed + 7);
    const shuffledBuckets = { action, comedy, horror, drama, scifi, animation, general };

    let nextMovie = null;
    let finalMoviesResult = undefined;

    if (!isComplete) {
      const askedSet = new Set(askedMovieIds);
      const selected = selectNextQuestion(shuffledBuckets, askedSet, userAffinities, currentCount, flatShuffledDeck, seed);
      
      if (!selected) {
        isComplete = true;
      } else {
        if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
        nextMovie = { id: `q_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected };
      }
    } 
    
    if (isComplete) {
      // Fetch the absolute best matches based on affinities from flat shuffled deck
      // 🎯 UNSEEN GUARANTEE: Exclude movies the user has explicitly seen (rated low on well-known films)
      const seenSet = new Set(seenMovieIds);
      // Never recommend a movie carrying a clearly-hated parent genre — it always
      // reads as an engine mismatch. Fall back to the unfiltered pool only if the
      // hated-filter would leave us with too few candidates to fill 3 slots.
      const basePool = flatShuffledDeck.filter(m =>
        !askedMovieIds.includes(m.id) && !seenSet.has(m.id)
      );
      const cleanPool = basePool.filter(m => !hasHatedParentGenre(m, userAffinities));
      const recommended = cleanPool.length >= 3 ? cleanPool : basePool;
      // Concentrate recommendations on the dominant confident sub-genre so all
      // three picks land squarely on the user's true niche (not adjacent micros
      // that merely co-occurred). FOCUS_BONUS dominates the clustered base scores.
      const focusMicro = confidentSubGenre(userAffinities);
      const FOCUS_BONUS = 40;
      const scoredRecs = recommended.map(m => {
        let s = scoreMovie(m, userAffinities);
        if (focusMicro && (m._microTags || []).includes(focusMicro)) s += FOCUS_BONUS;
        return { movie: m, score: s };
      });
      
      // The picks are kept with their scores, not stripped down to the films. The badge on the
      // results card used to read 99% for every pick of every user — a number nobody computed.
      // The scores that ranked these three are right here; a match figure derived from them and
      // from the confidence the quiz actually reached is a measurement rather than a decoration.
      const top3scored: { movie: MovieContext; score: number }[] = [];
      const top3: MovieContext[] = [];
      const pool = [...scoredRecs];
      while (top3.length < 3 && pool.length) {
        pool.sort((a, b) =>
          (b.score + diversityPenalty(b.movie, top3, userAffinities)) - (a.score + diversityPenalty(a.movie, top3, userAffinities))
        );
        const next = pool.shift()!;
        top3scored.push(next);
        top3.push(next.movie);
      }

      for (const match of top3) {
        if (!match.trailerId) match.trailerId = await getTrailerForMovieId(match.id);
      }
      // Relative to the best pick, so the second and third read as slightly weaker matches — which
      // is what they are — and scaled by the confidence the quiz reached, so a person who stopped
      // early is not told the read was as sure as a completed one. Floored at 60 because a figure
      // below that would be telling someone we recommended a film we do not believe in.
      const bestScore = Math.max(1, top3scored[0]?.score ?? 1);
      finalMoviesResult = top3scored.map(({ movie: bestMatch, score }) => ({
        id: `res_${bestMatch.id}`, title: bestMatch.title,
        matchScore: Math.max(60, Math.round(Math.min(1, score / bestScore) * Math.max(newConfidence, 0.6) * 100)),
        posterUrl: bestMatch.posterUrl, trailerId: bestMatch.trailerId, overview: bestMatch.overview,
        _microTags: bestMatch._microTags || [],
        _genreIds: bestMatch._genreIds || []
      }));
    }

    // 👑 Sales Psychology: Dramatic reduction in remaining movies to build massive FOMO
    // `possibleMoviesRemaining` used to be emitted here as 85432 × (1-confidence)^4.5 — a count of
    // films "still in play" derived from the progress bar rather than from any pool this engine
    // holds. Nothing in the interface ever rendered it, so it was a fabricated number kept alive
    // for no reader at all. The field is gone from both responses; the coaching line below is what
    // the screen actually shows, and it says how the read is going without quoting a fake count.
    
    let psychologicalMessage = locale === 'en' ? 'Catching your vibe...' : 'קולט את הווייב שלך...';
    if (newConfidence > 0.8) psychologicalMessage = locale === 'en' ? 'Wow, you have a very specific taste. Only a few movies match...' : 'אוקיי, יש לך טעם ממש מיוחד. נשארו סרטים בודדים שיכולים להתאים...';
    else if (newConfidence > 0.5) psychologicalMessage = locale === 'en' ? 'Filtering out thousands of irrelevant movies...' : 'מעיף עכשיו אלפי סרטים שלא בכיוון שלך בכלל...';
    else if (newConfidence > 0.3) psychologicalMessage = locale === 'en' ? 'Starting to understand you...' : 'מתחיל להבין אותך...';

    // A proofToken is what /api/user/bootstrap exchanges for XP and Popcorn Tokens, and this
    // route handed one out for a single request claiming historyCount:99 — no quiz, infinite
    // currency, one loop. The gate that closed this on the brain engine was never applied to its
    // sibling. This route keeps no server-side session, so it cannot prove anything: it issues no
    // token at all, and the brain engine remains the only way to earn one.
    const proofToken = null;
    if (false) {
      const { signSessionState } = await import('@/lib/sessionToken');
      signSessionState({
        sessionId: payload.sessionId || `session_${Date.now()}`,
        totalAnswers: currentCount + 1,
        affinities: userAffinities,
        completedAt: Date.now()
      });
    }

    return NextResponse.json({
      sessionId: payload.sessionId || `session_${Date.now()}`,
      seed,
      isComplete, confidenceScore: isComplete ? 1.0 : newConfidence,
      historyCount: currentCount + 1, askedMovieIds, userAffinities, seenMovieIds,
      currentVectorState: { leadingMicroGenres: [psychologicalMessage] },
      currentQuestion: isComplete ? null : nextMovie,
      finalMovies: finalMoviesResult,
      proofToken
    }, { status: 200 });

  } catch (error) {
    await sendTelegramAlert('🚨 <b>CineMind Error</b>\nCritical failure in next-question API.\n' + String(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}