'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Link } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';
import { CineMindLogo } from '@/components/Navbar';
import type { SessionState, AnswerType, MovieContext, EasterEggType } from '@/types';
import quizToasts from '@/data/quiz-toasts.json';
import posthog from 'posthog-js';
import RoastReveal from '@/components/roast/RoastReveal';
import { useAuth } from '@/context/AuthContext';

// The offline fallback film. Its title, synopsis and question used to sit here as Hebrew string
// literals, so an /en visitor met the very first card of the quiz in Hebrew. Everything a person
// reads now comes from the message catalogue, keyed by the TMDB id below.
type StartingMovie = Omit<MovieContext, 'title' | 'overview'>;

// Engine switch. The DETERMINISTIC sub-genre brain is now the DEFAULT for every user
// (surgical sub-genre resolution, adaptive length). Opt OUT to the legacy v12 formula
// with `?engine=formula` (or `?brain=0`); `?brain=mock` runs the brain's offline mock.
// All three endpoints share a response shape, so the rest of the UI is identical.
function getEngine(): { url: string; brainHeaders: Record<string, string>; isBrain: boolean } {
  const FORMULA = { url: '/api/next-question', brainHeaders: {}, isBrain: false };
  // brainHeaders is cast because the ternary widens to a union of two object literals, which is
  // not assignable to Record<string, string> — that mismatch was failing `tsc` / `next build`.
  const BRAIN = (mock = false) => ({ url: '/api/brain-question', brainHeaders: (mock ? { 'x-brain-mock': '1' } : {}) as Record<string, string>, isBrain: true });
  if (typeof window === 'undefined') return BRAIN();
  const params = new URLSearchParams(window.location.search);
  const engine = params.get('engine');
  const b = params.get('brain');
  if (engine === 'formula' || b === '0') return FORMULA;
  return BRAIN(b === 'mock');
}

