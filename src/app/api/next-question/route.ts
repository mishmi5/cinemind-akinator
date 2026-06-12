import { NextResponse } from 'next/server';
import type { AnswerPayload, SessionState, MovieContext } from '@/types';
import { sendTelegramAlert } from '@/lib/telegram';
import { checkRateLimit } from '@/lib/rateLimit';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

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
    const prompt = locale === 'en' 
      ? `Create a hilarious, crazy, and brilliant "yes/no/stars" question about the movie "${title}".
Movie overview for context: ${overview}.
The question will be shown in a lighthearted and sarcastic movie quiz app. The goal is to make the user laugh at the twisted description of the movie when they answer.
Example: "Would you go with the flow to watch a movie where [something messed up from the plot]? How many stars would you give to such stupidity?"
Must follow:
1. Very short (1 to 2 sentences).
2. Sarcastic humor, light, and stupid in a good way.
3. No quotes and no intros - just the question!`
      : `צור שאלת "כן/לא/כוכבים" קורעת מצחוק, מטורללת וגאונית לגבי הסרט "${title}". 
תקציר הסרט לעזרתך: ${overview}.
השאלה תוצג באפליקציית חידון קולנוע קלילה ועוקצנית. המטרה היא לגרום למשתמש לצחוק מהתיאור העקום של הסרט כשהוא עונה.
דוגמה לאיך זה צריך להיראות: "היית זורם לראות סרט שבו [משהו דפוק ומצחיק מהעלילה]? כמה כוכבים תיתן לטמטום כזה?"
חובה:
1. קצר מאוד (משפט אחד עד שניים).
2. הומור עוקצני, קליל, ומטומטם בקטע טוב.
3. בלי מרכאות ובלי הקדמות - רק השאלה נטו!`;

    const { text } = await generateText({
      model: openai('gpt-4o'),
      prompt,
      temperature: 0.9,
    });
    return text.trim();
  } catch (error) {
    const fallbackTemplatesHe = [
      `בוא נראה, כמה כוכבים היית נותן ל"${title}"? (רמז: זה סרט, לא מדע טילים)`,
      `תכלס, היית זורם על סרט כמו "${title}" או שזה בזבוז פופקורן?`,
      `אומרים ש-"${title}" הוא יצירת מופת. או קשקוש מוחלט. מה הדירוג שלך?`,
      `אם היו מכריחים אותך לראות את "${title}", כמה כוכבים היית נותן לו מהרגע שיצאת מהשוק?`,
      `נניח שאתה תקוע במעלית. ויש שם טלוויזיה. שמשדרת את "${title}". היית רואה?`
    ];
    const fallbackTemplatesEn = [
      `Let's see, how many stars would you give "${title}"? (Hint: it's a movie, not rocket science)`,
      `Honestly, would you flow with a movie like "${title}" or is it a waste of popcorn?`,
      `They say "${title}" is a masterpiece. Or total garbage. What's your rating?`,
      `If you were forced to watch "${title}", how many stars would you give it after recovering from the shock?`,
      `Suppose you're stuck in an elevator. There's a TV playing "${title}". Would you watch?`
    ];
    const pool = locale === 'en' ? fallbackTemplatesEn : fallbackTemplatesHe;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}

// Exploration pool lives in src/lib/engine/baselinePool.ts — 12 taste buckets ×
// 2-3 TMDB-verified candidates. Per-session rotation gives every quiz full
// genre coverage (accuracy) with a different movie mix and order (variety).
// Old hardcoded pool had stale poster paths that rendered WRONG artwork
// (Se7en displayed Detective Pikachu's poster).
import { pickBaselineMovie, fullBaselinePool } from '@/lib/engine/baselinePool';
import { nichesForKeywords, nicheKey, isNicheKey, NICHE_HE } from '@/lib/engine/subGenres';

