/**
 * Adversarial QA swarm for the LLM taste BRAIN (/api/brain-question).
 *
 * For each persona (a ground-truth sub-genre taste):
 *   1. PERSONA SIMULATOR (LLM) rates every movie the brain serves, 1-5, in character.
 *   2. The BRAIN runs the quiz and produces a taste summary + 3 grounded recs.
 *   3. A JUDGE (LLM) scores 0-100 how surgically the brain captured the taste at
 *      SUB-GENRE resolution, whether the recs fit, and whether hated styles leaked in.
 *
 * PASS = judge score >= PASS_SCORE AND subGenreIdentified AND hatesAvoided.
 * Loop until every persona passes; then escalate to a harder wave.
 *
 * Usage: node brain-swarm.js [personas.json]   (defaults to the built-in wave 1)
 */
const fs = require('fs');

const APP = 'http://localhost:3000/api/brain-question';
const OLLAMA = 'http://localhost:11434/v1/chat/completions';
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'qwen2.5:14b-instruct';
const SIM_MODEL = process.env.SIM_MODEL || 'qwen2.5:14b-instruct';
const PASS_SCORE = 90;
const MAX_Q = 42;

// ── Wave 1 personas: each loves a SPECIFIC sub-genre and dislikes adjacent ones ──
const WAVE1 = [
  { name: 'Slasher Devotee', taste: 'Loves 80s/90s SLASHER horror (Halloween, Scream, Friday the 13th, masked-killer body-count films). Dislikes supernatural/ghost horror and torture-porn. Neutral on everything non-horror.' },
  { name: 'Cerebral Hard-SF', taste: 'Loves cerebral, idea-driven HARD science fiction (Arrival, Ex Machina, Primer, 2001). Dislikes space-opera spectacle and superhero films. Neutral elsewhere.' },
  { name: 'Rom-Com Purist', taste: 'Loves light, feel-good ROMANTIC COMEDIES (Notting Hill, 10 Things I Hate About You). Dislikes dark/tragic romance and musicals. Neutral elsewhere.' },
  { name: 'Heist Caper Fan', taste: 'Loves clever HEIST / caper thrillers (Ocean’s Eleven, Inside Man, Heat). Dislikes war films and superhero action. Neutral elsewhere.' },
  { name: 'Elevated Slow-Burn Horror', taste: 'Loves A24-style PSYCHOLOGICAL slow-burn horror (Hereditary, The Witch, Midsommar). Dislikes jump-scare slashers and gore. Neutral elsewhere.' },
  { name: 'Neo-Noir Crime', taste: 'Loves film-noir and NEO-NOIR crime (Chinatown, L.A. Confidential, Drive). Dislikes loud modern superhero action. Neutral elsewhere.' },
  { name: 'Deadpan Whimsy', taste: 'Loves quirky, symmetrical DEADPAN comedy-drama (Wes Anderson, Yorgos Lanthimos). Dislikes crude/gross-out comedy. Neutral elsewhere.' },
  { name: 'Kaiju Monster Fan', taste: 'Loves giant-MONSTER / kaiju films (Godzilla, Pacific Rim, King Kong). Dislikes quiet human dramas and romance. Neutral elsewhere.' },
  { name: 'Space-Opera Lover', taste: 'Loves fun SPACE-OPERA adventure (Star Wars, Guardians of the Galaxy, The Fifth Element). Dislikes bleak hard-SF and dystopia. Neutral elsewhere.' },
  { name: 'Regency Costume Drama', taste: 'Loves period COSTUME dramas / Austen adaptations (Pride & Prejudice, Atonement, Little Women). Dislikes contemporary action and horror. Neutral elsewhere.' },
  { name: 'Martial-Arts Action', taste: 'Loves MARTIAL-ARTS / wuxia action (Ip Man, Crouching Tiger, The Raid). Dislikes gun-heavy war films. Neutral elsewhere.' },
  { name: 'Satire Comedy', taste: 'Loves sharp SATIRE / mockumentary comedy (Dr. Strangelove, In the Loop, Thank You for Smoking). Dislikes slapstick and gross-out. Neutral elsewhere.' },
  { name: 'Cosmic Dread Horror', taste: 'Loves atmospheric COSMIC / Lovecraftian dread horror (The Lighthouse, Annihilation, Color Out of Space). Dislikes gore slashers. Neutral elsewhere.' },
  { name: 'Sports Underdog Drama', taste: 'Loves inspirational SPORTS underdog dramas (Rocky, Rudy, Miracle, Warrior). Dislikes sci-fi and fantasy. Neutral elsewhere.' },
  { name: 'Cyberpunk Dystopia', taste: 'Loves CYBERPUNK / tech-dystopia (Blade Runner, The Matrix, Ghost in the Shell). Dislikes high-fantasy and romance. Neutral elsewhere.' },
  { name: 'Hand-Drawn Anime', taste: 'Loves hand-drawn STUDIO GHIBLI-style anime (Spirited Away, Princess Mononoke, Your Name). Dislikes CGI-blockbuster animation. Neutral elsewhere.' },
  { name: 'Whodunit Mystery', taste: 'Loves grounded WHODUNIT / detective mysteries (Knives Out, Zodiac, Gone Girl). Dislikes supernatural horror. Neutral elsewhere.' },
  { name: 'War Epic', taste: 'Loves serious WAR epics (Saving Private Ryan, 1917, Apocalypse Now). Dislikes rom-coms and musicals. Neutral elsewhere.' },
  { name: 'Body Horror', taste: 'Loves Cronenberg-style BODY HORROR (The Fly, The Thing, Possessor). Dislikes light comedy and romance. Neutral elsewhere.' },
  { name: 'Musical Theater', taste: 'Loves big MUSICALS (La La Land, Les Misérables, The Greatest Showman). Dislikes horror and gritty crime. Neutral elsewhere.' },
];

