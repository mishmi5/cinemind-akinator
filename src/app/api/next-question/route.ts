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
    if (genreId !== 'General') {
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
      askedMovieIds.push(selected.id);

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
          nextMovie = { id: `q_${Date.now()}`, text: await generateDynamicQuestion(selected.title, selected.overview, locale), movie: selected };
        }
      }
    } 
    
    if (isComplete) {
      // 👑 Fetch the absolute best matches based on highly liked genres (without year constraints)
      let bestMovies = await fetchMoviesFromTMDB(1, userAffinities, locale, true);
      let availableResults = bestMovies.filter(m => !askedMovieIds.includes(m.id));
      if (availableResults.length === 0) availableResults = fullBaselinePool(locale).filter(m => !askedMovieIds.includes(m.id)).slice(0, 8); 
      
      // Select Top 3 matches: two safest picks + one "hidden gem" from deeper in the
      // ranking (serendipity boost) — a niche title the user didn't know they wanted,
      // but which sits squarely inside their taste vector.
      const top3 = [availableResults[0], availableResults[1], availableResults[4] || availableResults[2]].filter(Boolean);
      for (const match of top3) {
        if (!match.trailerId) match.trailerId = await getTrailerForMovieId(match.id);
      }
      finalMoviesResult = top3.map(bestMatch => ({
        id: `res_${bestMatch.id}`, title: bestMatch.title, matchScore: 99, 
        posterUrl: bestMatch.posterUrl, trailerId: bestMatch.trailerId, overview: bestMatch.overview
      }));
    }

    // 👑 Sales Psychology: Dramatic reduction in remaining movies to build massive FOMO
    const remainingMovies = isComplete ? 1 : Math.max(2, Math.floor(85432 * Math.pow(1 - newConfidence, 4.5)));
    
    let psychologicalMessage = locale === 'en' ? 'Catching your vibe...' : 'קולט את הווייב שלך...';
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

    return NextResponse.json({
      sessionId: payload.sessionId || `session_${Date.now()}`,
      isComplete, confidenceScore: isComplete ? 1.0 : newConfidence,
      historyCount: currentCount + 1, askedMovieIds, userAffinities, 
      currentVectorState: { possibleMoviesRemaining: remainingMovies, leadingMicroGenres: [psychologicalMessage] },
      currentQuestion: isComplete ? null : nextMovie,
      finalMovies: finalMoviesResult,
      proofToken
    }, { status: 200 });

  } catch (error) {
    await sendTelegramAlert('🚨 <b>CineMind Error</b>\nCritical failure in next-question API.\n' + String(error));
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}