// ---- Sub-genre (niche) layer: see TASTE-FORMULA.md §1-2 ----
// Keywords per movie are fetched once and cached for the server's lifetime;
// the niche list rides MovieContext._niches → client → answer payload.
// Fire-and-forget poster warm-up: kick the TMDB image into Next's data cache
// the moment a movie is selected, so when the browser requests /api/poster a
// second later the bytes are already local. Cold TMDB image fetches for
// obscure titles can exceed 8s — users see a placeholder and churn.
function warmPoster(posterUrl: string) {
  const m = posterUrl.match(/path=(\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp))/);
  if (!m) return;
  fetch(`https://image.tmdb.org/t/p/w500${m[1]}`, { next: { revalidate: 31536000 } }).catch(() => {});
}

// Reverse lookup niche -> TMDB keyword id (resolved once via /search/keyword,
// cached for the server lifetime). Used to inject niche-true candidates into
// the recommendation pool with OR semantics (id1|id2) — AND would intersect
// the stream to nothing, the same starvation mode as over-eager without_genres.
const keywordIdCache = new Map<string, number | null>();
async function keywordIdForNiche(niche: string): Promise<number | null> {
  if (!TMDB_API_KEY) return null;
  if (keywordIdCache.has(niche)) return keywordIdCache.get(niche)!;
  try {
    const q = encodeURIComponent(niche.replace(/-/g, ' '));
    const res = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${TMDB_API_KEY}&query=${q}`, { next: { revalidate: 604800 } });
    if (!res.ok) { keywordIdCache.set(niche, null); return null; }
    const data = await res.json();
    const id = data.results?.[0]?.id ?? null;
    keywordIdCache.set(niche, id);
    return id;
  } catch { keywordIdCache.set(niche, null); return null; }
}

const nicheCache = new Map<string, string[]>();
async function getNichesForMovie(tmdbId: string): Promise<string[]> {
  if (!TMDB_API_KEY || !/^\d+$/.test(tmdbId)) return [];
  const cached = nicheCache.get(tmdbId);
  if (cached) return cached;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/keywords?api_key=${TMDB_API_KEY}`, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    const niches = nichesForKeywords((data.keywords || []).map((k: any) => k.name));
    nicheCache.set(tmdbId, niches);
    return niches;
  } catch { return []; }
}

// Recommendation score — TASTE-FORMULA.md §4. Niches weigh double: that's
// where individuality lives. Hard negative gate kills anything the user
// actively rejected.
function scoreMovieForUser(movie: MovieContext, aff: Record<string, number>, ignoreGate: boolean = false): number {
  let s = 0;
  (movie._genreIds || []).forEach((g, idx) => {
    const a = aff[g.toString()] || 0;
    if (!ignoreGate && a <= -4) { s = -Infinity; return; }
    const idf = GENRE_IDF[g.toString()] ?? 1;
    s += a * (idx === 0 ? 1 : 0.5) * idf;
  });
  if (s === -Infinity) return s;
  (movie._niches || []).forEach(n => { s += (aff[nicheKey(n)] || 0) * 2; });
  s += ((movie.rating || 7) - 7) * 0.3; // quality nudge
  return s;
}

// Top taste axes in Hebrew/English for personalized paywall copy.
function topTasteAxes(aff: Record<string, number>, locale: string, n: number = 3): string[] {
  const entries = Object.entries(aff)
    .filter(([k, v]) => k !== 'General' && v >= 2)
    .sort((a, b) => b[1] - a[1]);
  const names: string[] = [];
  for (const [k] of entries) {
    if (names.length >= n) break;
    if (isNicheKey(k)) {
      const niche = k.slice(2);
      names.push(locale === 'he' ? (NICHE_HE[niche] || niche) : niche.replace(/-/g, ' '));
    } else {
      const g = GENRE_MAP[parseInt(k, 10)];
      if (g) names.push(locale === 'he' ? g.name : (TMDB_GENRES_EN[k] || ''));
    }
  }
  return names.filter(Boolean);
}
const TMDB_GENRES_EN: Record<string, string> = {
  '28': 'Action', '12': 'Adventure', '16': 'Animation', '35': 'Comedy', '80': 'Crime',
  '18': 'Drama', '10751': 'Family', '14': 'Fantasy', '27': 'Horror', '9648': 'Mystery',
  '10749': 'Romance', '878': 'Sci-Fi', '53': 'Thriller'
};

