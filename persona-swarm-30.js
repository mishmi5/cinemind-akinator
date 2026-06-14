/**
 * CineMind Persona Swarm — 30 aggressive, hard-to-profile personas.
 *
 * Each persona:
 *  1. Completes the taste quiz (anchored votes on baseline movies + keyword
 *     voting on live-TMDB questions + character noise: NOT_SEEN spam,
 *     all-1s trolling, indecisiveness).
 *  2. Audits 2 assigned site pages from their own angle (locale × viewport).
 *  3. Decides whether to SUBSCRIBE based on: archetype accuracy, personalized
 *     recommendations, zero console errors, healthy pages, sane quiz length.
 *
 * Verdict line: 📊 Churn: X% | Bugs: Y | Subscribers: Z/30
 * Output: persona-swarm-results.json
 */
const puppeteer = require('puppeteer');
const fs = require('fs');

// ---------- deriveTaste replica (mirror of src/lib/taste/deriveTaste.ts) ----------
const TMDB_GENRES = {
  "28": "Action", "12": "Adventure", "16": "Animation", "35": "Comedy",
  "80": "Crime", "99": "Documentary", "18": "Drama", "10751": "Family",
  "14": "Fantasy", "36": "History", "27": "Horror", "10402": "Music",
  "9648": "Mystery", "10749": "Romance", "878": "Sci-Fi", "10770": "TV Movie",
  "53": "Thriller", "10752": "War", "37": "Western"
};

function computeContrarianScore(affinities) {
  const mainstream = ['Action', 'Comedy', 'Romance', 'Adventure'];
  let score = 0, total = 0;
  for (const [genreId, weight] of Object.entries(affinities)) {
    if (genreId === 'General' || genreId.startsWith('k:')) continue;
    const genre = TMDB_GENRES[genreId] || 'Unknown';
    if (weight > 0) {
      if (!mainstream.includes(genre)) score += weight;
      total += weight;
    }
  }
  return total === 0 ? 0 : score / total;
}

function pickArchetype(affinities, contrarian) {
  const values = Object.values(affinities);
  if (values.length === 0) return 'The Basic Binge-Watcher';
  const maxScore = Math.max(...values);
  const MIN_SIGNAL = 2; // mirror deriveTaste.ts: niche-purist-who-hates-all tops ~+2
  if (maxScore < MIN_SIGNAL) return 'The Basic Binge-Watcher';
  // Mirror of deriveTaste.ts: 0.85 leniency, ORDER = most-specific first.
  // Action/Thriller/Crime above Animation/Family (Army Vet); Escapist (broad rider
  // bucket) below the specific ones (Animation Student / Pixar-rides-on-Adventure).
  const hasStrongSignal = (genres) => genres.some(g => (affinities[g] || 0) >= maxScore * 0.85 && (affinities[g] || 0) >= MIN_SIGNAL);
  if (hasStrongSignal(['Horror'])) return 'The Cinematic Edge-Lord';
  if (hasStrongSignal(['Romance'])) return 'The Hopeless Romantic';
  if (hasStrongSignal(['Action', 'Thriller', 'Crime'])) return 'The Action Junkie';
  if (hasStrongSignal(['Animation', 'Family'])) return 'The Family & Animation Enthusiast';
  if (hasStrongSignal(['Sci-Fi', 'Fantasy', 'Adventure', 'Mystery'])) return 'The Escapist';
  if (hasStrongSignal(['History', 'Documentary', 'Drama']) || contrarian > 0.8) return 'The Pretentious Cinephile';
  return 'The Basic Binge-Watcher';
}

// Exact taste profile: positive axes (loves) and negative axes (hates),
// sorted by strength — this is the persona's measured taste fingerprint.
function tasteProfile(affinities) {
  const mapped = {};
  const niches = {};
  for (const [id, w] of Object.entries(affinities || {})) {
    if (id === 'General') continue;
    if (id.startsWith('k:')) { niches[id.slice(2)] = (niches[id.slice(2)] || 0) + w; continue; }
    const name = TMDB_GENRES[id] || 'Unknown';
    mapped[name] = (mapped[name] || 0) + w;
  }
  const entries = Object.entries(mapped);
  const loves = entries.filter(([, w]) => w >= 2).sort((a, b) => b[1] - a[1])
    .map(([g, w]) => `${g} (+${Math.round(w * 10) / 10})`);
  const hates = entries.filter(([, w]) => w <= -2).sort((a, b) => a[1] - b[1])
    .map(([g, w]) => `${g} (${Math.round(w * 10) / 10})`);
  const nicheEntries = Object.entries(niches);
  const nicheLoves = nicheEntries.filter(([, w]) => w >= 2).sort((a, b) => b[1] - a[1])
    .map(([g, w]) => `${g} (+${Math.round(w * 10) / 10})`);
  const nicheHates = nicheEntries.filter(([, w]) => w <= -3).sort((a, b) => a[1] - b[1])
    .map(([g, w]) => `${g} (${Math.round(w * 10) / 10})`);
  return { loves, hates, nicheLoves, nicheHates };
}

