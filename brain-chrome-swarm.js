/**
 * PHYSICAL-CHROME adversarial QA for the taste brain.
 *
 * Per עידו: the 20-persona acceptance tests must run in REAL Google Chrome tabs against
 * the live UI (/scan?brain=1) — clicking the star buttons in the actual frontend, not via
 * direct API calls. This validates the WHOLE stack (UI → client round-trip → engine).
 *
 * For each persona:
 *   1. Open a Chrome tab on the live quiz.
 *   2. Read the served movie from window.__cinemind_session, have the persona-sim (LLM)
 *      rate it 1-5 in character, and CLICK the matching star button in the DOM.
 *   3. At completion, read finalMovies + tasteSummary and judge surgically (median-of-3).
 *
 * Usage: node brain-chrome-swarm.js [personas.json]   (defaults to WAVE1 in brain-swarm.js)
 *        HEADLESS=1 node brain-chrome-swarm.js ...      (hide the window; default is headed)
 */
const fs = require('fs');
const { chromium } = require('playwright');

const OLLAMA = 'http://localhost:11434/v1/chat/completions';
const JUDGE_MODEL = process.env.JUDGE_MODEL || 'qwen2.5:14b-instruct';
const SIM_MODEL = process.env.SIM_MODEL || 'qwen2.5:14b-instruct';
const BASE = process.env.BASE || 'http://localhost:3000/en/scan?brain=1';
const PASS_SCORE = 90;
const MAX_Q = 62;

const GENRE = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western' };

// Built-in WAVE1 (kept in sync with brain-swarm.js).
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

async function ollamaJSON(model, system, user, retries = 2, temperature = 0.2) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(OLLAMA, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature, stream: false, response_format: { type: 'json_object' } }),
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

// Persona sim — SHORT, decisive prompt (the long "neighbour NEVER gets 5" version made the
// 14B model hesitate and under-rate true bullseyes, stalling the quiz). A single call with
// a few retries matches the API harness behaviour that passes 40/40.
async function rateMovie(persona, movie) {
  const sys = `You ARE this exact moviegoer: ${persona.taste}\n\nIdentify the movie's PRECISE sub-genre, then rate 1-5 by how exactly it hits YOUR narrow taste. Be DECISIVE:\n- 5 = the EXACT sub-genre you love (the bullseye).\n- 4 = an adjacent sub-genre you enjoy but not your precise core.\n- 3 = unrelated to your loves and dislikes.\n- 2 = leans toward a style you dislike.\n- 1 = squarely a style you DISLIKE.\nOutput JSON {"rating": <1-5 integer>, "why": "<the sub-genre, 3 words>"}.`;
  const usr = `Movie: "${movie.title}"${movie.year ? ` (${movie.year})` : ''}, genres: ${(movie.genres || []).join(', ') || 'unknown'}.`;
  const o = await ollamaJSON(SIM_MODEL, sys, usr, 3);
  const r = o && Number(o.rating);
  return Number.isFinite(r) ? Math.max(1, Math.min(5, Math.round(r))) : 3;
}

async function judgeOnce(persona, result) {
  const sys = `You are a fair, consistent QA judge for a movie-taste AI. Score how SURGICALLY it captured the taste at SUB-GENRE resolution. Output JSON: {"score":0-100,"subGenreIdentified":bool,"hatesAvoided":bool,"verdict":"one sentence","missed":"what it got wrong or empty"}.\nRUBRIC:\n- subGenreIdentified = true if the AI named the SPECIFIC sub-genre (e.g. "slasher", "hard science fiction"), not just the broad genre. A broad-genre read = false.\n- hatesAvoided = false ONLY if a recommendation clearly belongs to a sub-genre the user EXPLICITLY DISLIKES. A canonical/classic example of the LOVED sub-genre is NEVER a hate violation. A film the user NAMES as a favorite is ALWAYS correct.\n- score: reward correct sub-genre + in-genre recs; do NOT nitpick canonical members of the loved sub-genre. If all 3 recs are inside the loved sub-genre and none disliked, score >= 90.`;
  const usr = `TRUE taste: ${persona.taste}\n\nAI taste summary: "${result.tasteSummary}"\nAI recommendations: ${result.recs.join(', ') || '(none)'}`;
  const o = await ollamaJSON(JUDGE_MODEL, sys, usr);
  if (!o) return null;
  o.score = Math.max(0, Math.min(100, Number(o.score) || 0));
  return o;
}
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