// Genre informativeness (IDF): Action/Drama/Thriller tag nearly every blockbuster,
// so each occurrence carries little information about personal taste; Mystery,
// Animation, Romance or Fantasy on a movie is a much stronger taste statement.
// Without this, a fantasy lover who 5-stars fantasy-action blockbusters drifts
// into "Action" purely because Action is the most over-represented genre.
const GENRE_IDF: Record<string, number> = {
  '28': 0.85,   // Action — on almost everything
  '18': 0.9,    // Drama — ubiquitous
  '53': 0.9,    // Thriller — ubiquitous
  '80': 0.95,   // Crime
  '35': 0.95,   // Comedy
  '12': 1.05,   // Adventure
  '878': 1.05,  // Sci-Fi
  '27': 1.05,   // Horror
  '10751': 1.05,// Family
  '9648': 1.15, // Mystery — rare, highly informative
  '16': 1.1,    // Animation
  '10749': 1.1, // Romance
  '14': 1.1,    // Fantasy
};

// Latent-taste inference (the "serendipity" layer): a user who strongly likes BOTH
// Crime and Thriller — more than raw Action — is statistically a whodunit lover even
// if no pure Mystery title was ever shown. Surface that hidden axis so Mystery
// recommendations can reach them. 0.9× keeps the inferred signal just under the
// evidence that produced it (inference must never outrank observation).
function inferLatentAffinities(aff: Record<string, number>) {
  const crime = aff['80'] || 0, thriller = aff['53'] || 0, action = aff['28'] || 0;
  const minCT = Math.min(crime, thriller);
  if (minCT > action && minCT >= 4) {
    aff['9648'] = Math.max(aff['9648'] || 0, Math.max(crime, thriller) * 0.9);
  }
}