async function ollamaJSON(model, system, user, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(OLLAMA, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.2, stream: false, response_format: { type: 'json_object' } }),
      });
      const j = await r.json();
      let c = j.choices?.[0]?.message?.content || '';
      c = c.replace(/<think>[\s\S]*?<\/think>/g, '');
      const m = c.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch { /* retry */ }
  }
  return null;
}

async function rateMovie(persona, movie) {
  const sys = `You ARE this exact moviegoer with a SPECIFIC, OPINIONATED taste:\n${persona.taste}\n\nYou know this movie. Identify its REAL sub-genre and tone, then rate 1-5 by YOUR taste, and BE DECISIVE — do not hide behind "neutral":\n- 5 = it clearly belongs to the sub-genre you LOVE.\n- 4 = adjacent to what you love.\n- 1 = it clearly belongs to a style you DISLIKE.\n- 2 = leans toward something you dislike.\n- 3 = ONLY if it is genuinely unrelated to both your loves and your dislikes.\nA movie in your beloved sub-genre must get 5; a movie in a sub-genre you explicitly dislike must get 1. Output JSON {"rating": <1-5 integer>, "why": "<3 words: the sub-genre>"}.`;
  const usr = `Movie: "${movie.title}"${movie.year ? ` (${movie.year})` : ''}, listed genres: ${(movie.genres || []).join(', ') || 'unknown'}.`;
  const o = await ollamaJSON(SIM_MODEL, sys, usr);
  let r = o && Number(o.rating);
  if (!Number.isFinite(r)) r = 3;
  return Math.max(1, Math.min(5, Math.round(r)));
}