function deriveTaste(affinities) {
  const mapped = {};
  for (const [id, weight] of Object.entries(affinities)) {
    if (id === 'General' || id.startsWith('k:')) continue;
    const name = TMDB_GENRES[id] || 'Unknown';
    mapped[name] = (mapped[name] || 0) + weight;
  }
  return { archetype: pickArchetype(mapped, computeContrarianScore(affinities)) };
}

// ---------- Bucket title map (he + en, verified against TMDB) ----------
const TITLE_BUCKETS = [
  ["האביר האפל", "action"],
  ["the dark knight", "action"],
  ["מקס הזועם: כביש הזעם", "action"],
  ["mad max: fury road", "action"],
  ["ג'ון וויק", "action"],
  ["john wick", "action"],
  ["מטריקס", "scifi"],
  ["the matrix", "scifi"],
  ["התחלה", "scifi"],
  ["inception", "scifi"],
  ["בלייד ראנר 2049", "scifi"],
  ["blade runner 2049", "scifi"],
  ["בין כוכבים", "space"],
  ["interstellar", "space"],
  ["להציל את מארק וואטני", "space"],
  ["the martian", "space"],
  ["כח משיכה", "space"],
  ["gravity", "space"],
  ["היומן", "romance"],
  ["the notebook", "romance"],
  ["לה לה לנד", "romance"],
  ["la la land", "romance"],
  ["טיטניק", "romance"],
  ["titanic", "romance"],
  ["צעצוע של סיפור", "family"],
  ["toy story", "family"],
  ["המסע המופלא", "family"],
  ["spirited away", "family"],
  ["למעלה", "family"],
  ["up", "family"],
  ["צעקה", "horror"],
  ["scream", "horror"],
  ["לזמן את הרוע", "horror"],
  ["the conjuring", "horror"],
  ["מקום שקט", "horror"],
  ["a quiet place", "horror"],
  ["בקתת הפחד", "horror2"],
  ["the cabin in the woods", "horror2"],
  ["תברח", "horror2"],
  ["get out", "horror2"],
  ["שבעה חטאים", "mystery"],
  ["se7en", "mystery"],
  ["רצח כתוב היטב", "mystery"],
  ["knives out", "mystery"],
  ["זודיאק", "mystery"],
  ["zodiac", "mystery"],
  ["ספרות זולה", "crime"],
  ["pulp fiction", "crime"],
  ["החבר'ה הטובים", "crime"],
  ["goodfellas", "crime"],
  ["סנאץ׳", "crime"],
  ["snatch", "crime"],
  ["הסנדק", "drama"],
  ["the godfather", "drama"],
  ["חומות של תקווה", "drama"],
  ["the shawshank redemption", "drama"],
  ["פרזיטים", "drama"],
  ["parasite", "drama"],
  ["גלדיאטור", "epic"],
  ["gladiator", "epic"],
  ["שר הטבעות: אחוות הטבעת", "epic"],
  ["the lord of the rings: the fellowship of the ring", "epic"],
  ["אינדיאנה ג'ונס ושודדי התיבה האבודה", "epic"],
  ["raiders of the lost ark", "epic"],
  ["סופרבאד: חרמן על הזמן", "comedy"],
  ["superbad", "comedy"],
  ["בדרך לחתונה עוצרים בווגאס", "comedy"],
  ["the hangover", "comedy"],
  ["מלון גרנד בודפשט", "comedy"],
  ["the grand budapest hotel", "comedy"]
];
const FALLBACK_IDS = new Set(["155", "76341", "245891", "603", "27205", "335984", "157336", "286217", "49047", "11036", "313369", "597", "862", "129", "14160", "4232", "138843", "447332", "22970", "419430", "807", "546554", "1949", "680", "769", "107", "238", "278", "496243", "98", "120", "85", "8363", "18785", "120467"]);

// Resolve which taste bucket the on-screen title belongs to.
// Long titles match by inclusion; short ones (<=3 chars, e.g. "Up") require equality
// so substrings don't false-positive.
function bucketOf(titleText) {
  const t = titleText.trim().toLowerCase();
  for (const [title, bucket] of TITLE_BUCKETS) {
    if (title.length <= 3 ? t === title : t.includes(title)) return bucket;
  }
  return null;
}

