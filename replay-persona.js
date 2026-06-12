/**
 * API-level deterministic replay of one persona — no browser, no timing noise.
 * Prints every question, the vote cast, and the affinity vector after it.
 * Usage: node replay-persona.js
 */
const BASE = 'http://localhost:3000';

const TITLE_BUCKETS = require('fs').existsSync('baseline-pool-verified.json')
  ? (() => {
      const data = JSON.parse(require('fs').readFileSync('baseline-pool-verified.json', 'utf-8'));
      const pairs = [];
      for (const [bucket, cands] of Object.entries(data)) {
        for (const c of cands) { pairs.push([c.he.toLowerCase(), bucket]); pairs.push([c.en.toLowerCase(), bucket]); }
      }
      return pairs;
    })()
  : [];

function bucketOf(title) {
  const t = title.trim().toLowerCase();
  for (const [name, bucket] of TITLE_BUCKETS) {
    if (name.length <= 3 ? t === name : t.includes(name)) return bucket;
  }
  return null;
}

// Horror Purist Hates Everything
const persona = {
  bucketVotes: { horror: 5, horror2: 5, action: 1, scifi: 1, space: 1, romance: 1, family: 1, mystery: 1, crime: 1, drama: 1, epic: 1, comedy: 1 },
  loves: ['horror'], hates: [],
};

function resolveVote(titleText, qNum) {
  const bucket = qNum <= 13 ? bucketOf(titleText) : null;
  if (bucket && persona.bucketVotes[bucket] !== undefined) return persona.bucketVotes[bucket];
  const loves = persona.loves.some(kw => titleText.toLowerCase().includes(kw));
  if (loves) return 5;
  return 3;
}

async function main() {
  const sessionId = 'replay_purist_1';
  const locale = 'en';
  let state = null;

  // init
  let res = await fetch(`${BASE}/api/next-question`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-locale': locale, 'x-asked-ids': '[]' },
    body: JSON.stringify({ sessionId, isInit: true }),
  });
  state = await res.json();

  const seenTitles = [];
  for (let q = 1; q <= 45 && !state.isComplete; q++) {
    const movie = state.currentQuestion.movie;
    const vote = resolveVote(movie.title, q);
    seenTitles.push(movie.title);

    res = await fetch(`${BASE}/api/next-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-locale': locale,
        'x-current-confidence': String(state.confidenceScore),
        'x-history-count': String(state.historyCount),
        'x-asked-ids': JSON.stringify(state.askedMovieIds),
        'x-affinities': JSON.stringify(state.userAffinities || {}),
      },
      body: JSON.stringify({
        sessionId, questionId: state.currentQuestion.id, answer: vote,
        movieId: movie.id, genreIds: movie._genreIds || [], askedTitles: seenTitles.slice(-60),
      }),
    });
    if (!res.ok) { console.log(`Q${q} HTTP_${res.status} — vote LOST`); continue; }
    const next = await res.json();
    const bucket = q <= 13 ? (bucketOf(movie.title) || '·') : '·';
    console.log(`Q${q.toString().padStart(2)} [${bucket.padEnd(8)}] vote=${vote} "${movie.title}" genres=${JSON.stringify(movie._genreIds)} -> aff=${JSON.stringify(next.userAffinities)}`);
    state = next;
  }
  console.log('\nCOMPLETE:', state.isComplete, '| final affinities:', JSON.stringify(state.userAffinities));
}

main().catch(e => console.error('REPLAY FATAL', e));