async function runQuiz(persona) {
  const post = async (b) => {
    const r = await fetch(APP, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-locale': 'en' }, body: JSON.stringify(b) });
    return r.ok ? r.json() : null;
  };
  let s = await post({ isInit: true, sessionId: `bsw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
  if (!s) return { error: 'init failed' };
  let n = 0;
  while (s && !s.isComplete && n < MAX_Q) {
    const mv = s.currentQuestion && s.currentQuestion.movie;
    if (!mv) break;
    n++;
    const yr = (mv.originalDetails || '').match(/(\d{4})/)?.[1];
    const genres = (mv._genreIds || []).map(g => GENRE[g]).filter(Boolean);
    const rating = await rateMovie(persona, { title: mv.title, year: yr, genres });
    s = await post({ sessionId: s.sessionId, movieId: mv.id, answer: rating, genreIds: mv._genreIds || [], title: mv.title, year: yr, ratingHistory: s.ratingHistory || [], searchHint: s.searchHint || '', probeScores: s.probeScores || {} });
    if (!s) return { error: 'step failed @' + n };
  }
  return { questions: n, tasteSummary: s.tasteSummary || '', recs: (s.finalMovies || []).map(m => m.title), complete: !!s.isComplete };
}

const GENRE = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western' };

async function judgeOnce(persona, result) {
  const sys = `You are a fair, consistent QA judge for a movie-taste AI. Given a person's TRUE taste and what the AI concluded + recommended, score how SURGICALLY the AI captured the taste at SUB-GENRE resolution. Output JSON: {"score": 0-100, "subGenreIdentified": bool, "hatesAvoided": bool, "verdict": "one sentence", "missed": "what it got wrong or empty"}.

RUBRIC (apply exactly):
- subGenreIdentified = true if the AI named the user's SPECIFIC sub-genre (e.g. "slasher", "hard science fiction"), not just the broad genre ("horror", "sci-fi"). A broad-genre read = false.
- hatesAvoided = false ONLY if a recommendation clearly belongs to a sub-genre the user EXPLICITLY DISLIKES (per their stated dislikes). A canonical or classic example of the LOVED sub-genre is NEVER a hate violation — even if it is old, artistic, or slightly atypical. A film the user NAMES as a favorite is ALWAYS a correct recommendation.
- score: reward correct sub-genre identification and recommendations that sit inside the loved sub-genre. Do NOT nitpick canonical/iconic members of the loved sub-genre or deduct for stylistic shades within it. Only deduct for a wrong sub-genre, a broad-genre read, or a rec from a disliked style.
- If all 3 recs are inside the loved sub-genre and none are from a disliked style, score >= 90.`;
  const usr = `TRUE taste: ${persona.taste}\n\nAI taste summary: "${result.tasteSummary}"\nAI recommendations: ${result.recs.join(', ') || '(none)'}`;
  const o = await ollamaJSON(JUDGE_MODEL, sys, usr);
  if (!o) return null;
  o.score = Math.max(0, Math.min(100, Number(o.score) || 0));
  return o;
}

// Median-of-3 to damp judge variance (a single run can nitpick a canonical pick).
async function judge(persona, result) {
  const runs = [];
  for (let i = 0; i < 3; i++) { const o = await judgeOnce(persona, result); if (o) runs.push(o); }
  if (!runs.length) return { score: 0, subGenreIdentified: false, hatesAvoided: false, verdict: 'judge failed', missed: 'judge call failed' };
  const scores = runs.map(r => r.score).sort((a, b) => a - b);
  const med = scores[Math.floor(scores.length / 2)];
  const maj = (k) => runs.filter(r => r[k]).length > runs.length / 2;
  const rep = runs.find(r => r.score === med) || runs[0];
  return { score: med, subGenreIdentified: maj('subGenreIdentified'), hatesAvoided: maj('hatesAvoided'), verdict: rep.verdict, missed: rep.missed };
}

async function run() {
  const file = process.argv[2];
  const personas = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : WAVE1;
  console.log(`\n🧠 BRAIN adversarial swarm — ${personas.length} personas | pass>=${PASS_SCORE} | brain+sim+judge=14b\n`);
  const results = [];
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    process.stdout.write(`[${i + 1}/${personas.length}] ${p.name} … `);
    const t0 = Date.now();
    const r = await runQuiz(p);
    if (r.error) { console.log(`❌ quiz ${r.error}`); results.push({ persona: p.name, taste: p.taste, pass: false, score: 0, reason: 'quiz ' + r.error }); continue; }
    const j = await judge(p, r);
    const pass = j.score >= PASS_SCORE && j.subGenreIdentified && j.hatesAvoided;
    console.log(`${pass ? '✅' : '❌'} ${j.score} | Q=${r.questions} | ${((Date.now() - t0) / 1000).toFixed(0)}s | ${j.verdict}`);
    if (!pass) console.log(`     taste: ${r.tasteSummary.slice(0, 140)}`);
    if (!pass) console.log(`     recs: ${r.recs.join(', ')} | missed: ${j.missed || ''}`);
    results.push({ persona: p.name, taste: p.taste, pass, score: j.score, subGenre: j.subGenreIdentified, hatesAvoided: j.hatesAvoided, verdict: j.verdict, missed: j.missed, tasteSummary: r.tasteSummary, recs: r.recs, questions: r.questions });
  }
  const passed = results.filter(r => r.pass).length;
  fs.writeFileSync('brain-swarm-results.json', JSON.stringify(results, null, 2));
  console.log(`\n══════════════════════════════════════════`);
  console.log(`📊 SURGICAL: ${passed}/${personas.length} | avg score ${Math.round(results.reduce((a, r) => a + r.score, 0) / results.length)}`);
  console.log(`══════════════════════════════════════════`);
  if (passed < personas.length) {
    console.log('FAILURES:');
    for (const r of results.filter(r => !r.pass)) console.log(`  ❌ ${r.persona} (${r.score}) — ${r.missed || r.reason || r.verdict}`);
  }
}
run().catch(e => { console.error('SWARM FATAL:', e); process.exit(1); });