// ---------- Site pages to audit (each persona gets 2, round-robin) ----------
const SITE_PAGES = ['/', '/pricing', '/arena', '/arena/leaderboard', '/pulse', '/duel', '/quiz', '/login', '/privacy', '/terms', '/profile'];

// ---------- 30 personas ----------
// bucketVotes: tasteBucket -> star vote. Robust to per-session candidate
// rotation: every candidate in a bucket carries the bucket's signature genre
// as PRIMARY, so the vote lands on the same taste axis regardless of which
// movie represents the bucket this session.
// defaultVote: vote when no bucket/keyword matches. notSeenChance: odds of
// clicking "haven't seen" (attention-span simulation).
const PERSONAS = [
  // ----- Edge-Lords (Horror) -----
  { name: 'Slasher Teen (16, m)', expected: 'The Cinematic Edge-Lord',
    bucketVotes: { horror: 5, horror2: 5, family: 1, romance: 1 },
    loves: ['\u05d0\u05d9\u05de\u05d4', 'horror', 'slasher'], hates: ['romance'] },
  { name: 'Gore Granny (72, f)', expected: 'The Cinematic Edge-Lord',
    bucketVotes: { horror: 5, horror2: 5, romance: 2, family: 1 },
    loves: ['\u05d0\u05d9\u05de\u05d4', 'horror', 'monster'], hates: ['kids'] },
  { name: 'Metalhead Midnighter (28, m)', expected: 'The Cinematic Edge-Lord',
    bucketVotes: { horror: 5, horror2: 4, epic: 1, family: 1 },
    loves: ['\u05d0\u05d9\u05de\u05d4', 'horror', 'dark'], hates: ['rom-com'] },
  { name: 'Horror Purist Hates Everything (24, f)', expected: 'The Cinematic Edge-Lord',
    bucketVotes: { horror: 5, horror2: 5, action: 1, scifi: 1, space: 1, romance: 1, family: 1, mystery: 1, crime: 1, drama: 1, epic: 1, comedy: 1 },
    loves: ['horror'], hates: [] },

  // ----- Hopeless Romantics -----
  { name: 'Dreamy Student (19, f)', expected: 'The Hopeless Romantic',
    bucketVotes: { romance: 5, family: 4, horror: 1, mystery: 1 },
    loves: ['\u05d0\u05d4\u05d1\u05d4', 'love', 'romance'], hates: ['blood'] },
  { name: 'Divorced Romantic (45, m)', expected: 'The Hopeless Romantic',
    bucketVotes: { romance: 5, drama: 4, horror2: 1, horror: 1 },
    loves: ['\u05d0\u05d4\u05d1\u05d4', 'love'], hates: ['horror'] },
  { name: 'K-Drama Addict (27, f)', expected: 'The Hopeless Romantic',
    bucketVotes: { romance: 5, space: 2, horror: 1, crime: 1 },
    loves: ['\u05d0\u05d4\u05d1\u05d4', 'love', 'heart'], hates: ['crime'] },
  { name: 'Wedding Planner (33, f)', expected: 'The Hopeless Romantic',
    bucketVotes: { romance: 5, family: 3, horror: 1, mystery: 2 },
    loves: ['\u05d7\u05ea\u05d5\u05e0\u05d4', 'wedding', 'love'], hates: ['murder'] },

  // ----- Family & Animation -----
  { name: 'Pixar Dad (38, m)', expected: 'The Family & Animation Enthusiast',
    bucketVotes: { family: 5, romance: 3, horror: 1, mystery: 1, crime: 2 },
    loves: ['\u05d0\u05e0\u05d9\u05de\u05e6\u05d9\u05d4', 'animation', 'pixar', 'disney'], hates: ['gore'] },
  { name: 'Kindergarten Teacher (26, f)', expected: 'The Family & Animation Enthusiast',
    bucketVotes: { family: 5, horror2: 1, horror: 1, action: 2 },
    loves: ['\u05de\u05e9\u05e4\u05d7\u05d4', 'family', 'kids'], hates: ['violence'] },
  { name: 'Animation Student (22, m)', expected: 'The Family & Animation Enthusiast',
    bucketVotes: { family: 5, scifi: 4, horror: 1 },
    loves: ['\u05d0\u05e0\u05d9\u05de\u05e6\u05d9\u05d4', 'animation'], hates: ['horror'] },
  { name: 'Grandpa of Five (68, m)', expected: 'The Family & Animation Enthusiast',
    bucketVotes: { family: 5, epic: 2, mystery: 1, horror: 1 },
    loves: ['\u05de\u05e9\u05e4\u05d7\u05d4', 'family'], hates: ['scary'] },

  // ----- Escapists -----
  { name: 'Cyberpunk Hacker (24, m)', expected: 'The Escapist',
    bucketVotes: { scifi: 5, space: 5, romance: 1, drama: 2 },
    loves: ['sci-fi', 'cyber', 'robot'], hates: ['romance'] },
  { name: 'Space Nerd (31, f)', expected: 'The Escapist',
    bucketVotes: { space: 5, scifi: 5, romance: 2 },
    loves: ['\u05d7\u05dc\u05dc', 'space', 'star', 'galaxy'], hates: ['history'] },
  { name: 'Whodunit Bookworm (52, f)', expected: 'The Escapist',
    bucketVotes: { mystery: 5, crime: 3, horror2: 3 },
    loves: ['\u05ea\u05e2\u05dc\u05d5\u05de\u05d4', '\u05d1\u05dc\u05e9', 'mystery', 'detective'], hates: ['predictable'] },
  { name: 'Fantasy LARPer (29, m)', expected: 'The Escapist',
    bucketVotes: { epic: 5, scifi: 5, drama: 2 },
    loves: ['\u05e4\u05e0\u05d8\u05d6\u05d9\u05d4', 'fantasy', 'quest', 'dragon'], hates: [] },
  { name: 'Sci-Fi Skeptic Convert (60, m)', expected: 'The Escapist',
    bucketVotes: { scifi: 5, space: 5, horror: 1, family: 2 },
    loves: ['sci-fi'], hates: ['comic'] },

  // ----- Action Junkies -----
  { name: 'Crime Podcast Host (41, f)', expected: 'The Action Junkie',
    bucketVotes: { crime: 5, action: 5, romance: 2 },
    loves: ['\u05e4\u05e9\u05e2', 'crime', 'gangster'], hates: ['sweet'] },
  { name: 'Gym Bro (23, m)', expected: 'The Action Junkie',
    bucketVotes: { action: 5, crime: 5, romance: 1 },
    loves: ['\u05d0\u05e7\u05e9\u05df', 'action', 'fight'], hates: ['slow'] },
  { name: 'Army Vet (50, m)', expected: 'The Action Junkie',
    bucketVotes: { action: 5, crime: 5, romance: 1, family: 2 },
    loves: ['\u05e7\u05e8\u05d1', 'war', 'soldier'], hates: ['musical'] },
  { name: 'Tarantino Disciple (35, m)', expected: 'The Action Junkie',
    bucketVotes: { crime: 5, action: 5, family: 1 },
    loves: ['\u05e4\u05e9\u05e2', 'crime', 'kill'], hates: ['disney'] },

  // ----- Pretentious Cinephiles -----
  { name: 'Film Professor (58, m)', expected: 'The Pretentious Cinephile',
    bucketVotes: { drama: 5, scifi: 1, family: 1, comedy: 1 },
    loves: ['\u05d3\u05e8\u05de\u05d4', 'drama', 'masterpiece'], hates: ['blockbuster'] },
  { name: 'Festival Critic (29, f)', expected: 'The Pretentious Cinephile',
    bucketVotes: { drama: 5, scifi: 2, horror2: 1, action: 2 },
    loves: ['\u05e4\u05e1\u05d8\u05d9\u05d1\u05dc', 'festival', 'art'], hates: ['commercial'] },
  { name: 'Theater Snob (47, f)', expected: 'The Pretentious Cinephile',
    bucketVotes: { drama: 5, romance: 4, horror: 1, scifi: 1 },
    loves: ['\u05d3\u05e8\u05de\u05d4', 'drama', 'theatre'], hates: ['cgi'] },
  { name: 'Documentary Purist (63, m)', expected: 'The Pretentious Cinephile',
    bucketVotes: { drama: 5, epic: 1, scifi: 1, family: 1, horror: 1 },
    loves: ['\u05ea\u05d9\u05e2\u05d5\u05d3\u05d9', 'documentary', 'true story'], hates: ['fantasy'] },

  // ----- Basic Binge-Watchers (weak/no signal) -----
  { name: 'Channel-Flipping Uncle (55, m)', expected: 'The Basic Binge-Watcher',
    bucketVotes: { action: 4 }, defaultVote: 3, loves: [], hates: [] },
  { name: 'TikTok Attention Span (16, f)', expected: 'The Basic Binge-Watcher',
    bucketVotes: { scifi: 4 }, defaultVote: 3, notSeenChance: 0.4, loves: [], hates: [] },
  { name: 'Whatever-Is-On Mom (42, f)', expected: 'The Basic Binge-Watcher',
    bucketVotes: {}, defaultVote: 3, loves: [], hates: [] },
  { name: 'Polite But Unmoved Tourist (30, m)', expected: 'The Basic Binge-Watcher',
    bucketVotes: { romance: 4 }, defaultVote: 3, loves: [], hates: [] },
  { name: 'Sleep-Deprived New Dad (36, m)', expected: 'The Basic Binge-Watcher',
    bucketVotes: { horror: 2, crime: 2 }, defaultVote: 3, loves: [], hates: [] },
  { name: 'Contrarian Troll (20, m)', expected: 'The Basic Binge-Watcher',
    bucketVotes: {}, defaultVote: 1, loves: [], hates: [] },
];

