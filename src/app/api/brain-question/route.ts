import { NextResponse } from 'next/server';
import { brainStep, type BrainHistoryItem } from '@/lib/brain/tasteBrain';
import { brainBackend } from '@/lib/brain/model';
import { fetchCandidatePool, movieById, resolveByTitle, getTrailer, genreNames } from '@/lib/brain/tmdb';

// LLM "taste brain" quiz endpoint (Akinator-style). Mirrors /api/next-question's
// response contract so the existing client works by simply switching the URL.
// The brain reasons about taste at sub-genre resolution and decides each next
// question + the final recommendations; TMDB grounds every movie (no hallucination).

const MIN_Q = 6;
const MAX_Q = 30;

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
    const pool = await fetchCandidatePool(seen, locale, 25);

    // Ask the brain what to do next.
    const result = await brainStep({ history, pool, minQuestions: MIN_Q, maxQuestions: MAX_Q, mock });
    if (!result) {
      return NextResponse.json({ error: `taste brain unavailable (backend=${backend}, mock=${usingMock})` }, { status: 503 });
    }

    const sessionId = payload.sessionId || `brain_${Date.now()}`;
    const baseState = {
      sessionId,
      historyCount: history.length,
      ratedCount: history.length,
      askedMovieIds,
      userAffinities: {},
      ratingHistory: history,
      tasteSummary: result.tasteSummary,
      engine: 'brain',
    };

    if (result.phase === 'ask' && result.nextPickId) {
      const picked = pool.find(c => c.id === result.nextPickId);
      const movie = picked ? await movieById(picked.id, locale) : null;
      if (movie) {
        movie.trailerId = await getTrailer(movie.id);
        const progressPercent = Math.min(99, Math.round((result.confidence / 0.9) * 100));
        return NextResponse.json({
          ...baseState,
          isComplete: false,
          confidenceScore: result.confidence,
          progressPercent,
          currentVectorState: { possibleMoviesRemaining: Math.max(2, Math.round(50000 * (1 - result.confidence))), leadingMicroGenres: [result.tasteSummary] },
          currentQuestion: { id: `bq_${Date.now()}`, text: questionText(movie.title, locale), movie },
          finalMovies: undefined,
        }, { status: 200 });
      }
      // brain picked an id outside the pool, or resolution failed → fall through to finish
    }

    // phase === 'done' (or could not produce a question): ground the recommendations.
    // Each LLM-proposed title is validated against TMDB; if title search misses, fall
    // back to matching the live candidate pool by title so a real movie still surfaces.
    const groundRec = async (r: { title: string; year: string | null }) => {
      const byTitle = await resolveByTitle(r.title, r.year, locale);
      if (byTitle) return byTitle;
      const poolHit = pool.find(c => c.title.trim().toLowerCase() === r.title.trim().toLowerCase());
      return poolHit ? movieById(poolHit.id, locale) : null;
    };
    const resolved = (await Promise.all(
      (result.recommendations || []).map(groundRec)
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
      reason: result.recommendations?.[i]?.reason || '',
    }));

    return NextResponse.json({
      ...baseState,
      isComplete: true,
      confidenceScore: 1.0,
      progressPercent: 100,
      currentVectorState: { possibleMoviesRemaining: 1, leadingMicroGenres: [result.tasteSummary] },
      currentQuestion: null,
      finalMovies,
    }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Brain error: ' + String(error) }, { status: 500 });
  }
}