async function getTrailerForMovieId(tmdbId: string): Promise<string> {
  if (!TMDB_API_KEY || tmdbId.startsWith('fb')) return '';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}&language=en-US`, { next: { revalidate: 3600 } });
    if (!res.ok) return '';
    const data = await res.json();
    const trailer = data.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
    return trailer ? trailer.key : '';
  } catch(e) {
    return '';
  }
}

async function fetchMoviesFromTMDB(page: number, affinities: Record<string, number>, locale: string = 'he', disableRandomYear: boolean = false): Promise<MovieContext[]> {
  const POOL = fullBaselinePool(locale);
  if (!TMDB_API_KEY) return POOL;
  
  // 1. Analyze Affinities to dynamically build API query
  let likedGenres: string[] = [];
  let hatedGenres: string[] = [];
  
  Object.entries(affinities).forEach(([genreId, score]) => {
    if (genreId !== 'General' && !genreId.startsWith('k:')) {
      if (score >= 2) likedGenres.push(genreId);
      if (score <= -5) hatedGenres.push(genreId);
    }
  });
  // API-level exclusion is a blunt instrument: a horror lover who hates Comedy
  // would lose every horror-comedy and horror-mystery too (secondary tags).
  // Exclude only the 3 STRONGEST hates; the scoring gate handles the rest.
  hatedGenres = hatedGenres
    .sort((a, b) => (affinities[a] || 0) - (affinities[b] || 0))
    .slice(0, 3)
    .filter(g => !likedGenres.includes(g));

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
    if (!res.ok) return POOL;
    let data = await res.json();

    // A year+genre+vote_count-filtered discover query often has far fewer pages
    // than requested — TMDB returns an empty result set past total_pages, which
    // silently starved the live phase back to the 12-movie fallback pool.
    if ((!data.results || data.results.length === 0) && page > 1) {
      const retry = await fetch(url.replace(`page=${page}`, 'page=1'), { next: { revalidate: 0 } });
      if (retry.ok) data = await retry.json();
    }
    if (!data.results || data.results.length === 0) return POOL;

    return data.results.filter((m: any) => m.poster_path && m.overview).map((m: any) => {
      const mainGenreId = m.genre_ids && m.genre_ids.length > 0 ? m.genre_ids[0] : 28;
      const eggType = GENRE_MAP[mainGenreId]?.egg || 'oscar';
      return {
        id: m.id.toString(), title: m.title, originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
        rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}`, overview: m.overview,
        trailerId: '', easterEgg: { type: eggType }, _genreIds: m.genre_ids
      };
    });
  } catch (e) { return POOL; }
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const payload: AnswerPayload = await req.json();

    // Rate-limit per ip+session, not per ip: a 40-question quiz plus retries
    // legitimately needs ~60 requests, and shared IPs (households, offices,
    // campus NAT) would silently 429 each other's votes — eroding taste
    // signal with no visible error. 120/min per session is generous for one
    // human and still a hard wall for abuse.
    const rateKey = `${ip}:${payload.sessionId || 'anon'}`;
    if (!checkRateLimit(rateKey, 120, 60000)) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
    const currentConfidence = parseFloat(req.headers.get('x-current-confidence') || '0.01');
    const currentCount = parseInt(req.headers.get('x-history-count') || '0', 10);
    const locale = req.headers.get('x-locale') || 'he';
    let askedMovieIds: string[] = JSON.parse(req.headers.get('x-asked-ids') || '[]');
    let userAffinities: Record<string, number> = JSON.parse(req.headers.get('x-affinities') || '{}');

    if (payload.isInit) {
      // Start with iconic baseline movies to hook the user and establish initial strong signals.
      // Deterministic coverage order — see BASELINE_ORDER rationale.
      const sessionId = payload.sessionId || `session_${Date.now()}`;
      let selected = pickBaselineMovie(sessionId, askedMovieIds, locale);
      if (!selected) {
        const pool = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id));
        selected = pool.length > 0 ? pool[0] : fullBaselinePool(locale)[0];
      }
      if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
      selected._niches = await getNichesForMovie(selected.id);
      warmPoster(selected.posterUrl);
      // Do NOT pre-push the served movie into askedMovieIds: the answer handler
      // guards affinity updates with `!askedMovieIds.includes(movieId)` to block
      // double-counting, so a pre-pushed id made the user's FIRST vote — usually
      // their most enthusiastic — silently vanish from their taste profile.
      // The id is recorded when the answer arrives, which also keeps dedup intact.

      return NextResponse.json({
        sessionId: payload.sessionId || `session_${Date.now()}`,
        isComplete: false, confidenceScore: 0.01, historyCount: 0,
        askedMovieIds, userAffinities: {},
        currentVectorState: { possibleMoviesRemaining: 85432, leadingMicroGenres: [locale === 'en' ? 'Initializing global scan...' : 'מאתחל סריקה גלובלית...'] },
        currentQuestion: { id: `init_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected }
      }, { status: 200 });
    }

    // 👑 אלגוריתם התקדמות כירורגי ודינמי לחלוטין
    let confidenceBoost = 0.008;

    if (payload.movieId && !askedMovieIds.includes(payload.movieId)) {
      askedMovieIds.push(payload.movieId);
      if (typeof payload.answer === 'number') {
        const base = (payload.answer - 3); // -2..+2

        if (payload.answer === 5 || payload.answer === 1) {
          confidenceBoost = Math.random() * 0.015 + 0.045; // decisive: done in ~18-20 Qs
        } else if (payload.answer === 4 || payload.answer === 2) {
          confidenceBoost = 0.025;
        } else {
          confidenceBoost = 0.012; // neutral answers still converge by the hard cap
        }

        if (base !== 0) {
          userAffinities['General'] = (userAffinities['General'] || 0) + base;

          // Asymmetric amplification:
          //  - Love (×2) must clear the archetype detection threshold from a single
          //    strong vote — one 5★ is a real signal, not noise.
          //  - Hate (×3) is punished harder: a rejected genre should crater so it
          //    never resurfaces in recommendations (negative affinity).
          //  - Primary genre gets full weight, secondary genres half — a 5★ on
          //    The Dark Knight says "Action" much louder than "Thriller".
          if (payload.genreIds && payload.genreIds.length > 0) {
            const polarity = base > 0 ? 2 : 3;
            payload.genreIds.forEach((g, idx) => {
              const idf = GENRE_IDF[g.toString()] ?? 1;
              // Loving a movie endorses all its flavors (secondaries at half
              // weight). Hating a movie rejects what it primarily IS — its
              // secondary tags say nothing about the user's taste. A drama
              // lover who hates a comedy-drama hates the comedy, not drama;
              // punishing secondaries cratered exactly that drama signal.
              const positionWeight = idx === 0 ? 1 : (base > 0 ? 0.5 : 0);
              if (positionWeight === 0) return;
              const w = base * polarity * positionWeight * idf;
              userAffinities[g.toString()] = (userAffinities[g.toString()] || 0) + w;
            });
            inferLatentAffinities(userAffinities);
          }

          // Sub-genre layer (TASTE-FORMULA.md §2): each tagged niche moves at
          // 0.75 — rarer, self-selected signals; capped upstream at 4/movie.
          if (payload.niches && payload.niches.length > 0) {
            payload.niches.slice(0, 4).forEach(n => {
              const polarity = base > 0 ? 2 : 3;
              const w = base * polarity * 0.75;
              const key = nicheKey(n);
              userAffinities[key] = (userAffinities[key] || 0) + w;
            });
          }
        }
      }
    }

    const answeredCount = currentCount + 1;
    let newConfidence = Math.min(0.99, currentConfidence + confidenceBoost);
    // Completion gates — precision over speed: a few more questions for an exact
    // taste read beats a fast almost-right one. Floor of 15 guarantees the full
    // 12-movie baseline plus live-pool refinement; cap of 40 still kills churn.
    let isComplete = false;
    if (answeredCount >= 15) {
      if (answeredCount >= 18 && newConfidence >= CONFIDENCE_THRESHOLD) isComplete = true;
      else if (answeredCount >= 26 && newConfidence >= 0.85) isComplete = true;
      else if (answeredCount >= 40) isComplete = true; // Hard cap
    }

    let nextMovie = null;
    let finalMoviesResult = undefined;

    if (!isComplete) {
      if (currentCount < 11) {
        // Exploration phase: init + 11 = full 12-movie deterministic baseline —
        // every genre bucket measured at least once, key buckets twice (see BASELINE_ORDER).
        let selected = pickBaselineMovie(payload.sessionId || '', askedMovieIds, locale);
        if (!selected) {
          const remaining = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id));
          selected = remaining.length > 0 ? remaining[0] : fullBaselinePool(locale)[0];
        }
        if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
        selected._niches = await getNichesForMovie(selected.id);
      warmPoster(selected.posterUrl);
        nextMovie = { id: `q_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected };
      } else {
        // As confidence grows, we fetch from earlier pages (most popular) that match
        // the affinities. Capped at 10 — filtered discover queries rarely have more
        // pages, and requesting past total_pages returns an empty set.
        const maxPage = Math.min(10, Math.max(1, Math.floor(500 * (1 - newConfidence))));
        const randomPage = Math.floor(Math.random() * maxPage) + 1;
        // Same-title repeats (remakes, re-releases, sequels sharing a name) read
        // as duplicates to the user even when the TMDB ids differ — block both.
        const askedTitleSet = new Set((payload.askedTitles || []).map(t => t.trim().toLowerCase()));
        const notSeenBefore = (m: MovieContext) =>
          !askedMovieIds.includes(m.id) && !askedTitleSet.has(m.title.trim().toLowerCase());

        let availableMovies = await fetchMoviesFromTMDB(randomPage, userAffinities, locale);
        let filtered = availableMovies.filter(notSeenBefore);

        if (filtered.length === 0) {
          // Fallback to random page without strict filters if too narrow
          availableMovies = await fetchMoviesFromTMDB(Math.floor(Math.random() * 50) + 1, {}, locale);
          filtered = availableMovies.filter(notSeenBefore);
        }
        
        if (filtered.length === 0) filtered = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id));
        if (filtered.length === 0) { 
          isComplete = true; 
        }

        if (!isComplete) {
          const selected = filtered[Math.floor(Math.random() * filtered.length)];
          if (!selected.trailerId) selected.trailerId = await getTrailerForMovieId(selected.id);
          selected._niches = await getNichesForMovie(selected.id);
      warmPoster(selected.posterUrl);
          nextMovie = { id: `q_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected };
        }
      }
    } 
    
    if (isComplete) {
      // 👑 Fetch the absolute best matches based on highly liked genres (without year constraints)
      let bestMovies = await fetchMoviesFromTMDB(1, userAffinities, locale, true);
      let availableResults = bestMovies.filter(m => !askedMovieIds.includes(m.id));
      if (availableResults.length === 0) availableResults = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id)).slice(0, 8); 
      
      // TASTE-FORMULA.md §4: rank candidates by the FULL taste vector, not
      // popularity. Enrich the top candidates with their niches, score, and
      // pick top-2 + one serendipity gem (best-scoring from outside the top 5
      // popularity ranks — a movie they didn't know they wanted).
      let pool = availableResults.slice(0, 14);

      // Niche-direct injection (TASTE-FORMULA.md §7): when the user has strong
      // niche axes, pull candidates that CARRY those niches by construction —
      // an esoteric taste deserves esoteric movies, not generic genre-mates.
      const strongNiches = Object.entries(userAffinities)
        .filter(([k, v]) => isNicheKey(k) && v >= 4)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k]) => k.slice(2));
      if (strongNiches.length > 0) {
        const ids = (await Promise.all(strongNiches.map(keywordIdForNiche))).filter((x): x is number => x !== null);
        if (ids.length > 0) {
          try {
            const langParam = locale === 'en' ? 'en-US' : 'he-IL';
            const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&language=${langParam}&sort_by=popularity.desc&vote_count.gte=100&with_keywords=${ids.join('|')}&page=1`, { next: { revalidate: 0 } });
            if (res.ok) {
              const data = await res.json();
              const nicheTrue = (data.results || [])
                .filter((m: any) => m.poster_path && m.overview && !askedMovieIds.includes(m.id.toString()) && !pool.some(p => p.id === m.id.toString()))
                .slice(0, 10)
                .map((m: any) => ({
                  id: m.id.toString(), title: m.title,
                  originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
                  rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}`, overview: m.overview,
                  trailerId: '', easterEgg: { type: 'oscar' as const }, _genreIds: m.genre_ids
                }));
              pool = nicheTrue.concat(pool);
            }
          } catch { /* pool stays as-is */ }
        }
      }

      for (const m of pool) m._niches = await getNichesForMovie(m.id);
      let scored = pool
        .map(m => ({ m, s: scoreMovieForUser(m, userAffinities) }))
        .filter(x => Number.isFinite(x.s))
        .sort((a, b) => b.s - a.s);

      // Extreme haters can gate almost everything out. Never deliver fewer
      // than 3 recommendations — widen to an unfiltered popular pool and keep
      // the best non-gated survivors.
      if (scored.length < 3) {
        const wide = (await fetchMoviesFromTMDB(1, {}, locale, true))
          .filter(m => !askedMovieIds.includes(m.id) && !pool.some(p => p.id === m.id))
          .slice(0, 14);
        for (const m of wide) m._niches = await getNichesForMovie(m.id);
        pool = pool.concat(wide);
        scored = scored.concat(
          wide.map(m => ({ m, s: scoreMovieForUser(m, userAffinities) }))
            .filter(x => Number.isFinite(x.s))
        ).sort((a, b) => b.s - a.s);
      }
      const gem = scored.find(x => pool.indexOf(x.m) >= 5 && x !== scored[0] && x !== scored[1]);
      let picks = [scored[0], scored[1], gem || scored[2]].filter(Boolean);

      // All-hater fallback: someone who 1-stars everything gates out all of
      // cinema. Serve the LEAST-BAD three (gate-free scoring) — an honest
      // answer beats an empty screen.
      if (picks.length === 0 && pool.length > 0) {
        picks = pool
          .map(m => ({ m, s: scoreMovieForUser(m, userAffinities, true) }))
          .sort((a, b) => b.s - a.s)
          .slice(0, 3);
      }
      const sMax = picks[0]?.s ?? 1, sMin = scored[scored.length - 1]?.s ?? 0;
      const span = Math.max(1e-6, sMax - sMin);
      for (const p of picks) {
        if (!p.m.trailerId) p.m.trailerId = await getTrailerForMovieId(p.m.id);
        warmPoster(p.m.posterUrl);
      }
      finalMoviesResult = picks.map(p => ({
        id: `res_${p.m.id}`, title: p.m.title,
        // Real per-movie match: normalized score mapped to 84-99 — honest
        // variance instead of a constant fake 99.
        matchScore: Math.round(84 + 15 * Math.max(0, Math.min(1, (p.s - sMin) / span))),
        posterUrl: p.m.posterUrl, trailerId: p.m.trailerId, overview: p.m.overview
      }));
    }

    // 👑 Sales Psychology: Dramatic reduction in remaining movies to build massive FOMO
    const remainingMovies = isComplete ? 1 : Math.max(2, Math.floor(85432 * Math.pow(1 - newConfidence, 4.5)));
    
    let psychologicalMessage = locale === 'en' ? 'Catching your vibe...' : 'קולט את הווייב שלך...';
    if (isComplete) {
      const axes = topTasteAxes(userAffinities, locale);
      if (axes.length > 0) {
        psychologicalMessage = locale === 'en'
          ? `Your taste decoded: ${axes.join(' · ')}. Matches locked in.`
          : `הטעם שלך פוענח: ${axes.join(' · ')}. ההתאמות ננעלו.`;
      }
    }
    if (newConfidence > 0.8) psychologicalMessage = locale === 'en' ? 'Wow, you have a very specific taste. Only a few movies match...' : 'אוקיי, יש לך טעם ממש מיוחד. נשארו סרטים בודדים שיכולים להתאים...';
    else if (newConfidence > 0.5) psychologicalMessage = locale === 'en' ? 'Filtering out thousands of irrelevant movies...' : 'מעיף עכשיו אלפי סרטים שלא בכיוון שלך בכלל...';
    else if (newConfidence > 0.3) psychologicalMessage = locale === 'en' ? 'Starting to understand you...' : 'מתחיל להבין אותך...';

    // Generate proof token if complete
    let proofToken = null;
    if (isComplete) {
      const { signSessionState } = await import('@/lib/sessionToken');
      proofToken = signSessionState({
        sessionId: payload.sessionId || `session_${Date.now()}`,
        totalAnswers: currentCount + 1,
        affinities: userAffinities,
        completedAt: Date.now()
      });
    }

    // Display progress (TASTE-FORMULA / UX): the bar must climb smoothly to
    // 100 exactly at completion — never snap 60→100. Two honest racers:
    // confidence path (decisive users) and question-count path (neutral users).
    const progressPercent = isComplete
      ? 100
      : Math.min(99, Math.round(100 * Math.max(newConfidence / 0.97, answeredCount / 40)));

    return NextResponse.json({
      sessionId: payload.sessionId || `session_${Date.now()}`,
      isComplete, confidenceScore: isComplete ? 1.0 : newConfidence,
      progressPercent,
      historyCount: currentCount + 1, askedMovieIds, userAffinities, 
      currentVectorState: { possibleMoviesRemaining: remainingMovies, leadingMicroGenres: isComplete ? [psychologicalMessage, ...topTasteAxes(userAffinities, locale)] : [psychologicalMessage] },
      currentQuestion: isComplete ? null : nextMovie,
      finalMovies: finalMoviesResult,
      proofToken
    }, { status: 200 });

  } catch (error) {
    await sendTelegramAlert('🚨 <b>CineMind Error</b>\nCritical failure in next-question API.\n' + String(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}