// ---------- helpers ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Humans don't click at fixed 900ms intervals — they read, hesitate, scroll.
const humanPause = () => sleep(700 + Math.random() * 1400);
async function humanScroll(page) {
  try {
    await page.evaluate(() => window.scrollBy({ top: 250 + Math.random() * 300, behavior: 'smooth' }));
    await sleep(300 + Math.random() * 400);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  } catch {}
}
// Hover the star like a human deciding (visible cursor travel), then deliver
// the click via the DOM — the toast overlay (z-50) sits over the star row for
// ~4s after each vote and swallows raw viewport-coordinate clicks.
async function humanStarClick(page, vote) {
  try {
    const box = await page.evaluate((v) => {
      const stars = document.querySelectorAll('button.group');
      if (stars.length < 5) return null;
      const r = stars[v - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, vote);
    if (!box) return false;
    await page.mouse.move(box.x + (Math.random() * 8 - 4), box.y + (Math.random() * 8 - 4), { steps: 12 });
    await sleep(150 + Math.random() * 350);
    await page.evaluate((v) => {
      const stars = document.querySelectorAll('button.group');
      if (stars.length >= 5) stars[v - 1].click();
    }, vote);
    return true;
  } catch { return false; }
}

function resolveVote(persona, titleText, questionNumber) {
  // 1. Taste-bucket vote — baseline phase only (12 questions: init + 11). Sequels in
  //    the live-TMDB phase share substrings with baseline titles ("The Matrix
  //    Reloaded" ⊃ "The Matrix") and must fall through to keywords/default.
  // Window widened 12→18: the engine's baseline now runs until 11 RATED movies, so
  // a skipper's baseline extends past screen 12. Bucket-voting baseline titles for
  // a few extra screens keeps skip-heavy personas expressing their real taste (a
  // missed baseline bucket = a lost taste axis). bucketOf only matches the curated
  // baseline titles, so a stray live sequel in this window voting like its original
  // is harmless.
  const bucket = questionNumber <= 18 ? bucketOf(titleText) : null;
  if (bucket && persona.bucketVotes && persona.bucketVotes[bucket] !== undefined) {
    return persona.bucketVotes[bucket];
  }
  // 2. Keyword taste on live-TMDB titles
  const lovesMatch = (persona.loves || []).some(kw => titleText.includes(kw.toLowerCase()));
  const hatesMatch = (persona.hates || []).some(kw => titleText.includes(kw.toLowerCase()));
  if (lovesMatch && !hatesMatch) return 5;
  if (hatesMatch && !lovesMatch) return 1;
  // 3. Character default
  return persona.defaultVote ?? 3;
}

async function auditPage(context, locale, path) {
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160)); });
  const result = { path, status: 0, consoleErrors: [], textLength: 0, brokenImages: 0, ok: false };
  try {
    const resp = await page.goto(`http://localhost:3000/${locale}${path}`, { waitUntil: 'networkidle2', timeout: 30000 });
    result.status = resp ? resp.status() : 0;
    await sleep(1200);
    const probe = await page.evaluate(() => ({
      textLength: document.body.innerText.trim().length,
      brokenImages: Array.from(document.querySelectorAll('img'))
        .filter(i => i.src && !i.src.startsWith('data:') && i.complete && i.naturalWidth === 0).length,
    }));
    result.textLength = probe.textLength;
    result.brokenImages = probe.brokenImages;
    result.consoleErrors = consoleErrors;
    result.ok = result.status < 400 && probe.textLength > 80 && probe.brokenImages === 0 && consoleErrors.length === 0;
  } catch (e) {
    result.consoleErrors = [...consoleErrors, `NAV_FAIL: ${e.message.slice(0, 120)}`];
  }
  await page.close();
  return result;
}