const sessionOf = (page) => page.evaluate(() => window.__cinemind_session || null);

async function runPersonaInTab(context, persona) {
  const page = await context.newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    // Wait for the quiz to boot (first real question).
    await page.waitForFunction(() => {
      const s = window.__cinemind_session;
      return s && (s.isComplete || (s.currentQuestion && s.currentQuestion.movie));
    }, null, { timeout: 60000 });

    let n = 0, lastTitle = '';
    while (n < MAX_Q) {
      const s = await sessionOf(page);
      if (!s) break;
      if (s.isComplete) break;
      const mv = s.currentQuestion && s.currentQuestion.movie;
      if (!mv || !mv.title) break;
      if (mv.title === lastTitle) { await page.waitForTimeout(300); continue; } // not advanced yet
      lastTitle = mv.title; n++;
      const yr = (mv.originalDetails || '').match(/(\d{4})/)?.[1];
      const genres = (mv._genreIds || []).map(g => GENRE[g]).filter(Boolean);
      const rating = await rateMovie(persona, { title: mv.title, year: yr, genres });
      // CLICK the real star button (nth-child rating) in the live UI.
      await page.locator('.stars-container button').nth(rating - 1).click();
      // Wait until the UI advances (new title) or completes.
      await page.waitForFunction((prev) => {
        const w = window.__cinemind_session;
        return w && (w.isComplete || (w.currentQuestion && w.currentQuestion.movie && w.currentQuestion.movie.title !== prev));
      }, mv.title, { timeout: 40000 }).catch(() => {});
    }
    const s = await sessionOf(page);
    return {
      questions: n,
      tasteSummary: (s && s.tasteSummary) || '',
      recs: ((s && s.finalMovies) || []).map(m => m.title),
      complete: !!(s && s.isComplete),
    };
  } catch (e) {
    return { error: String(e && e.message || e), questions: 0, tasteSummary: '', recs: [], complete: false };
  } finally {
    await page.close().catch(() => {});
  }
}

async function run() {
  const file = process.argv[2];
  const personas = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : WAVE1;
  console.log(`\n🌐 BRAIN swarm in PHYSICAL CHROME — ${personas.length} personas | pass>=${PASS_SCORE} | ${BASE}\n`);
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADLESS === '1' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const results = [];
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i];
    process.stdout.write(`[${i + 1}/${personas.length}] ${p.name} … `);
    const t0 = Date.now();
    const r = await runPersonaInTab(context, p);
    if (r.error) { console.log(`❌ tab ${r.error}`); results.push({ persona: p.name, taste: p.taste, pass: false, score: 0, reason: 'tab ' + r.error }); continue; }
    const j = await judge(p, r);
    const pass = j.score >= PASS_SCORE && j.subGenreIdentified && j.hatesAvoided;
    console.log(`${pass ? '✅' : '❌'} ${j.score} | Q=${r.questions} | ${((Date.now() - t0) / 1000).toFixed(0)}s | ${j.verdict}`);
    if (!pass) { console.log(`     taste: ${r.tasteSummary.slice(0, 140)}`); console.log(`     recs: ${r.recs.join(', ')} | missed: ${j.missed || ''}`); }
    results.push({ persona: p.name, taste: p.taste, pass, score: j.score, subGenre: j.subGenreIdentified, hatesAvoided: j.hatesAvoided, verdict: j.verdict, missed: j.missed, tasteSummary: r.tasteSummary, recs: r.recs, questions: r.questions });
  }
  await browser.close();
  const passed = results.filter(r => r.pass).length;
  fs.writeFileSync('brain-chrome-results.json', JSON.stringify(results, null, 2));
  console.log(`\n══════════════════════`);
  console.log(`📊 SURGICAL (in Chrome): ${passed}/${personas.length} | avg ${Math.round(results.reduce((a, r) => a + r.score, 0) / results.length)}`);
  console.log(`══════════════════════`);
  if (passed < personas.length) for (const r of results.filter(r => !r.pass)) console.log(`  ❌ ${r.persona} (${r.score}) — ${r.missed || r.reason || r.verdict}`);
}
run().catch(e => { console.error('CHROME SWARM FATAL:', e); process.exit(1); });