// Hermetic fallback component — transient network blips get ONE retry with a
// cache-buster before surrendering to the CSS placeholder. A single dropped
// packet must not blank the poster for the whole question.
const ImageWithFallback = ({ src, alt, className }: { src: string, alt: string, className: string }) => {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(false);
    setAttempt(0);
  }, [src]);

  const handleError = () => {
    if (attempt < 1) {
      setTimeout(() => setAttempt(a => a + 1), 1200);
    } else {
      setError(true);
    }
  };

  if (error || !src) {
    return (
      <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-zinc-800 to-zinc-950 ${className.replace('opacity-90', '').replace('opacity-80', '')}`}>
        <svg className="w-16 h-16 text-zinc-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16M3 8h4m-4 8h4M17 8h4m-4 8h4M14 4H10v16h4V4z" />
        </svg>
        <span className="text-zinc-400 font-black tracking-[0.3em] text-xs uppercase">CineMind</span>
      </div>
    );
  }
  
  const effectiveSrc = attempt > 0 ? `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}` : src;
  return <img key={effectiveSrc} src={effectiveSrc} alt={alt} className={className} onError={handleError} />;
};

const STARTING_POOL: StartingMovie[] = [
  { id: "155", originalDetails: "The Dark Knight · 2008", rating: 9.0, posterUrl: "/api/poster?path=/3KAtr9OX8Bq2FAvZtrjYcdUuBYp.jpg", trailerId: "EXeTwQWrcwY", easterEgg: { type: 'oscar' }, _genreIds: [28, 80] },
  { id: "27205", originalDetails: "Inception · 2010", rating: 8.8, posterUrl: "/api/poster?path=/nPO8aNT4uGtDAY0bZZZACfP66Lo.jpg", trailerId: "YoHD9XEInc0", easterEgg: { type: 'oscar' }, _genreIds: [28, 878] },
  { id: "680", originalDetails: "Pulp Fiction · 1994", rating: 8.9, posterUrl: "/api/poster?path=/hBS14aC5tyUasDhMGy0ihvp8hTB.jpg", trailerId: "s7EdQ4FqbhY", easterEgg: { type: 'wazzap' }, _genreIds: [80] },
  { id: "348", originalDetails: "Alien · 1979", rating: 8.5, posterUrl: "/api/poster?path=/odmhIedIOFZXj98yLcXRBl5UrNq.jpg", trailerId: "LjLamj-b0I8", easterEgg: { type: 'blood' }, _genreIds: [27, 878] },
  { id: "603", originalDetails: "The Matrix · 1999", rating: 8.7, posterUrl: "/api/poster?path=/xC1MsxS9wJ3EcBjIRJv8PkhFtzJ.jpg", trailerId: "vKQi3bBA1y8", easterEgg: { type: 'matrix' }, _genreIds: [878, 28] },
  { id: "98", originalDetails: "Gladiator · 2000", rating: 8.2, posterUrl: "/api/poster?path=/zJjf7dAIBBHsJjK6L38D3bzOWek.jpg", trailerId: "owK1qxDselE", easterEgg: { type: 'oscar' }, _genreIds: [28, 12] },
  { id: "157336", originalDetails: "Interstellar · 2014", rating: 8.6, posterUrl: "/api/poster?path=/9W7qYnmi1W3648YXVJvpjk82MUf.jpg", trailerId: "zSWdZVtXT7E", easterEgg: { type: 'oscar' }, _genreIds: [878, 12] },
  { id: "4232", originalDetails: "Scream · 1996", rating: 8.4, posterUrl: "/api/poster?path=/lr9ZIrmuwVmZhpZuTCW8D9g0ZJe.jpg", trailerId: "AWm_mkbdpCA", easterEgg: { type: 'wazzap' }, _genreIds: [27] },
  { id: "22970", originalDetails: "The Cabin in the Woods · 2011", rating: 8.0, posterUrl: "/api/poster?path=/zZZe5wn0udlhMtdlDjN4NB72R6e.jpg", trailerId: "NsIilFNNmkY", easterEgg: { type: 'blood' }, _genreIds: [27, 35] },
  { id: "11036", originalDetails: "The Notebook · 2004", rating: 8.0, posterUrl: "/api/poster?path=/s4kMNZZwJ0LXnR6iHpDMfuehhHe.jpg", trailerId: "FC6biTjEyZw", easterEgg: { type: 'oscar' }, _genreIds: [10749, 18] },
  { id: "862", originalDetails: "Toy Story · 1995", rating: 8.3, posterUrl: "/api/poster?path=/oLII3pJFSfeLFDKCZbaUIAXEqqz.jpg", trailerId: "v-PjgYDrg70", easterEgg: { type: 'oscar' }, _genreIds: [16, 10751, 35] }
];

// The in-progress quiz, so a refresh resumes instead of wiping twenty answered questions.
const RESUME_KEY = 'cinemind_active_session';

// Neither quiz request had a deadline, and a hung connection does not fail — it waits. On the
// first question that left a pulsing logo on screen with nothing behind it and no way back; in
// the middle of a quiz it swallowed the answer, because the promise that would have shown the
// error never settled. Six seconds is the point past which a visitor has already decided the
// product is broken. Init falls back to the local pool, mid-quiz surfaces the retry toast.
const QUIZ_FETCH_TIMEOUT_MS = 6000;
// THE LAST REQUEST IS NOT A QUESTION. Six seconds is right for "give me the next film", which the
// server answers in 2-200ms. It is wrong for the closing request, which is where the three films are
// chosen AND their Hebrew reasons are written by the language model: measured 5159ms for a forced
// finish on an idle machine, 6228ms letting a quiz end naturally at 40 answers, and 6205/8386/10480/
// 12919ms with four quizzes running at once. So the one request the whole quiz exists for was the
// one being aborted — and an AbortSignal rejection throws past the retry loop, landing in the catch
// that says "התשובה לא נשלחה — כנראה החיבור" with the same film still on screen. The person rated
// twenty films and was told their connection failed. A single visitor was already enough to hit it.
const FINISH_FETCH_TIMEOUT_MS = 45000;

const SOUNDS = {
  // Dead Google Sounds API removed to prevent CORB / Uncaught promise errors
};

// The running commentary under the stars. It was four Hebrew literals, so an /en visitor was
// coached in Hebrew from their second answer on; the translator is passed in because this runs
// outside the component.
const getDynamicPhrase = (count: number, t: (key: string) => string) => {
  if (count < 2) return null;
  if (count <= 3) return t('coach_pattern');
  if (count <= 5) return t('coach_narrowing');
  if (count <= 7) return t('coach_almost');
  return t('coach_final');
};

export default function ScanMovieEvaluation() {
  const locale = useLocale();
  const t = useTranslations('Scan');
  const tNav = useTranslations('Navigation');
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(false);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [activeTrailer, setActiveTrailer] = useState<string | null>(null);
  const trailerCloseRef = useRef<HTMLButtonElement | null>(null);
  const trailerDialogRef = useRef<HTMLDivElement | null>(null);
  const [combo, setCombo] = useState(0);
  const [animateCard, setAnimateCard] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [historyState, setHistoryState] = useState<SessionState[]>([]);
  const [activeToast, setActiveToast] = useState<{ text: string, emoji: string } | null>(null);
  const [activeEffect, setActiveEffect] = useState<EasterEggType | null>(null);
  // Frozen layouts for the celebration overlays. These used to call Math.random() inline in
  // the JSX, so every unrelated re-render (a hover, a state tick) reshuffled the confetti and
  // matrix glyphs mid-animation. Generated once per effect activation instead.
  const oscarBits = useMemo(
    () => Array.from({ length: 30 }, () => ({ left: Math.random() * 100, delay: Math.random() * 0.3 })),
    [activeEffect],
  );
  const matrixBits = useMemo(
    () => Array.from({ length: 80 }, () => ({
      left: Math.random() * 100, top: Math.random() * 100,
      text: Math.random().toString(36).substring(2, 10),
    })),
    [activeEffect],
  );
  // THE THREE FILMS ARE FREE. That is the decision behind the founder plan: with no brand and no
  // reviews, the quiz result IS the proof, and blurring it is the one thing guaranteed to stop
  // anyone paying. The founder offer sits under the films as an upsell, not in front of them.
  const [isRevealed] = useState(true);
  const [showSocialProof, setShowSocialProof] = useState(false);
  const [finishOfferDismissed, setFinishOfferDismissed] = useState(false);
  // Families the user pointed at after the quiz kept missing. Round-trips on every request.
  const [directions, setDirections] = useState<string[]>([]);
  const [directionsDismissed, setDirectionsDismissed] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  // Titles shown this session — sent to the server so same-title movies
  // (remakes, re-releases) are never served twice in one quiz.
  const seenTitlesRef = useRef<string[]>([]);
  // Rolling window of movie ids served across recent quizzes — sent to the server so
  // a new quiz doesn't repeat the last one's movies (cross-quiz variety).
  const recentRef = useRef<string[]>([]);
  const maxProgressRef = useRef(0);
  // The row the user answers with. Sizing alone cannot guarantee it is on screen — a 1280x720
  // laptop viewport still ends 100px short of it — so whenever a new film arrives we make sure
  // the controls are actually visible instead of trusting the layout math.
  const answerRowRef = useRef<HTMLDivElement | null>(null);
  // Was the last answer given with a keyboard? Decides whether focus is restored after the card
  // swaps — see the effect below.
  const keyboardRef = useRef(false);

  // E2E probe: mirror the FULL live session to window so the persona swarms can read the
  // served question (currentQuestion), the final picks (finalMovies) and the rated clock
  // (ratedCount — the NOT_SEEN omitted-item invariant). Cheap, test-only, no UI impact.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).__cinemind_session = session
      ? {
          ...session,
          ratedCount: session.ratedCount ?? session.historyCount,
          progressPercent: session.progressPercent ?? 0,
          genreObs: session.genreObs || {},
        }
      : null;
  }, [session]);

  useEffect(() => {
    Object.keys(SOUNDS).forEach(key => {
      const audio = new Audio(SOUNDS[key as keyof typeof SOUNDS]);
      audio.preload = "auto";
      audioRefs.current[key] = audio;
    });

    const localAsked = JSON.parse(localStorage.getItem('cinemind_asked_movies') || '[]');
    // Cross-quiz variety: movies shown in recent quizzes, excluded so each new quiz
    // feels fresh (TASTE-FORMULA.md §11). Rolling window in localStorage.
    recentRef.current = JSON.parse(localStorage.getItem('cinemind_recent_movies') || '[]');

    // RESUME AN INTERRUPTED QUIZ. A refresh (or an accidental back-navigation) used to throw
    // away twenty answered questions and start from zero, which is the most expensive thing this
    // product can do to someone who already invested the time. The whole session state is a
    // plain JSON object that round-trips to the server on every answer, so keeping the last one
    // in localStorage is enough to carry on exactly where they were.
    const resume = () => {
      try {
        const raw = localStorage.getItem(RESUME_KEY);
        if (!raw) return false;
        const saved = JSON.parse(raw) as { at: number; locale?: string; state: SessionState };
        // A day-old quiz is not worth resuming — the user has moved on.
        if (!saved?.state || !saved.state.currentQuestion || Date.now() - saved.at > 864e5) return false;
        if (saved.state.isComplete) return false;
        // The films, their synopses and the question text are all fetched in the language the quiz
        // started in, and they live inside this snapshot. Resuming it after the visitor switched
        // language handed an English reader a Hebrew title, a Hebrew synopsis and a Hebrew question
        // on an otherwise English page — seen in the browser. Snapshots written before this field
        // existed carry no locale, so they are treated as the default language rather than dropped.
        if ((saved.locale || 'he') !== locale) return false;
        setSession(saved.state);
        return true;
      } catch { return false; }
    };
    if (resume()) return;

    const initSession = async () => {
      try {
        const eng = getEngine();
        const res = await fetch(eng.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-asked-ids': JSON.stringify(localAsked),
            'x-recent-ids': JSON.stringify(recentRef.current),
            'x-locale': locale,
            ...eng.brainHeaders,
          },
          body: JSON.stringify({ sessionId: `session_${Date.now()}`, isInit: true }),
          signal: AbortSignal.timeout(QUIZ_FETCH_TIMEOUT_MS),
        });
        if (res.ok) {
          const data: SessionState = await res.json();
          const newHistory = [...localAsked, ...(data.askedMovieIds || [])].slice(-20);
          localStorage.setItem('cinemind_asked_movies', JSON.stringify(newHistory));
          setSession(data);
        } else {
          loadLocalFallback(localAsked);
        }
      } catch (e) { loadLocalFallback(localAsked); }
    };
    
    initSession();
  }, []);

  // Persist the live session so a refresh resumes instead of restarting. Cleared the moment the
  // quiz completes, so the next visit starts fresh rather than reopening the results.
  useEffect(() => {
    if (!session) return;
    try {
      if (session.isComplete) localStorage.removeItem(RESUME_KEY);
      else localStorage.setItem(RESUME_KEY, JSON.stringify({ at: Date.now(), locale, state: session }));
    } catch { /* private mode / quota — resuming is a bonus, never a hard dependency */ }
  }, [session]);

  // KEEP THE ANSWER CONTROLS ON SCREEN. Every viewport that pushed the star row below the fold
  // turned a rating click into a click on the poster: nothing happened, no request was sent, and
  // the film just sat there. Shrinking the card fixed the phone, but a 1280x720 laptop still ends
  // ~100px above the stars, and no fixed size survives every window. So after each new film, if
  // the row is not fully visible, bring it into view.
  useEffect(() => {
    if (!session || session.isComplete) return;
    const el = answerRowRef.current;
    if (!el) return;
    const id = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight) el.scrollIntoView({ block: 'end', behavior: 'smooth' });
      // AND KEEP THE KEYBOARD WHERE IT WAS. Answering re-renders the card, which drops focus to
      // <body> — so someone using a keyboard had to tab from the top of the page again for every
      // single film. Twenty films, twenty journeys through the nav. Focus returns to the rating
      // row, but only for the person who was already using the keyboard: moving it for a mouse or
      // touch user would yank the page around for no reason.
      if (keyboardRef.current && document.activeElement === document.body) {
        el.querySelector<HTMLButtonElement>('.stars-container button')?.focus();
      }
    }, 350);
    return () => clearTimeout(id);
  }, [session?.currentQuestion?.id, session?.isComplete]);

  // Keep the local AI (gemma2:9b) loaded the whole time the user is on the quiz: ping the
  // warm endpoint on mount and every 4 min so the model stays resident in VRAM (keep_alive:-1)
  // — the AI taste-director + reasons are then instant. Brain engine only; fire-and-forget.
  useEffect(() => {
    if (getEngine().url !== '/api/brain-question') return;
    const warm = () => { fetch('/api/brain-warm').catch(() => {}); };
    warm();
    const id = setInterval(warm, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const loadLocalFallback = (localAsked: string[]) => {
    let availableStarts = STARTING_POOL.filter(m => !localAsked.includes(m.id));
    if (availableStarts.length === 0) availableStarts = STARTING_POOL; 
    const randomStart = availableStarts[Math.floor(Math.random() * availableStarts.length)];
    const movie: MovieContext = {
      ...randomStart,
      title: t(`fallback.${randomStart.id}.title`),
      overview: t(`fallback.${randomStart.id}.overview`),
    };
    setSession({
      sessionId: `session_${Date.now()}`, isComplete: false, confidenceScore: 0.01, historyCount: 0,
      askedMovieIds: [randomStart.id], currentVectorState: { possibleMoviesRemaining: 15000, leadingMicroGenres: [] },
      currentQuestion: { id: `init_${Date.now()}`, text: t(`fallback.${randomStart.id}.question`), movie },
      userAffinities: {}
    });
  };

  const showToast = (messages: string[], emoji: string) => {
    const text = messages[Math.floor(Math.random() * messages.length)];
    setActiveToast({ text, emoji });
    setTimeout(() => setActiveToast(null), 4000);
  };

  const handleStarClick = (star: AnswerType) => {
    if (!session || !session.currentQuestion || session.isComplete || loading) return;

    if (star === 5) {
      // A five-star answer throws a full-screen effect: falling Oscars, a blood splatter, Matrix
      // rain. Someone who has asked their operating system for reduced motion has told us that
      // this makes them ill, and the CSS can only flatten the animation — the overlay would still
      // sweep the screen. For them the effect simply does not fire; the toast still does, so the
      // answer is still acknowledged.
      const wantsCalm = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const effects: EasterEggType[] = ['oscar', 'blood', 'wazzap', 'matrix'];
      if (!wantsCalm) setActiveEffect(effects[Math.floor(Math.random() * effects.length)]);
      
      showToast(quizToasts.fiveStarToasts, '✨');
      
      try {
        const audioEl = document.getElementById(`audio-${activeEffect}`) as HTMLAudioElement;
        if (audioEl) {
          audioEl.currentTime = 0;
          audioEl.volume = 0.8;
          audioEl.play().catch(e => console.warn("Audio play blocked", e));
        }
      } catch (e) {}
      setTimeout(() => setActiveEffect(null), 2000);
    } else if (star === 4) {
      showToast(quizToasts.fourStarToasts, '😏');
    } else if (star === 3) {
      showToast(quizToasts.threeStarToasts, '🤷');
    } else if (star === 2) {
      showToast(quizToasts.twoStarToasts, '😐');
    } else if (star === 1) {
      showToast(quizToasts.oneStarToasts, '💩');
    }
    
    submitAnswer(star);
  };

  // overrideDirections: a direction chosen THIS turn has not reached state yet, so it is passed
  // straight through — otherwise the request that is supposed to act on the choice still carries
  // the old (empty) list and the user watches one more wrong film go by.
  const submitAnswer = async (answer: AnswerType, finishNow = false, overrideDirections?: string[]) => {
    setLoading(true);
    setAnimateCard(true);

    // Snapshot the current state so the "back" button has somewhere to return to.
    setHistoryState(prev => [...prev, session!]);
    const currentTitle = session!.currentQuestion?.movie?.title;
    if (currentTitle && !seenTitlesRef.current.includes(currentTitle)) {
      seenTitlesRef.current.push(currentTitle);
    }
    // Record the answered movie into the cross-quiz recent window (rolling, cap 150).
    const answeredId = session!.currentQuestion?.movie?.id;
    if (answeredId && !recentRef.current.includes(answeredId)) {
      recentRef.current = [...recentRef.current, answeredId].slice(-150);
      try { localStorage.setItem('cinemind_recent_movies', JSON.stringify(recentRef.current)); } catch {}
    }

    try {
      const eng = getEngine();
      const yearMatch = (session!.currentQuestion!.movie?.originalDetails || '').match(/(\d{4})/);
      const doFetch = () => fetch(eng.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-current-confidence': session!.confidenceScore.toString(),
          'x-history-count': session!.historyCount.toString(),
          // Rated clock + Fisher info + genre exposure tally round-trip the
          // server's stateless taste estimate (NOT_SEEN never advances the clock).
          'x-rated-count': (session!.ratedCount ?? session!.historyCount).toString(),
          'x-info': (session!.infoSum ?? 0).toString(),
          'x-genre-obs': JSON.stringify(session!.genreObs || {}),
          'x-niche-obs': JSON.stringify(session!.nicheObs || {}),
          'x-recent-ids': JSON.stringify(recentRef.current),
          'x-genre-stats': JSON.stringify(session!.genreStats || {}),
          'x-asked-ids': JSON.stringify(session!.askedMovieIds),
          'x-affinities': JSON.stringify(session!.userAffinities || {}),
          'x-locale': locale,
          ...eng.brainHeaders,
        },
        body: JSON.stringify({
          sessionId: session!.sessionId, questionId: session!.currentQuestion!.id,
          answer, movieId: session!.currentQuestion!.movie?.id,
          genreIds: session!.currentQuestion!.movie?._genreIds || [],
          niches: session!.currentQuestion!.movie?._niches || [],
          // Brain engine round-trips the rating history + title/year in the BODY
          // (Hebrew titles can't go in headers). Harmless for the formula engine.
          ratingHistory: session!.ratingHistory || [],
          searchHint: (session as any)!.searchHint || '',
          probeScores: (session as any)!.probeScores || {},
          notSeen: (session as any)!.notSeen || 0, // session-scoped shown-cap counter (round-trips)
          skipYears: (session as any)!.skipYears || [], // years of films they had not seen — era steering
          finishNow, // user pressed "enough, recommend now" — finish on this response
          directions: overrideDirections ?? directions, // families they pointed at after we kept missing
          title: session!.currentQuestion!.movie?.title,
          year: yearMatch ? yearMatch[1] : undefined,
          // Same-title repeats (remakes/re-releases) feel like duplicates — let the
          // server exclude them. Body (not header) because Hebrew titles aren't
          // valid ISO-8859-1 header values.
          askedTitles: seenTitlesRef.current.slice(-60)
        }),
        // The closing request gets its own budget. The client cannot know for certain that this is
        // the last answer — the server decides — so it uses the long budget whenever finishing is
        // plausible: the user pressed "enough", or the engine has already said it could stop
        // (readyToFinish), or the meter is in the closing ramp. Everywhere else the short budget
        // stays, so a genuinely hung mid-quiz request still surfaces in six seconds.
        signal: AbortSignal.timeout(
          finishNow || session!.readyToFinish || (session!.confidenceScore ?? 0) >= 0.8
            ? FINISH_FETCH_TIMEOUT_MS
            : QUIZ_FETCH_TIMEOUT_MS,
        ),
      });

      let response = await doFetch();
      // A rate-limited or transiently failing request must NOT silently swallow
      // the user's vote — that erodes their taste profile without any feedback.
      // Back off briefly and retry up to twice before giving up.
      for (let attempt = 0; !response.ok && (response.status === 429 || response.status >= 500) && attempt < 2; attempt++) {
        await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
        response = await doFetch();
      }

      if (!response.ok) throw new Error('Failed');
      const newState: SessionState = await response.json();
      // Union with everything this session has already seen — after using "Back",
      // the restored (older) asked-list could let the server re-serve a movie the
      // user already answered. A movie must never appear twice in one quiz.
      newState.askedMovieIds = Array.from(new Set([...(session!.askedMovieIds || []), ...(newState.askedMovieIds || [])]));
      localStorage.setItem('cinemind_asked_movies', JSON.stringify(newState.askedMovieIds));
      
      // The cross-quiz window only remembered films we ASKED about, so the three we recommended
      // were free to come back as the recommendations of the next visit — a returning customer
      // saw a repeat. What we hand someone is exactly what they should not be handed again.
      if (newState.isComplete && Array.isArray(newState.finalMovies)) {
        const recIds = newState.finalMovies
          .map(m => String(m.id || '').replace(/^res_/, ''))
          .filter(id => id && !recentRef.current.includes(id));
        if (recIds.length) {
          recentRef.current = [...recentRef.current, ...recIds].slice(-150);
          try { localStorage.setItem('cinemind_recent_movies', JSON.stringify(recentRef.current)); } catch {}
        }
      }

      // EXPOSE STATE FOR E2E TESTING
      if (newState.isComplete) {
        (window as any).__cinemind_final_affinities = newState.userAffinities;
        (window as any).__cinemind_final_movies = newState.finalMovies || [];
      }

      if (newState.isComplete && user) {
        const token = await user.getIdToken();
        fetch('/api/user/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            tasteVector: {
              affinities: newState.userAffinities || {},
              confidenceScore: newState.confidenceScore,
              totalAnswers: newState.historyCount,
            },
            proofToken: (newState as any).proofToken
          }),
        }).catch(err => console.error("Bootstrap failed", err));
      }

      setTimeout(() => {
        setSession(newState);
        setHoveredStar(null);
        if (typeof answer === 'number' && answer >= 4) setCombo(prev => prev + 1); else setCombo(0);
        setAnimateCard(false); 
        setLoading(false);
      }, 300);
    } catch (error) {
      // The vote was swallowed: after two retries the star simply stopped glowing, the same film
      // stayed on screen, and nothing told the user their answer had not been recorded. They
      // clicked again into a dead control. Say what happened and let them retry.
      console.error('[scan] answer failed', error);
      // The answer never landed, so the snapshot pushed above is not a step the user took. Left
      // in place it duplicates the current question in the back stack, and "back" appears to do
      // nothing the first time it is pressed.
      setHistoryState(prev => prev.slice(0, -1));
      showToast([locale === 'he'
        ? 'התשובה לא נשלחה — כנראה החיבור. אפשר ללחוץ שוב על אותו דירוג.'
        : "That answer didn't reach us — probably the connection. Tap the same rating again."], '📡');
      setLoading(false);
      setAnimateCard(false);
    }
  };

  const handleBack = () => {
    if (historyState.length > 0) {
      const prevState = historyState[historyState.length - 1];
      setHistoryState(prev => prev.slice(0, -1));
      // Restore the previous question but KEEP the full asked-history — rolling
      // it back would let already-seen movies be served again.
      setSession({ ...prevState, askedMovieIds: session?.askedMovieIds || prevState.askedMovieIds });
      showToast(quizToasts.backButtonToasts, '🙄');
    }
  };

  // The one line that appears after the results is now a statement about how the picks were made,
  // not an invented "someone in Tel Aviv just found their film" — so it can simply show.
  useEffect(() => {
    if (!session?.isComplete) return;
    const t1 = setTimeout(() => {
      setShowSocialProof(true);
      setTimeout(() => setShowSocialProof(false), 5000);
    }, 7000);
    return () => clearTimeout(t1);
  }, [session?.isComplete]);

  // Trailer dialog behaviour: Escape closes it, focus moves into it and stays trapped,
  // focus returns to whatever opened it, and the page behind it stops scrolling.
  // Without this the modal was a div a keyboard user could tab straight past.
  useEffect(() => {
    if (!activeTrailer) return;
    const opener = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    trailerCloseRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setActiveTrailer(null);
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = trailerDialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], iframe, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = bodyOverflow;
      opener?.focus?.();
    };
  }, [activeTrailer]);

  if (!session) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse"><CineMindLogo className="w-20 h-20" /><div className="text-zinc-400 font-bold tracking-widest text-lg">{t('loading_db')}</div></div>
      </div>
    );
  }

  // Honest meter: follow the server's progressPercent DIRECTLY (it is already eased to ≤4%
  // per answer and is intentionally bidirectional — it rises on confirming answers and dips
  // on uncertain/contradicting ones). No monotonic max: a forced "never go back" would hide
  // those dips and also cause the jump-to-100.
  const confidencePercentage = Math.max(1, session.progressPercent ?? Math.round(session.confidenceScore * 100));
  const dynamicPhrase = getDynamicPhrase(session.historyCount, t);
  const he = locale === 'he';
  const trailerDialogLabel = he ? 'טריילר' : 'Trailer';
  const closeTrailerLabel = he ? 'סגירת הטריילר' : 'Close the trailer';
  const cardMovie = session.currentQuestion?.movie;
  // WHEN TO OFFER THE WAY OUT. Two signals of "this person has had enough", and never before the
  // engine says it could finish well — offering an exit that produces a poor recommendation would
  // trade an abandoned quiz for a wrong answer, which is worse. The simulated customers' patience
  // clusters at 20-26 questions, so 14 lands ahead of the wall rather than at it; the four-in-a-row
  // rejection test catches the people who tire much earlier than that.
  const answered = session.historyCount ?? 0;
  const recentRejects = (session.ratingHistory || []).slice(-3);
  // Ten, not fourteen. At fourteen the offer arrived after the people it was for had already
  // gone: eleven of the seventeen who still abandoned ran out of patience between questions 11
  // and 21, their limits sitting at 10-20. The offer is dismissible in one tap, so showing it a
  // few questions early to someone who would have kept going costs them a glance, while showing
  // it late costs the whole session.
  const tiring = answered >= 10 ||
    (recentRejects.length === 3 && recentRejects.every(h => typeof h.rating === 'number' && h.rating <= 2));
  const showFinishOffer = !session.isComplete && !finishOfferDismissed && !loading &&
    session.readyToFinish === true && answered >= 5 && tiring;
  // Finished because the user asked, before the engine reached its own certainty. The picks are
  // still from their confirmed shelf — it is the claim of completeness that has to be softened.
  const stoppedEarly = !!session.isComplete && confidencePercentage < 90;
  // WHEN THE QUIZ HAS CLEARLY MISSED, ASK. Nine of fifty simulated customers left at question five
  // or six after a run of films they did not care about — the cost of an opening that must offer
  // all nine families to avoid misreading a narrow taste. Three refusals in a row is the engine
  // admitting it is lost, and a person who is about to leave would rather point than keep rating.
  const lastThree = (session.ratingHistory || []).slice(-3);
  const missing = lastThree.length === 3 &&
    lastThree.every(h => typeof h.rating === 'number' && h.rating <= 2);
  const showDirections = !session.isComplete && !loading && missing &&
    directions.length === 0 && !directionsDismissed;
  const DIRECTIONS: { key: string; he: string; en: string; emoji: string }[] = [
    { key: 'horror', he: 'אימה', en: 'Horror', emoji: '👻' },
    { key: 'comedy', he: 'קומדיה', en: 'Comedy', emoji: '😂' },
    { key: 'action', he: 'אקשן', en: 'Action', emoji: '💥' },
    { key: 'drama', he: 'דרמה', en: 'Drama', emoji: '🎭' },
    { key: 'scifi', he: 'מדע בדיוני', en: 'Sci-fi', emoji: '🚀' },
    { key: 'crime', he: 'פשע ומתח', en: 'Crime & thriller', emoji: '🔎' },
    { key: 'fantasy', he: 'פנטזיה', en: 'Fantasy', emoji: '🐉' },
    { key: 'animation', he: 'אנימציה', en: 'Animation', emoji: '🎨' },
    { key: 'western', he: 'מערבונים', en: 'Westerns', emoji: '🤠' },
  ];
  const pickDirection = (key: string) => {
    const next = [key];
    setDirections(next);
    // Not a rating — they told us where to look, so the current film is simply skipped.
    submitAnswer('NOT_SEEN', false, next);
  };
  return (
    <div dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-h-screen bg-surface-0 text-white font-sans overflow-x-hidden pb-20 relative">

      {activeEffect === 'oscar' && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
          {oscarBits.map((bit, i) => (
            <div key={i} className="absolute text-7xl animate-[fall_1.5s_ease-in_forwards]" style={{ left: `${bit.left}vw`, animationDelay: `${bit.delay}s` }}>🏆</div>
          ))}
          <style>{`@keyframes fall { 0% { transform: translateY(-100px) rotate(0deg); } 100% { transform: translateY(100vh) rotate(360deg); } }`}</style>
        </div>
      )}
      {activeEffect === 'blood' && (
        <div className="fixed inset-0 z-[100] pointer-events-none bg-red-900/50 mix-blend-overlay">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle,rgba(220,38,38,0.9)_0%,transparent_80%)] animate-[ping_1s_ease-out_forwards]"></div>
        </div>
      )}
      {activeEffect === 'wazzap' && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="text-9xl font-black text-rose-500 transform -rotate-12 animate-bounce drop-shadow-[0_0_50px_rgba(225,29,72,1)] tracking-tighter">WAZZZAAAP?! 😜</div>
        </div>
      )}
      {activeEffect === 'matrix' && (
        <div className="fixed inset-0 z-[100] pointer-events-none bg-black/90 flex flex-col">
          {/* Iterate the generated array itself. This rendered 80 cells from a 50-cell array, so
              matrixBits[50] was undefined and reading .left threw — the whole quiz page went
              blank the moment the matrix celebration fired on a 5-star sci-fi rating. */}
          {matrixBits.map((bit, i) => (
            <div key={i} className="text-emerald-500 font-mono text-xl font-bold opacity-80 absolute" style={{ left: `${bit.left}vw`, top: `${bit.top}vh` }}>{bit.text}</div>
          ))}
        </div>
      )}

      {activeTrailer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg p-4 animate-in fade-in duration-300"
          onClick={() => setActiveTrailer(null)}
        >
          <div
            ref={trailerDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={trailerDialogLabel}
            className="relative w-full max-w-6xl aspect-video bg-black rounded-card overflow-hidden shadow-raise"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              ref={trailerCloseRef}
              onClick={() => setActiveTrailer(null)}
              aria-label={closeTrailerLabel}
              className="absolute top-6 end-6 z-10 px-6 py-3 bg-black/60 hover:bg-black/90 text-white rounded-full border border-white/20 transition-all font-bold"
            >
              <span aria-hidden="true">✕</span>
            </button>
            <iframe
              title={trailerDialogLabel}
              src={`https://www.youtube.com/embed/${activeTrailer}?autoplay=1&rel=0&modestbranding=1`}
              className="w-full h-full"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      )}

      {activeToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-6 py-4 bg-surface-2 border border-accent/50 rounded-control shadow-raise animate-in slide-in-from-bottom-5 fade-in duration-300 max-w-sm text-center">
          <span className="text-3xl mb-2 block">{activeToast.emoji}</span>
          <span className="text-rose-300 font-bold text-base leading-tight">{activeToast.text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')}</span>
        </div>
      )}

      <nav className="relative z-20 flex items-center justify-between px-8 py-5 border-b border-white/5 bg-surface-0">
        <Link href="/" className="text-2xl font-black tracking-tight flex items-center gap-2 hover:opacity-80 transition-opacity"><CineMindLogo className="w-8 h-8" />CineMind</Link>
        <div className="flex items-center gap-6 text-sm font-medium text-zinc-400"><Link href="/arena" className="hover:text-rose-400 font-bold transition-colors text-base">👾 {tNav('arena')}</Link><span className="text-zinc-400">{t('anonymous')}</span></div>
      </nav>

      <div className="w-full max-w-5xl mx-auto px-4 mt-4 md:mt-8 mb-2 md:mb-4 flex items-center justify-between">
        <div className="flex-1 bg-white/10 rounded-full h-2 relative overflow-hidden me-6">
          {/* start-anchored so the bar grows from the side the locale reads from: right in Hebrew,
              left in English (it used to be pinned to the physical right in both). */}
          <div className="absolute top-0 start-0 h-full bg-gradient-to-l from-accent-strong to-accent-soft transition-all duration-700" style={{ width: `${confidencePercentage}%` }}></div>
        </div>
        {/* Someone who stops early gets a real read, not a finished one, and the bar was still
            printing a bare "55%" beside a headline that said we had cracked them. A percentage is
            the right thing to show while the engine is still working toward its own certainty; at
            the end of a quiz the user chose to cut short, what it is based on is the honest
            number. */}
        <span className="text-rose-500 font-black text-sm">
          {stoppedEarly
            ? (he ? `על בסיס ${session.ratedCount ?? session.historyCount} תשובות` : `Based on ${session.ratedCount ?? session.historyCount} answers`)
            : `${confidencePercentage}%`}
        </span>
      </div>

      <div className="w-full max-w-5xl mx-auto px-4 mb-3 md:mb-6 flex justify-between items-center text-sm font-bold">
        {combo > 0 ? (
          <div className="text-accent font-black animate-bounce text-base">🔥 Combo {combo}</div>
        ) : <div />}
        <div className="text-zinc-400 flex items-center gap-2 text-base"><span>⚡</span> {t('brain_scan')}</div>
      </div>

      {/* px-4: the column had no horizontal padding, so on a phone the results headline and the
          cards under it ran into both edges of the screen. */}
      <div className="max-w-2xl mx-auto px-4 flex flex-col items-center">

        {session.isComplete ? (
          <div className="w-full mt-12 animate-in fade-in zoom-in duration-700">
            <div className="text-center mb-12">
              <span className="inline-block px-6 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full text-base font-bold mb-6">
                {stoppedEarly ? (he ? '🎬 עצרנו כאן לבקשתך' : '🎬 Stopped here, as you asked') : `✅ ${t('perfect_match')}`}
              </span>
              {/* A flat 60px headline is wider than a phone: "הנה מה שכבר קלטנו" overflowed the
                  viewport on the one screen the whole quiz was building up to. */}
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black mb-4">
                {stoppedEarly ? (he ? 'הנה מה שכבר קלטנו' : "Here's what we already read") : t('cracked_you')}
              </h1>
              <p className="text-zinc-400 text-xl">
                {stoppedEarly
                  ? (he ? 'שלושת אלה מגיעים מהטעם שזיהינו עד עכשיו. עוד כמה שאלות היו מחדדות אותו.'
                        : 'These three come from the taste we read so far. A few more answers would sharpen it.')
                  : t('perfect_movie_desc')}
              </p>
            </div>
            
            {session.finalMovies?.map((movie) => (
              <div key={movie.id} className="relative bg-surface-1 border border-white/10 rounded-card overflow-hidden shadow-raise flex flex-col items-center p-8 md:p-12 text-center mb-12 max-w-4xl mx-auto">
                
                {/* Blurred Content Container */}
                <div className={`transition-all duration-1000 ${isRevealed ? 'opacity-100 blur-none' : 'opacity-30 blur-[15px] select-none pointer-events-none'} w-full`}>
                  <div className="w-48 md:w-64 aspect-[2/3] mx-auto relative rounded-control overflow-hidden shadow-raise bg-surface-2 mb-8">
                    <ImageWithFallback src={movie.posterUrl} alt={movie.title} className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black mb-2 text-white" dir={locale === 'he' ? 'rtl' : 'ltr'}>
                    {isRevealed ? movie.title : `${movie.title.charAt(0)}_______`}
                  </h2>
                  {/* Which film, exactly. Every quiz card carries "ORIGINAL TITLE · YEAR" and the
                      results card carried the Hebrew name alone — but "הצלצול" is the 1998 Japanese
                      film or the 2002 American one, and this is the screen someone acts on tonight. */}
                  {isRevealed && (movie as { originalDetails?: string }).originalDetails && (
                    <p className="text-xs text-zinc-400 font-mono mb-4 uppercase tracking-[0.2em]" dir="ltr">
                      {(movie as { originalDetails?: string }).originalDetails}
                    </p>
                  )}
                  {/* "60% התאמה מושלמת" is a contradiction in three words, and it is exactly what
                      an early finish printed. A film picked from a shelf we are still reading is
                      described, not scored. */}
                  <div className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full text-sm font-bold mb-6">
                    {stoppedEarly
                      ? (he ? 'מהטעם שקראנו עד כה' : 'From the taste we read so far')
                      : `${movie.matchScore}% ${t('match_perfect')}`}
                  </div>
                  <p className="text-zinc-300 text-base leading-relaxed max-w-xl mx-auto">
                    {isRevealed ? movie.overview : t('hidden_overview')}
                  </p>
                  {/* WHY THIS FILM IS YOU — the actual payoff of the whole quiz. The engine
                      already writes this per pick (recReason, in the user's language) and it was
                      being computed and thrown away, leaving three posters and a generic synopsis
                      that look like any recommendation widget. */}
                  {isRevealed && (movie as { reason?: string }).reason && (
                    <p className="mt-5 mx-auto max-w-xl text-right rtl:text-right ltr:text-left text-rose-200/90 text-base leading-relaxed border-s-2 border-rose-500/50 ps-4">
                      {(movie as { reason?: string }).reason}
                    </p>
                  )}
                  {/* WHERE TO WATCH IT TONIGHT, IN ISRAEL. A pick nobody can act on is not a
                      recommendation — and the split Israeli catalogue (Netflix / Disney+ / HBO Max
                      via Cellcom / yes / HOT VOD) is the actual pain this product solves. */}
                  {isRevealed && (() => {
                    const w = (movie as { watch?: { stream: { name: string; logo: string }[]; rent: { name: string; logo: string }[]; link?: string } }).watch;
                    if (!w || (!w.stream.length && !w.rent.length)) return null;
                    const Row = ({ label, list }: { label: string; list: { name: string; logo: string }[] }) => (
                      list.length ? (
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                          <span className="text-xs text-zinc-400 font-bold">{label}</span>
                          {list.slice(0, 4).map(p => (
                            <span key={p.name} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg ps-1 pe-2 py-1">
                              <img src={p.logo} alt="" className="w-5 h-5 rounded" />
                              <span className="text-xs text-zinc-300">{p.name}</span>
                            </span>
                          ))}
                        </div>
                      ) : null
                    );
                    return (
                      <div className="mt-5 flex flex-col gap-2 items-center">
                        <Row label={locale === 'he' ? 'כלול במנוי:' : 'Included with:'} list={w.stream} />
                        <Row label={locale === 'he' ? 'להשכרה/קנייה:' : 'Rent or buy:'} list={w.rent} />
                      </div>
                    );
                  })()}
                </div>

                {/* Paywall Overlay */}
                {!isRevealed && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-t from-surface-0 via-surface-0/60 to-transparent p-4 sm:p-8">
                    <div className="bg-surface-2/95 backdrop-blur-3xl border border-accent/40 rounded-panel p-6 sm:p-10 max-w-lg w-full text-center shadow-raise animate-in slide-in-from-bottom-10 fade-in duration-700">
                      <div className="text-5xl mb-6">🤫</div>
                      <h4 className="text-3xl font-black text-white mb-4">{t('your_movie_waits')}</h4>
                      {/* Personalized hook: the user's MEASURED taste axes — real data
                          is the most persuasive sales copy there is. */}
                      {(session.currentVectorState?.leadingMicroGenres?.length ?? 0) > 1 && (
                        <div className="flex flex-wrap justify-center gap-2 mb-4">
                          {session.currentVectorState.leadingMicroGenres.slice(1, 4).map((axis) => (
                            <span key={axis} className="px-3 py-1 bg-indigo-500/15 border border-indigo-400/30 text-indigo-300 rounded-full text-sm font-bold">
                              {axis}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-zinc-400 mb-8 text-lg font-medium leading-relaxed">
                        {locale === 'he'
                          /* Round eight took the unqualified "your profile is saved" off the pricing
                             card, because sign-in is disabled and the profile lives in one browser.
                             The same claim was still here, on the screen where the sale actually
                             happens — a copy fix applied in one place and not the other. */
                          ? 'מסלול מייסד: ₪99 פעם אחת, גישה לכל החיים. פרופיל הטעם נשמר בדפדפן הזה, אפשר לעשות את החידון שוב מתי שרוצים, ומדי שבוע מגיע מייל עם סרט שמתאים לך. 200 מקומות.'
                          : 'Founder: ₪99 once, lifetime access. Your taste profile is saved in this browser, retake the quiz whenever you want, and a matching film lands in your inbox every week. 200 seats.'}
                      </p>

                      <div className="flex flex-col gap-4 w-full relative">
                        <Link
                          data-chat-avoid
                          href="/pricing"
                          onClick={() => posthog.capture('paywall_click_starter')}
                          className="w-full py-4 bg-accent-strong hover:bg-accent text-white rounded-control font-black text-xl transition-all shadow-accent hover:scale-[1.02] flex items-center justify-center gap-2"
                        >
                          {locale === 'he' ? 'קח מקום מייסד — ₪99' : 'Take a founder seat — ₪99'}
                        </Link>

                        <div className="text-xs text-zinc-400 px-2 text-center leading-relaxed">
                          {locale === 'he'
                            ? 'המחיר כולל מע״מ. כשה-200 ייגמרו המחיר עובר ל-₪19 לחודש, ומייסדים ממשיכים ב-₪0.'
                            : 'VAT included. Once the 200 seats are gone the price becomes ₪19/month; founders stay at ₪0.'}
                        </div>
                      </div>

                      <div className="mt-8 pt-6 border-t border-white/5">
                        <p className="text-zinc-400 text-sm">
                          {/* This used to be a button that simply set isRevealed — the paywall was
                              decorative and one click took the paid content for free. It is a link
                              to the real login now, and the reveal happens only for an entitled user. */}
                          {locale === 'he' ? 'כבר מייסד?' : 'Already a founder?'} <Link href="/login" className="text-rose-400 hover:text-rose-300 font-bold transition-colors underline underline-offset-4">{t('login_test')}</Link>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {isRevealed && movie.trailerId && (
                  <button onClick={() => setActiveTrailer(movie.trailerId)} className="mt-8 px-8 py-3 bg-accent-strong/90 hover:bg-accent text-white rounded-full flex items-center justify-center gap-2 font-bold transition-all hover:scale-105 z-30">
                    ▶ {t('watch_trailer')}
                  </button>
                )}
              </div>
            ))}
            
            {isRevealed && (
              <div className="mt-12 bg-gradient-to-r from-accent/10 to-indigo-500/10 border border-indigo-500/30 rounded-panel p-8 text-center max-w-3xl mx-auto relative overflow-hidden">
                <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-accent to-indigo-500"></div>
                <h3 className="text-2xl font-black mb-3 text-white">{t('liked_recommendation')}</h3>
                <p className="text-zinc-300 text-base mb-6 leading-relaxed">
                  {t('keep_enjoying')}
                </p>
                {/* The one glow left on this screen: it is the only thing here we are asking
                    anybody to press. */}
                <Link data-chat-avoid href="/pricing" className="inline-block px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-control font-bold transition-all shadow-[0_0_30px_rgba(99,102,241,0.35)] hover:scale-105 active:scale-95">
                  {t('upgrade_elite')}
                </Link>
              </div>
            )}
            
            <div className="mt-16 border-t border-zinc-800 pt-16 w-full">
              <RoastReveal />
            </div>

            {/* FOMO Social Proof Toast */}
            {showSocialProof && (
              <div className="fixed bottom-28 right-6 bg-surface-2/95 border border-white/10 shadow-raise p-4 rounded-control z-50 flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-500">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-ping relative">
                  <div className="absolute inset-0 bg-emerald-500 rounded-full opacity-50"></div>
                </div>
                <span className="text-white text-sm font-bold">{t('fomo_social_proof')}</span>
              </div>
            )}

          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            
            {/* aria-live: the card swaps in place, so without an announcement a screen-reader
                user rates the same silent card over and over. */}
            <div
              aria-live="polite"
              aria-atomic="true"
              className={`w-full bg-surface-1 border border-white/5 rounded-card overflow-hidden shadow-raise relative transition-all duration-300 ${animateCard ? 'opacity-0 -translate-x-10 scale-95' : 'opacity-100 translate-x-0 scale-100'}`}
            >

              {/* The answer controls must be on the first screen, on every screen. Fixed poster
                  heights kept pushing them off: 55vh put the star row at y=905 on a 390x844 phone,
                  42vh still landed it at y=824 on a 375x812 one, and the desktop md:h-[650px] put
                  it at y=1129 inside a 720px-tall laptop viewport — 409px below the fold, so a
                  click aimed at a star hit the poster and nothing happened. Both sizes are now
                  bounded by the viewport, so the poster shrinks before the controls leave. */}
              {/* The min-height is what breaks a SHORT screen: on an iPhone SE (375x667) the poster
                  sat at its 190px floor and pushed "didn't see it" to y=719, 52px past the bottom.
                  Viewport width was never the problem — height is. Below 700px tall the floor comes
                  down so the answer row stays reachable. */}
              <div className="relative w-full h-[30vh] min-h-[190px] max-h-[400px] [@media(max-height:700px)]:min-h-[140px] [@media(max-height:700px)]:h-[22vh] md:h-[46vh] md:min-h-[280px] md:max-h-[560px] bg-surface-2">
                <ImageWithFallback
                  src={cardMovie?.posterUrl || ''}
                  alt={cardMovie?.title ? (he ? `כרזת ${cardMovie.title}` : `${cardMovie.title} poster`) : ''}
                  className="absolute inset-0 w-full h-full object-cover object-top opacity-100" />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-1 via-transparent to-transparent"></div>
                {/* The same control as the one on the results card, which was rose while this one
                    was red — two reds for one action, on two screens of the same product. */}
                {cardMovie?.trailerId && (
                  <button onClick={() => setActiveTrailer(cardMovie?.trailerId || null)} className="absolute top-6 start-6 bg-accent-strong/90 text-white text-sm font-bold px-5 py-2.5 rounded-full flex items-center gap-2 backdrop-blur-md hover:bg-accent transition-colors z-10 shadow-lg">
                    ▶ {t('watch_trailer')}
                  </button>
                )}
                {/* The public score, not a control — it was the loudest orange on a screen whose
                    only accent is rose, and nothing happens when you press it. */}
                <div className="absolute bottom-6 end-6 bg-black/70 border border-white/15 backdrop-blur-md text-white text-base font-black px-4 py-1.5 rounded-xl flex items-center gap-1.5 z-10">
                  {/* TMDB hands back 6.661; one decimal is what a rating badge is meant to show. */}
                  {typeof cardMovie?.rating === 'number' ? cardMovie.rating.toFixed(1) : cardMovie?.rating} ★
                </div>
              </div>

              <div className="px-6 md:px-8 pb-5 md:pb-10 relative z-10 -mt-20 md:-mt-24 text-center">
                {/* A title that wraps to two lines costs 53px, which is the difference between the
                    "didn't see" row sitting at 806 and at 859 on a 375x812 phone — "סיפורי נרניה"
                    was the card that fell off. Slightly smaller on a phone, unchanged from sm up. */}
                {/* One line on a phone. A title that wraps costs 53px a line, and that is the
                    difference between the "didn't see" row sitting on the first screen and off it:
                    "מלחמת הכוכבים: פרק…" pushed it to 843 in an 812px viewport. Nothing is lost —
                    the full title is in the question sentence directly below, and the original
                    title sits under it. Unclamped from sm up, where there is room. */}
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-black mb-2 text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] truncate sm:whitespace-normal sm:overflow-visible">{cardMovie?.title}</h1>
                <p className="text-xs text-zinc-300 font-mono mb-5 uppercase tracking-[0.2em] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{session.currentQuestion?.movie?.originalDetails}</p>
                <p className="text-sm md:text-base text-zinc-200 leading-relaxed mb-4 md:mb-8 min-h-[2.5rem] md:min-h-[3rem] line-clamp-2 max-w-lg mx-auto drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-medium">{session.currentQuestion?.movie?.overview}</p>
                
                <div className="text-xl sm:text-2xl md:text-3xl font-black text-white bg-white/[0.04] py-4 px-6 md:py-6 md:px-8 rounded-3xl border border-white/10 shadow-inner flex items-center justify-center mx-2 min-h-[72px] [@media(max-height:700px)]:min-h-[56px] [@media(max-height:700px)]:py-2 md:min-h-[100px] leading-tight">
                  {session.currentQuestion?.text}
                </div>
              </div>
            </div>

            <div ref={answerRowRef} className={`w-full mt-5 md:mt-10 flex flex-col items-center transition-opacity duration-300 ${animateCard ? 'opacity-0' : 'opacity-100'}`}>
              
              {dynamicPhrase && (
                <div className="text-sm text-zinc-400 flex items-center gap-2 mb-3 md:mb-8 animate-in fade-in duration-500 font-medium">
                  <span className="text-rose-500 text-lg">✓</span> {dynamicPhrase}
                </div>
              )}

              {/* Labels above, not beside: five 56px stars plus gaps leave ~46px for two words on
                  a 360px phone, and "אוהב" was measured at x=-35 — off screen, hidden silently by
                  overflow-x-hidden. The user saw one label and had to guess the other end. */}
              <div className="w-full flex flex-col items-center px-4 mb-2 md:mb-6">
                <div className="w-full max-w-sm flex justify-between items-center mb-2">
                  <span className="text-sm text-zinc-400 font-black uppercase tracking-widest">{t('hate')}</span>
                  <span className="text-sm text-zinc-400 font-black uppercase tracking-widest">{t('love')}</span>
                </div>
                {/* NO dir="ltr" here: forcing LTR inside the RTL page put star #1 (which submits
                    the value 1 = hated) physically under the "אוהב" label and star #5 under "שונא",
                    so every Hebrew rating reached the engine INVERTED. Inheriting the page's
                    direction keeps star #1 next to "שונא" and star #5 next to "אוהב" in both
                    locales, so the value always matches the label the user aimed at. */}
                {/* The closing request can take tens of seconds — it is where the three films are
                    chosen and their reasons written. Without this the screen just froze: the stars
                    went dim and nothing said why, which reads as a broken product rather than as
                    work happening. Only shown when the engine is actually in its closing ramp. */}
                {loading && (session.readyToFinish || (session.confidenceScore ?? 0) >= 0.8) && (
                  <div className="flex items-center gap-2 text-sm font-bold text-accent-soft animate-pulse" role="status">
                    <span aria-hidden="true">🎬</span>
                    {he ? 'מרכיבים את שלושת הסרטים שלכם…' : 'Putting your three films together…'}
                  </div>
                )}
                <div className="stars-container flex gap-2 sm:gap-4 md:gap-6">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button 
                      key={star} 
                      disabled={loading} 
                      onMouseEnter={() => setHoveredStar(star)} 
                      onMouseLeave={() => setHoveredStar(null)} 
                      onFocus={() => setHoveredStar(star)}
                      onBlur={() => setHoveredStar(null)}
                      // A click carries coordinates; a keyboard-fired one does not. That is how we
                      // tell whether focus needs to be put back after the card swaps.
                      onClick={(e) => { keyboardRef.current = e.detail === 0; handleStarClick(star as AnswerType); }} 
                      aria-label={locale === 'he' ? `דירוג ${star} מתוך 5` : `Rate ${star} out of 5`}
                      className="p-1 sm:p-2 group transition-transform hover:scale-110 active:scale-90 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                      <svg className={`w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 transition-all duration-200 ${(hoveredStar !== null && star <= hoveredStar) ? 'text-accent fill-accent drop-shadow-[0_0_15px_rgba(244,63,94,0.8)] scale-110' : 'text-zinc-700 fill-transparent stroke-current stroke-1'}`} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" /></svg>
                    </button>
                  ))}
                </div>
              </div>
              
              {/* THE WAY OUT, IN WORDS. The quiz has let anyone stop from question five for a
                  while, but the button never said what stopping would GET them, so a tiring user's
                  real choice was between answering more films and closing the tab — and against
                  fifty simulated customers they closed the tab: 80% abandoned. The same fifty,
                  pressing the button instead, abandoned 16% of the time with the read still right
                  98% of the time. So once the engine can actually finish well, and the person is
                  showing they have had enough, we say so plainly. Once — dismissing it leaves the
                  quiet button in the row below. */}
              {/* Shown before the finish offer: someone we have not read yet needs a direction,
                  not an exit. */}
              {showDirections && (
                <div className="w-full max-w-md mx-auto mb-4 px-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="rounded-control border border-indigo-500/40 bg-indigo-500/[0.07] p-4 text-center">
                    <p className="text-indigo-300 font-bold mb-1 text-base leading-snug">
                      {he ? 'עוד לא קלענו לך.' : "We haven't hit it yet."}
                    </p>
                    <p className="text-zinc-400 text-sm mb-3">
                      {he ? 'לאן ללכת? נמשיך משם.' : 'Point us somewhere and we’ll go from there.'}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {DIRECTIONS.map(d => (
                        <button
                          key={d.key}
                          disabled={loading}
                          onClick={() => pickDirection(d.key)}
                          className="px-2 py-3 rounded-xl border border-white/10 hover:border-indigo-400/60 hover:bg-indigo-500/10 text-sm font-bold text-zinc-200 transition-all active:scale-95"
                        >
                          <span className="block text-xl mb-0.5">{d.emoji}</span>
                          {he ? d.he : d.en}
                        </button>
                      ))}
                    </div>
                    <button
                      disabled={loading}
                      onClick={() => setDirectionsDismissed(true)}
                      className="mt-3 text-sm font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      {he ? 'תמשיכו לנחש' : 'Keep guessing'}
                    </button>
                  </div>
                </div>
              )}

              {showFinishOffer && (
                <div className="w-full max-w-md mx-auto mb-4 px-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="rounded-control border border-signal/40 bg-signal/[0.07] p-4 text-center">
                    <p className="text-emerald-300 font-bold mb-3 text-base leading-snug">
                      {locale === 'he' ? 'כבר קלטנו את הטעם שלך. רוצה את שלושת הסרטים עכשיו?' : 'We have your taste. Want your three films now?'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <button
                        disabled={loading}
                        onClick={() => submitAnswer('NOT_SEEN', true)}
                        className="px-6 py-2.5 rounded-full bg-signal hover:bg-emerald-400 text-black text-base font-black transition-all active:scale-95"
                      >
                        {locale === 'he' ? 'כן, תראה לי 🎬' : 'Yes, show me 🎬'}
                      </button>
                      <button
                        disabled={loading}
                        onClick={() => setFinishOfferDismissed(true)}
                        className="px-5 py-2.5 rounded-full border border-white/15 hover:bg-white/5 text-sm font-bold text-zinc-400 transition-all"
                      >
                        {locale === 'he' ? 'אמשיך לענות' : 'Keep going'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Every gap here is measured against a 375x812 phone: with the old spacing the
                  "didn't see" row — a primary answer, not a footnote — ended at y=867, and a
                  visitor had to scroll to say they had not seen the film. */}
              <div className="flex flex-wrap justify-center gap-3 md:gap-4 mt-2 md:mt-6">
                {/* The hover glow here was 5% white over a near-black page: it rendered nothing,
                    on hardware where it rendered at all. The border carries the hover instead. */}
                <button disabled={loading} onClick={() => submitAnswer('NOT_SEEN')} className="px-8 py-3 rounded-full border border-white/10 hover:border-white/25 hover:bg-white/10 text-base font-bold text-zinc-400 transition-all">
                  {t('not_seen')} <span>{locale === 'he' ? '›' : '‹'}</span>
                </button>
                {/* Hidden while the offer above is on screen — two buttons that do the same thing,
                    one loud and one quiet, read as two different things. */}
                {(session.historyCount ?? 0) >= 5 && !showFinishOffer && (
                  <button
                    disabled={loading}
                    onClick={() => submitAnswer('NOT_SEEN', true)}
                    className="px-6 py-3 rounded-full border border-signal/40 hover:bg-signal/10 text-base font-bold text-emerald-400 transition-all"
                  >
                    {locale === 'he' ? 'מספיק, תמליץ לי עכשיו 🎬' : 'Enough — recommend now 🎬'}
                  </button>
                )}
                {historyState.length > 0 && (
                  <button disabled={loading} onClick={handleBack} className="px-6 py-3 rounded-full border border-accent/40 hover:bg-accent/10 text-base font-bold text-accent-soft transition-all">
                    <span>{locale === 'he' ? '‹' : '›'}</span> {t('back')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}