// ---------- main ----------
async function run() {
  console.log('🎬 CineMind Persona Swarm — 30 hard personas, full-site audit');
  // VISIBLE Chrome — the swarm behaves like a real human in a real tab so
  // findings match what an actual user would see and feel.
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,860', '--window-position=40,40'],
  });

  const results = [];

  for (let i = 0; i < PERSONAS.length; i++) {
    const persona = PERSONAS[i];
    const locale = i % 2 === 0 ? 'he' : 'en';
    const mobile = i % 3 === 0;
    const assignedPages = [SITE_PAGES[(i * 2) % SITE_PAGES.length], SITE_PAGES[(i * 2 + 1) % SITE_PAGES.length]];
    console.log(`\n🎭 [${i + 1}/30] ${persona.name} | ${locale} | ${mobile ? 'mobile' : 'desktop'} | pages: ${assignedPages.join(', ')}`);

    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(mobile ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 });
    const quizConsoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') quizConsoleErrors.push(msg.text().slice(0, 160)); });

    let questionCount = 0;
    let quizComplete = false;
    let finalAffinities = null;
    let finalMovies = [];
    const seenTitles = new Set();
    const duplicateTitles = [];
    const posterBugs = [];
    let lastTitle = '';
    let stuckCycles = 0;
    const trailerBugs = [];
    const ratedAdvanceBugs = []; // NOT_SEEN must never advance the rated clock
    let votesCast = 0;  // real 1–5★ ratings this quiz
    let skipsCast = 0;  // NOT_SEEN clicks this quiz
    let trailersChecked = 0;

    try {
      await page.goto(`http://localhost:3000/${locale}/scan`, { waitUntil: 'networkidle2', timeout: 45000 });

      // Cap raised 45→75: with NOT_SEEN no longer advancing the rated clock,
      // skip-heavy personas legitimately need more screens to reach 40 RATED.
      while (questionCount < 75 && !quizComplete) {
        try {
          await page.waitForSelector('button.group', { timeout: 25000 });
        } catch {
          const done = await page.evaluate(() => !!window.__cinemind_final_affinities);
          if (done) { quizComplete = true; break; }
          break;
        }

        const done = await page.evaluate(() => !!window.__cinemind_final_affinities);
        if (done) { quizComplete = true; break; }

        const probe = await page.evaluate(() => {
          const h3 = document.querySelector('h3');
          const img = document.querySelector('main img');
          return {
            title: h3 ? h3.innerText : '',
            posterLoaded: !!(img && img.complete && img.naturalWidth > 0),
            posterSrc: img ? img.src : '',
          };
        });
        const titleText = probe.title.toLowerCase();
        const titleKey = probe.title.trim();
        if (titleKey && titleKey !== lastTitle) {
          if (seenTitles.has(titleKey)) duplicateTitles.push(titleKey);
          seenTitles.add(titleKey);
        }
        if (titleKey && titleKey === lastTitle) {
          // Same question still on screen — answer didn't register; retry without
          // counting another question.
          questionCount--;
          stuckCycles++;
          if (stuckCycles > 6) { console.log('   stuck on one question — aborting quiz'); break; }
        } else {
          stuckCycles = 0;
        }
        lastTitle = titleKey;
        if (!probe.posterLoaded) {
          // Image may simply still be loading — give it up to 4s before flagging.
          let landed = false;
          for (let w = 0; w < 16; w++) {
            await sleep(500);
            landed = await page.evaluate(() => {
              const img = document.querySelector('main img');
              return !!(img && img.complete && img.naturalWidth > 0);
            });
            if (landed) break;
          }
          if (!landed) posterBugs.push((titleKey || '?') + ' -> ' + probe.posterSrc.slice(0, 80));
        }

        // NOT_SEEN attention-span simulation
        if (persona.notSeenChance && Math.random() < persona.notSeenChance) {
          const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(x => x.innerText.includes('לא ראיתי') || x.innerText.toLowerCase().includes('seen'));
            if (b) { b.click(); return true; }
            return false;
          });
          // Only treat it as a skip when the SKIP button was genuinely clicked. A
          // missed click used to fall back to clicking the 3rd star — a real 3★
          // RATING mislabeled as a skip. If the button isn't on screen this frame,
          // fall through to a normal vote instead of faking the skip.
          if (clicked) { questionCount++; skipsCast++; await humanPause(); continue; }
          // else: skip button absent — fall through to the normal star-vote below.
        }

        // Trailer spot-check: a real user clicks the trailer sometimes. Verify
        // the player opens with a non-empty YouTube embed and closes cleanly.
        if (trailersChecked < 3 && Math.random() < 0.18) {
          const opened = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find(x => x.innerText.includes('טריילר') || x.innerText.toLowerCase().includes('trailer'));
            if (b) { b.click(); return true; }
            return false;
          });
          if (opened) {
            trailersChecked++;
            await sleep(2500);
            const embed = await page.evaluate(() => {
              const f = document.querySelector('iframe[src*="youtube"]');
              return f ? f.getAttribute('src') : null;
            });
            if (!embed || !/embed\/[A-Za-z0-9_-]{6,}/.test(embed)) {
              trailerBugs.push(`${titleKey}: trailer opened but embed invalid (${(embed || 'no iframe').slice(0, 60)})`);
            }
            await page.evaluate(() => {
              const btns = Array.from(document.querySelectorAll('button'));
              const close = btns.find(x => x.innerText.trim() === '✕');
              if (close) close.click();
            });
            await sleep(600);
          }
        }

        const vote = resolveVote(persona, titleText, questionCount + 1);
        questionCount++;
        votesCast++; // a real 1–5★ rating — the only thing that should advance ratedCount
        if (Math.random() < 0.25) await humanScroll(page); // sometimes read the overview first
        const clicked = await humanStarClick(page, vote);
        if (!clicked) {
          await page.evaluate((v) => {
            const stars = document.querySelectorAll('button.group');
            if (stars.length >= 5) stars[v - 1].click();
          }, vote);
        }
        await humanPause();
      }

      // settle + collect finals
      await sleep(2500);
      const finals = await page.evaluate(() => ({
        aff: window.__cinemind_final_affinities || null,
        movies: window.__cinemind_final_movies ? window.__cinemind_final_movies.map(m => ({ id: m.id, title: m.title, trailerId: m.trailerId || '' })) : [],
        ratedCount: window.__cinemind_session ? window.__cinemind_session.ratedCount : null,
      }));
      finalAffinities = finals.aff;
      finalMovies = finals.movies;
      if (finalAffinities) quizComplete = true;
      // Race-free omitted-item invariant (memory: notseen-is-omitted-item): the
      // engine's RATED clock must equal the number of real star-votes we cast —
      // never more. If a NOT_SEEN had advanced ratedCount, finalRated would exceed
      // votesCast. (End-of-quiz check avoids the mid-flight settle races that a
      // per-skip before/after probe suffered.)
      if (finals.ratedCount !== null && finals.ratedCount > votesCast) {
        ratedAdvanceBugs.push(`final ratedCount ${finals.ratedCount} > star-votes cast ${votesCast} (NOT_SEEN advanced the clock)`);
      }
    } catch (e) {
      console.log(`   ❌ quiz flow error: ${e.message.slice(0, 140)}`);
    }
    await page.close();

    // archetype check
    const archetype = finalAffinities ? deriveTaste(finalAffinities).archetype : 'N/A';
    const archetypeMatch = archetype === persona.expected;

    // Final recs trailer coverage
    const recsMissingTrailers = await (async () => {
      try {
        return finalMovies.filter(m => !(m && m.id)).length; // placeholder, refined below
      } catch { return 0; }
    })();

    // personalized recs: 3 movies, not all from the static fallback pool
    const recIds = finalMovies.map(m => String(m.id).replace('res_', ''));
    const personalized = finalMovies.length === 3 && !recIds.every(id => FALLBACK_IDS.has(id));

    // site audit from this persona's angle
    const pageAudits = [];
    for (const p of assignedPages) {
      pageAudits.push(await auditPage(context, locale, p));
    }
    const pagesHealthy = pageAudits.every(a => a.ok);

    const questionsSane = questionCount >= 15 && questionCount <= 75;
    const noQuizErrors = quizConsoleErrors.length === 0;
    const noRatedAdvanceBugs = ratedAdvanceBugs.length === 0;

    const noPosterBugs = posterBugs.length === 0;
    const noDuplicates = duplicateTitles.length === 0;
    const finalsWithTrailers = finalMovies.filter(m => m.trailerId && m.trailerId.length > 5).length;
    const trailersOk = trailerBugs.length === 0 && (finalMovies.length === 0 || finalsWithTrailers >= 2);
    const subscribe = archetypeMatch && quizComplete && personalized && noQuizErrors && pagesHealthy && questionsSane && noPosterBugs && noDuplicates && trailersOk && noRatedAdvanceBugs;
    const reasons = [];
    if (!archetypeMatch) reasons.push(`archetype: got "${archetype}", wanted "${persona.expected}"`);
    if (!quizComplete) reasons.push('quiz never completed');
    if (!personalized) reasons.push(`recs not personalized (${finalMovies.length} movies, ids: ${recIds.join(',')})`);
    if (!noQuizErrors) reasons.push(`quiz console errors: ${quizConsoleErrors.slice(0, 2).join(' | ')}`);
    if (!pagesHealthy) reasons.push(`unhealthy pages: ${pageAudits.filter(a => !a.ok).map(a => `${a.path}[s=${a.status},txt=${a.textLength},img=${a.brokenImages},err=${a.consoleErrors.length}:${a.consoleErrors[0] || ''}]`).join(' ')}`);
    if (!questionsSane) reasons.push(`question count ${questionCount} outside 15-45`);
    if (!noPosterBugs) reasons.push(`broken/placeholder posters: ${posterBugs.slice(0, 3).join(' | ')}`);
    if (!noDuplicates) reasons.push(`duplicate movies in one quiz: ${duplicateTitles.slice(0, 3).join(' | ')}`);
    if (!trailersOk) reasons.push(`trailer issues: ${trailerBugs.slice(0, 2).join(' | ') || `only ${finalsWithTrailers}/3 final recs have trailers`}`);
    if (!noRatedAdvanceBugs) reasons.push(`NOT_SEEN advanced completion: ${ratedAdvanceBugs.slice(0, 2).join(' | ')}`);

    const tp = tasteProfile(finalAffinities);
    console.log(`   ${subscribe ? '✅ SUBSCRIBES' : '❌ CHURNS'} | ${archetype} | Q=${questionCount}${reasons.length ? ' | ' + reasons.join(' ; ') : ''}`);
    console.log(`   🎬 Recommended: ${finalMovies.map(m => m.title).join(', ') || 'none'}`);
    console.log(`   👅 Taste: loves [${tp.loves.join(', ') || '-'}] | hates [${tp.hates.join(', ') || '-'}]`);
    console.log(`   🧬 Niches: loves [${tp.nicheLoves.slice(0, 5).join(', ') || '-'}] | hates [${tp.nicheHates.slice(0, 4).join(', ') || '-'}]`);

    results.push({
      persona: persona.name, locale, viewport: mobile ? 'mobile' : 'desktop',
      pages: assignedPages, questionCount, archetype, expected: persona.expected,
      archetypeMatch, personalized, recs: finalMovies.map(m => m.title),
      trailerBugs, finalsWithTrailers,
      tasteProfile: tasteProfile(finalAffinities),
      finalAffinities,
      quizConsoleErrors, posterBugs, duplicateTitles, ratedAdvanceBugs, pageAudits, subscribe, reasons,
    });

    await context.close();
  }

  await browser.close();

  const subs = results.filter(r => r.subscribe).length;
  const bugs = results.reduce((n, r) => n + r.quizConsoleErrors.length + r.posterBugs.length + r.duplicateTitles.length + r.trailerBugs.length + (r.ratedAdvanceBugs ? r.ratedAdvanceBugs.length : 0) + r.pageAudits.reduce((m, a) => m + a.consoleErrors.length + a.brokenImages + (a.status >= 400 ? 1 : 0), 0), 0);
  const churn = Math.round(((30 - subs) / 30) * 100);


  fs.writeFileSync('persona-swarm-results.json', JSON.stringify(results, null, 2));
  // Human-readable summary: per persona — verdict, archetype, EXACT measured
  // taste (genre axes with strengths), and the movies recommended to them.
  const md = ['# CineMind Persona Swarm — Summary Report', '',
    `**Subscribers: ${subs}/30 | Churn: ${churn}% | Bugs: ${bugs}**`, ''];
  for (const r of results) {
    md.push(`## ${r.subscribe ? '✅' : '❌'} ${r.persona}`);
    md.push(`- Archetype: **${r.archetype}** (expected: ${r.expected}) | ${r.locale} | ${r.viewport} | Q=${r.questionCount}`);
    md.push(`- 👅 Exact taste — loves: ${r.tasteProfile.loves.join(', ') || 'none'}`);
    md.push(`- 🤢 Exact taste — hates: ${r.tasteProfile.hates.join(', ') || 'none'}`);
    md.push(`- 🧬 Sub-genre taste — loves: ${(r.tasteProfile.nicheLoves || []).slice(0, 6).join(', ') || 'none'}`);
    md.push(`- 🎬 Recommended movies: ${r.recs.join(', ') || 'none'}`);
    if (r.reasons.length) md.push(`- ⚠️ Issues: ${r.reasons.join(' ; ')}`);
    md.push('');
  }
  fs.writeFileSync('persona-swarm-report.md', md.join('\n'));
  console.log('\n══════════════════════════════════════════');
  console.log(`📊 Churn: ${churn}% | Bugs: ${bugs} | Subscribers: ${subs}/30`);
  console.log('══════════════════════════════════════════');
}

run().catch(e => { console.error('SWARM FATAL:', e); process.exit(1); });
