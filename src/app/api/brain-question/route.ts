import { NextResponse } from 'next/server';
import { brainStep, brainRecommend, type BrainHistoryItem } from '@/lib/brain/tasteBrain';
import { brainBackend } from '@/lib/brain/model';
import { fetchCandidatePool, movieById, resolveByTitle, getTrailer, genreNames } from '@/lib/brain/tmdb';

// LLM "taste brain" quiz endpoint (Akinator-style). Mirrors /api/next-question's
// response contract so the existing client works by simply switching the URL.
// The brain reasons about taste at sub-genre resolution and decides each next
// question + the final recommendations; TMDB grounds every movie (no hallucination).

const MIN_Q = 8;        // never finish before this many ratings (enough taste coverage)
const MAX_Q = 22;       // hard cap — forced recommendations beyond this
const TARGET_CONF = 0.65; // the model's own confidence at which we stop and recommend

function questionText(title: string, locale: string): string {
  const he = [
    `כמה כוכבים תיתן ל"${title}"? (1 = שונא, 5 = אוהב)`,
    `"${title}" — בקטע שלך או פספוס מוחלט?`,
    `נתקלת ב"${title}". מה הדירוג שלך?`,
    `עד כמה "${title}" מדבר אליך?`,
  ];
  const en = [
    `How many stars for "${title}"? (1 = hate, 5 = love)`,
    `"${title}" — your thing or a total miss?`,
    `You run into "${title}". Your rating?`,
    `How much does "${title}" speak to you?`,
  ];
  const pool = locale === 'en' ? en : he;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const locale = req.headers.get('x-locale') || 'he';
    let askedMovieIds: string[] = JSON.parse(req.headers.get('x-asked-ids') || '[]');
    let recentIds: string[] = JSON.parse(req.headers.get('x-recent-ids') || '[]');
    // Rating history rides in the BODY, not a header — titles are non-ASCII (Hebrew)
    // and would break HTTP header (ByteString) encoding.
    let history: BrainHistoryItem[] = Array.isArray(payload.ratingHistory) ? payload.ratingHistory : [];

    const backend = brainBackend();
    const mock = req.headers.get('x-brain-mock') === '1' || process.env.BRAIN_MOCK === '1';
    const usingMock = mock;

    // ── Record the just-answered movie into the rating history (rated answers only;
    //    NOT_SEEN is an omitted item — it never enters taste reasoning). ──
    if (!payload.isInit && payload.movieId && typeof payload.answer === 'number') {
      if (!askedMovieIds.includes(payload.movieId)) askedMovieIds.push(payload.movieId);
      history = [...history, {
        title: payload.title || 'Unknown',
        year: payload.year || undefined,
        genres: genreNames(payload.genreIds || []),
        rating: payload.answer,
      }];
    } else if (!payload.isInit && payload.movieId && !askedMovieIds.includes(payload.movieId)) {
      askedMovieIds.push(payload.movieId); // NOT_SEEN: mark shown, no taste signal
    }

    const seen = Array.from(new Set([...askedMovieIds, ...recentIds]));
    // Keep the pool tight (12) — a shorter prompt means a faster, more reliable
    // structured response from a local model.
    const pool = await fetchCandidatePool(seen, locale, 12);

    const sessionIdEarly = payload.sessionId || `brain_${Date.now()}`;

    // OPENING question: with no ratings yet there's nothing for the brain to reason
    // about — don't waste a model call (it would just say "done"). Pick a strong,
    // recognizable opener straight from the real pool.
    if (history.length === 0) {
      const opener = pool[Math.floor(Math.random() * Math.min(5, pool.length))] || pool[0];
      const movie = opener ? await movieById(opener.id, locale) : null;
      if (movie) {
        movie.trailerId = await getTrailer(movie.id);
        return NextResponse.json({
          sessionId: sessionIdEarly, isComplete: false, confidenceScore: 0.02, progressPercent: 2,
          historyCount: 0, ratedCount: 0, askedMovieIds, userAffinities: {}, ratingHistory: history,
          tasteSummary: '', engine: 'brain',
          currentVectorState: { possibleMoviesRemaining: 50000, leadingMicroGenres: [locale === 'en' ? 'Booting taste brain…' : 'מפעיל את מוח-הטעם…'] },
          currentQuestion: { id: `bq_${Date.now()}`, text: questionText(movie.title, locale), movie },
          finalMovies: undefined,
        }, { status: 200 });
      }
    }

    // Ask the brain what to do next. At the hard cap, force a final recommendation.
    const atCap = history.length >= MAX_Q;
    const result = await brainStep({ history, pool, minQuestions: MIN_Q, maxQuestions: MAX_Q, mock, forceDone: atCap });
    if (!result) {
      return NextResponse.json({ error: `taste brain unavailable (backend=${backend}, mock=${usingMock})` }, { status: 503 });
    }

    const sessionId = payload.sessionId || `brain_${Date.now()}`;
    let tasteSummary = result.tasteSummary;
    const baseState = {
      sessionId, historyCount: history.length, ratedCount: history.length,
      askedMovieIds, userAffinities: {}, ratingHistory: history, engine: 'brain',
    };

    // Completion is driven by the model's OWN confidence (it knows the user) plus a
    // floor — not by waiting for it to volunteer phase="done". This converges the
    // quiz instead of letting it ramble.
    const done = atCap || (history.length >= MIN_Q && result.confidence >= TARGET_CONF);

    if (!done) {
      // Serve the next question — always a real pool movie, even if the model omitted
      // or mistyped the id (a missing id must NEVER be read as "quiz finished").
      const pickId = result.nextPickId != null ? String(result.nextPickId) : '';
      const picked = pool.find(c => c.id === pickId) || pool[Math.floor(Math.random() * pool.length)];
      const movie = picked ? await movieById(picked.id, locale) : null;
      if (movie) {
        movie.trailerId = await getTrailer(movie.id);
        const progressPercent = Math.min(99, Math.round((result.confidence / TARGET_CONF) * 100));
        return NextResponse.json({
          ...baseState, tasteSummary,
          isComplete: false, confidenceScore: result.confidence, progressPercent,
          currentVectorState: { possibleMoviesRemaining: Math.max(2, Math.round(50000 * (1 - result.confidence))), leadingMicroGenres: [tasteSummary] },
          currentQuestion: { id: `bq_${Date.now()}`, text: questionText(movie.title, locale), movie },
          finalMovies: undefined,
        }, { status: 200 });
      }
    }

    // DONE — generate the final picks with a DEDICATED recommendation call (clean
    // single-purpose prompt), which reliably commits to 3 movies. Fall back to any
    // recs the step already produced.
    const recPass = await brainRecommend(history, { mock });
    let recommendations = (recPass?.recommendations?.length ? recPass.recommendations : result.recommendations) || [];
    if (recPass?.tasteSummary) tasteSummary = recPass.tasteSummary;

    // Ground the recommendations against TMDB.
    // Each LLM-proposed title is validated against TMDB; if title search misses, fall
    // back to matching the live candidate pool by title so a real movie still surfaces.
    const groundRec = async (r: { title: string; year?: string | number | null }) => {
      const byTitle = await resolveByTitle(r.title, r.year != null ? String(r.year) : null, locale);
      if (byTitle) return byTitle;
      const poolHit = pool.find(c => c.title.trim().toLowerCase() === r.title.trim().toLowerCase());
      return poolHit ? movieById(poolHit.id, locale) : null;
    };
    const resolved = (await Promise.all(
      recommendations.map(groundRec)
    )).filter((m): m is NonNullable<typeof m> => !!m && !askedMovieIds.includes(m.id));

    // De-dupe and enrich top 3 with trailers.
    const uniq: typeof resolved = [];
    const seenRec = new Set<string>();
    for (const m of resolved) { if (!seenRec.has(m.id)) { seenRec.add(m.id); uniq.push(m); } }
    const picks = uniq.slice(0, 3);
    for (const p of picks) p.trailerId = await getTrailer(p.id);

    const finalMovies = picks.map((p, i) => ({
      id: `res_${p.id}`, title: p.title,
      matchScore: Math.round(99 - i * 4),
      posterUrl: p.posterUrl, trailerId: p.trailerId, overview: p.overview,
      _genreIds: p._genreIds,
      reason: recommendations[i]?.reason || '',
    }));

    return NextResponse.json({
      ...baseState, tasteSummary,
      isComplete: true,
      confidenceScore: 1.0,
      progressPercent: 100,
      currentVectorState: { possibleMoviesRemaining: 1, leadingMicroGenres: [tasteSummary] },
      currentQuestion: null,
      finalMovies,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Brain error: ' + String(error) }, { status: 500 });
  }
}
