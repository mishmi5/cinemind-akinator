/**
 * CineMind — Surgical 10-Persona Audit (Puppeteer)
 * ------------------------------------------------------------------
 * Drives 10 distinct movie-lover personas through the REAL app:
 *   home → /scan quiz (answer until the engine actually completes) →
 *   paywall (₪9) → reveal recommendations → generate + read roast →
 *   compute a grounded "would they pay 9 NIS?" verdict.
 *
 * It is "surgical" because it does NOT trust the happy path. It:
 *   - waits for anonymous Firebase auth to settle (roast depends on it)
 *   - loops until the engine's OWN completion flag fires (NOT a fixed 20)
 *   - captures every console error, page error, and HTTP >= 400
 *   - flags rate-limit (429) and server (500) responses on the engine API
 *   - records per-persona findings + a final bug summary + JSON report
 *
 * Prereqs: dev server running (npm run dev) on BASE_URL. Puppeteer 25.x
 * is installed locally but NOT declared in package.json — see README note.
 *
 * Run:  node persona-audit.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ───────────────────────────── CONFIG ─────────────────────────────
const CONFIG = {
  BASE_URL: process.env.CINEMIND_URL || 'http://localhost:3000',
  LOCALE: 'he',                 // 'he' (default route, no prefix needed but we use it) or 'en'
  WINDOW: { width: 1280, height: 900, x: 0, y: 0 }, // visible, top-left as requested

  // Run scope. SMOKE=run first N personas. MAX_QUESTIONS caps the loop as a
  // safety net — set high enough to actually COMPLETE (engine needs ~35-45
  // decisive answers to cross the 0.97 confidence threshold).
  PERSONAS_TO_RUN: 10,          // set to 3 for a smoke run
  MAX_QUESTIONS: 70,            // hard cap so a stuck session can't loop forever

  // Willingness-to-pay evaluation mode:
  //   'reveal'  → click the "already elite" bypass, read real recs, judge fit
  //   'paywall' → judge only from the teaser a non-paying user sees
  //   'both'    → record both
  PAY_EVAL_MODE: 'reveal',

  // Pacing. The engine calls GPT-4o per question (slow + costs money) and
  // enforces 50 req/min per IP. Natural latency keeps us under it; this is a
  // floor between answers so we never burst.
  ANSWER_DELAY_MS: 800,
  AUTH_WAIT_MS: 12000,          // max wait for anonymous auth before quiz
  ROAST_WAIT_MS: 20000,         // roast button appears only after bootstrap+Firestore

  SCREENSHOT_DIR: path.join(__dirname, 'test-results', 'persona-audit'),
  HEADLESS: false,              // visible, as requested
  SLOWMO_MS: 0,
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────────────────────── PERSONAS ───────────────────────────
// Each persona scores the on-screen movie (title + overview + the GPT
// question) by keyword. loves → 5★, hates → 1★, otherwise a decisive lean.
// Keywords are bilingual because TMDB returns Hebrew titles/overviews in /he.
// `priceFloor` = how good a fit (0..1) the final recs must be for THIS persona
// to part with ₪9 (price sensitivity differs by archetype).
const PERSONAS = [
  {
    id: 'scifi-action',
    name: 'The Sci-Fi & Action Junkie',
    loves: ['חלל','חללית','פעולה','אקשן','גיבור','קרב','מדע בדיוני','עתיד','רובוט','חייזר','מלחמה','space','action','hero','sci-fi','future','robot','alien','war','battle','superhero'],
    hates: ['רומנטיקה','אהבה','קומדיה רומנטית','דרמה משפחתית','romance','rom-com','romantic','wedding','tearjerker'],
    priceFloor: 0.55,
  },
  {
    id: 'romcom-drama',
    name: 'The Rom-Com & Drama Lover',
    loves: ['אהבה','רומנטיקה','משפחה','חברים','רגש','חתונה','דרמה','romance','love','family','friends','wedding','drama','feel-good','heartwarming'],
    hates: ['אימה','דם','רוצח','פסיכופת','מפלצת','עינויים','horror','gore','blood','killer','slasher','monster','torture'],
    priceFloor: 0.5,
  },
  {
    id: 'horror-gore',
    name: 'The Horror & Gore Fiend',
    loves: ['אימה','דם','רוצח','פסיכופת','מפלצת','שדים','סלאשר','על-טבעי','קללה','horror','gore','blood','killer','slasher','demon','monster','haunted','supernatural','curse'],
    hates: ['ילדים','אנימציה','קומדיה','דיסני','feel-good','children','animation','disney','musical','cheerful'],
    priceFloor: 0.6,
  },
  {
    id: 'arthouse-snob',
    name: 'The Art-House Snob',
    loves: ['פרס','אמנותי','זוכה אוסקר','במאי','קלאסיקה','פסטיבל','שחור לבן','עומק','award','arthouse','oscar','auteur','criterion','festival','existential','masterpiece','slow cinema'],
    hates: ['בלוקבאסטר','סופרגיבור','המשך','מארוול','נפיצות','blockbuster','superhero','sequel','marvel','franchise','popcorn','reboot'],
    priceFloor: 0.7, // hardest to please, picky
  },
  {
    id: 'blockbuster-popcorn',
    name: 'The Blockbuster Popcorn Fan',
    loves: ['בלוקבאסטר','מארוול','סופרגיבור','אקשן','המשך','פיצוצים','כיף','marvel','blockbuster','superhero','franchise','explosions','fun','epic','spectacle'],
    hates: ['איטי','שחור לבן','כתוביות','אמנותי','דוקומנטרי','slow','black and white','subtitles','arthouse','documentary','indie'],
    priceFloor: 0.45, // easy to please
  },
  {
    id: 'comedy-lover',
    name: 'The Comedy Lover',
    loves: ['קומדיה','צחוק','מצחיק','סאטירה','אבסורד','comedy','funny','hilarious','satire','laugh','parody','goofy'],
    hates: ['עצוב','טרגדיה','דיכאוני','אימה','depressing','tragedy','bleak','grief','horror','heavy'],
    priceFloor: 0.5,
  },
  {
    id: 'thriller-mystery',
    name: 'The Thriller & Mystery Buff',
    loves: ['מתח','מסתורין','פשע','בלש','תעלומה','טוויסט','ריגול','thriller','mystery','crime','detective','suspense','twist','noir','heist','spy'],
    hates: ['קומדיה רומנטית','אנימציה לילדים','rom-com','kids animation','musical','slapstick'],
    priceFloor: 0.55,
  },
  {
    id: 'animation-family',
    name: 'The Animation & Family Pick',
    loves: ['אנימציה','פיקסאר','דיסני','ילדים','משפחה','הרפתקה','animation','pixar','disney','kids','family','adventure','wholesome'],
    hates: ['אימה','דם','אלימות קשה','מין','horror','gore','graphic violence','explicit','nsfw'],
    priceFloor: 0.5,
  },
  {
    id: 'classic-buff',
    name: 'The Classic Cinema Buff',
    loves: ['קלאסיקה','שנות ה-','ישן','נואר','היצ׳קוק','אגדה','classic','vintage','golden age','noir','hitchcock','timeless','retro'],
    hates: ['cgi','רימייק','מודרני מדי','טיקטוק','cgi','reboot','too modern','gen z','tiktok'],
    priceFloor: 0.6,
  },
  {
    id: 'indie-international',
    name: 'The Indie & International Explorer',
    loves: ['עצמאי','בינלאומי','זר','קוריאני','צרפתי','ניסיוני','indie','international','foreign','korean','french','japanese','experimental','a24','festival'],
    hates: ['הוליווד','נוסחתי','המשך','מארוול','hollywood','formulaic','sequel','marvel','generic','cash grab'],
    priceFloor: 0.6,
  },
];

// ─────────────────────────── DECISION ENGINE ──────────────────────
// Returns a star 1..5. Decisive by design (mostly 5 or 1) so the engine's
// confidence actually climbs to its 0.97 completion threshold.
function decideStar(persona, text) {
  const t = (text || '').toLowerCase();
  const hits = (arr) => arr.reduce((n, k) => (t.includes(k.toLowerCase()) ? n + 1 : n), 0);
  const love = hits(persona.loves);
  const hate = hits(persona.hates);

  if (love > 0 && hate === 0) return 5;
  if (hate > 0 && love === 0) return 1;
  if (love > hate && love > 0) return 4;
  if (hate > love && hate > 0) return 2;
  // No signal: lean slightly positive but stay decisive-ish so we still
  // converge. Alternate 4/2 to avoid the "unkillable 3" stall.
  return persona._coin = !persona._coin ? 4 : 2;
}

// ─────────────────────────── DOM HELPERS ──────────────────────────
async function getVisibleText(page) {
  return page.evaluate(() => document.body.innerText || '');
}

// Click a star by VALUE (1..5). The stars are `button.group`, rendered
// [1,2,3,4,5] in DOM order inside a dir="ltr" container, so value === index+1.
// handleStarClick reads the numeric value, not the visual position, so this is
// RTL-safe regardless of the cosmetic hover reversal.
async function clickStar(page, value) {
  return page.evaluate((v) => {
    const stars = Array.from(document.querySelectorAll('button.group'));
    if (stars.length >= 5) { stars[v - 1].click(); return true; }
    return false;
  }, value);
}

async function isComplete(page) {
  // Completion UI = the roast generate button OR the paywall "discover" CTA.
  return page.evaluate(() => {
    const roastBtn = document.querySelector('[data-testid="roast-generate-btn"]');
    const roastReveal = document.querySelector('[data-testid="roast-reveal"]');
    const paywall = Array.from(document.querySelectorAll('a')).some((a) =>
      a.textContent && a.textContent.includes('₪9'));
    const crackedHeader = document.body.innerText.includes('✅'); // perfect_match badge
    return Boolean(roastBtn || roastReveal || paywall || crackedHeader);
  });
}

// ─────────────────────────── PERSONA RUN ──────────────────────────
async function runPersona(browser, persona, index) {
  const findings = [];
  const errors = [];
  const netFailures = [];
  const log = (m) => console.log(`   ${m}`);

  // Fresh, isolated context per persona → no asked-movie / auth bleed.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: CONFIG.WINDOW.width, height: CONFIG.WINDOW.height });

  // ---- Surgical telemetry ----
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) =>
    netFailures.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    const url = res.url();
    const status = res.status();
    if (status >= 400) {
      netFailures.push(`HTTP ${status}: ${url}`);
      if (url.includes('/api/next-question')) {
        if (status === 429) findings.push('⚠️ RATE LIMITED (429) on /api/next-question — engine throttled mid-quiz');
        if (status >= 500) findings.push(`🔴 SERVER ERROR (${status}) on /api/next-question`);
      }
    }
  });

  const shot = async (tag) => {
    try {
      await page.screenshot({
        path: path.join(CONFIG.SCREENSHOT_DIR, `${String(index + 1).padStart(2, '0')}-${persona.id}-${tag}.png`),
      });
    } catch {}
  };

  const result = {
    persona: persona.name, id: persona.id,
    questionsAnswered: 0, completed: false,
    finalRecommendations: [], recFitScore: null,
    roastArchetype: null, roastText: null, roastGenres: [],
    roastAvailable: false,
    wouldPay: null, wouldPayReason: '',
    findings, errors: [], netFailures: [],
    durationMs: 0,
  };
  const t0 = Date.now();

  console.log(`\n🎭 [${index + 1}/${PERSONAS.length}] ${persona.name}`);

  // ---- 1. Home, then wait for anonymous auth (roast depends on it) ----
  const home = `${CONFIG.BASE_URL}/${CONFIG.LOCALE}`;
  await page.goto(home, { waitUntil: 'networkidle2' }).catch(() => {});
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });

  // Poll for Firebase anonymous user before starting (best-effort).
  const authReady = await waitForAuth(page, CONFIG.AUTH_WAIT_MS);
  if (!authReady) findings.push('⚠️ Anonymous auth did not settle in time — roast generation may be unavailable');

  // ---- 2. Quiz ----
  await page.goto(`${CONFIG.BASE_URL}/${CONFIG.LOCALE}/scan`, { waitUntil: 'networkidle2' }).catch(() => {});
  await page.waitForSelector('button.group, [data-testid="roast-generate-btn"]', { timeout: 20000 }).catch(() => {
    findings.push('🔴 Quiz never rendered star buttons within 20s');
  });

  let lastMovieSeen = null;
  for (let q = 1; q <= CONFIG.MAX_QUESTIONS; q++) {
    if (await isComplete(page)) { log(`Engine signalled completion after ${q - 1} answers.`); break; }

    const hasStars = await page.evaluate(() => document.querySelectorAll('button.group').length >= 5);
    if (!hasStars) {
      // Either transitioning or stuck. Give it a beat, then re-check.
      await delay(700);
      if (await isComplete(page)) break;
      const stillNoStars = await page.evaluate(() => document.querySelectorAll('button.group').length < 5);
      if (stillNoStars && q > 1) {
        findings.push(`🔴 Stars vanished mid-quiz at Q${q} without completion (possible API failure / stuck state)`);
        break;
      }
      continue;
    }

    const text = await getVisibleText(page);
    const star = decideStar(persona, text);

    // Detect duplicate movie served back-to-back (engine de-dup bug).
    const movieTitle = await page.evaluate(() => {
      const h = document.querySelector('h3.text-3xl, h3.sm\\:text-4xl');
      return h ? h.textContent : null;
    });
    if (movieTitle && movieTitle === lastMovieSeen) {
      findings.push(`⚠️ Same movie ("${movieTitle}") served twice in a row at Q${q} (de-dup leak)`);
    }
    lastMovieSeen = movieTitle;

    const clicked = await clickStar(page, star);
    if (!clicked) { findings.push(`🔴 Could not click stars at Q${q}`); break; }
    result.questionsAnswered = q;
    if (q % 5 === 0) log(`Q${q}: ${star}★ (confidence climbing…)`);

    await delay(CONFIG.ANSWER_DELAY_MS);
  }

  result.completed = await isComplete(page);
  if (!result.completed) {
    findings.push(`🔴 Quiz did NOT complete within ${CONFIG.MAX_QUESTIONS} questions — confidence threshold likely unreachable for this answer pattern`);
  } else {
    log('✅ Reached the result / paywall.');
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('paywall');

  // ---- 3. Paywall-only willingness read (if requested) ----
  let paywallVerdict = null;
  if (result.completed && (CONFIG.PAY_EVAL_MODE === 'paywall' || CONFIG.PAY_EVAL_MODE === 'both')) {
    paywallVerdict = await evaluatePaywallTeaser(page, persona);
  }

  // ---- 4. Reveal real recommendations + judge fit (if requested) ----
  if (result.completed && (CONFIG.PAY_EVAL_MODE === 'reveal' || CONFIG.PAY_EVAL_MODE === 'both')) {
    const revealed = await revealRecommendations(page);
    if (!revealed) {
      findings.push('⚠️ Could not find the "already elite" bypass button to reveal recommendations');
    } else {
      await delay(1500);
      await shot('revealed');
      result.finalRecommendations = await readRecommendations(page);
      if (result.finalRecommendations.length === 0) {
        findings.push('🔴 Quiz completed but ZERO final recommendations rendered');
      }
      const fit = scoreFit(persona, result.finalRecommendations);
      result.recFitScore = fit.score;
      if (fit.mismatch) {
        findings.push(`🔴 ENGINE MISMATCH: ${persona.name} got recs that read as "${fit.evidence}" (fit ${(fit.score * 100).toFixed(0)}%)`);
      }
    }
  }

  // ---- 5. Roast ----
  if (result.completed) {
    const roast = await generateAndReadRoast(page, findings);
    result.roastAvailable = roast.available;
    result.roastArchetype = roast.archetype;
    result.roastText = roast.text;
    result.roastGenres = roast.genres;
    if (roast.available) await shot('roast');
  }

  // ---- 6. Would they pay ₪9? ----
  const pay = decideWouldPay(persona, result, paywallVerdict);
  result.wouldPay = pay.verdict;
  result.wouldPayReason = pay.reason;

  // Collect telemetry
  result.errors = errors.slice(0, 25);
  result.netFailures = dedupe(netFailures).slice(0, 25);
  result.findings = findings;
  result.durationMs = Date.now() - t0;

  log(`💰 Would pay ₪9? ${pay.verdict ? 'YES' : 'NO'} — ${pay.reason}`);
  if (errors.length) log(`🐞 ${errors.length} console/page errors captured`);
  if (result.netFailures.length) log(`🌐 ${result.netFailures.length} network failures captured`);

  await context.close();
  return result;
}

// ───────────────────── sub-routines ───────────────────────────────
async function waitForAuth(page, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const ready = await page.evaluate(() => {
      // Firebase stores the anonymous user in IndexedDB/localStorage under a
      // firebase:authUser:* key once signInAnonymously resolves.
      try {
        return Object.keys(localStorage).some((k) => k.startsWith('firebase:authUser:'));
      } catch { return false; }
    });
    if (ready) return true;
    await delay(500);
  }
  return false;
}

async function evaluatePaywallTeaser(page, persona) {
  return page.evaluate(() => {
    const body = document.body.innerText;
    const matchBadge = (body.match(/(\d{1,3})%/) || [])[1] || null;
    const hasPrice = body.includes('₪9');
    return { matchBadge, hasPrice, teaser: body.slice(0, 400) };
  });
}

async function revealRecommendations(page) {
  // The bypass is the only <button> in the completed view with `underline`
  // (the "already elite — login_test" link). Anchors are the paid CTAs.
  return page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.className.includes('underline'));
    if (btn) { btn.click(); return true; }
    return false;
  });
}

async function readRecommendations(page) {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('h3.text-4xl, h3.md\\:text-5xl'));
    const titles = cards
      .map((h) => (h.textContent || '').trim())
      .filter((t) => t && !t.includes('_'));
    // Match scores
    const scores = Array.from(document.querySelectorAll('div'))
      .map((d) => d.textContent || '')
      .filter((t) => /\d{1,3}% /.test(t) && t.length < 40);
    return Array.from(new Set(titles)).map((title, i) => ({ title, score: scores[i] || null }));
  });
}

async function generateAndReadRoast(page, findings) {
  const out = { available: false, archetype: null, text: null, genres: [] };
  // Scroll the roast section into view.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const btn = await page.$('[data-testid="roast-generate-btn"]');
  if (!btn) {
    findings.push('⚠️ Roast generate button never appeared (no tasteVector → Firebase not configured or bootstrap failed)');
    return out;
  }
  await btn.click();
  const ready = await page
    .waitForSelector('[data-testid="roast-reveal-ready"]', { timeout: CONFIG.ROAST_WAIT_MS })
    .then(() => true)
    .catch(() => false);
  if (!ready) {
    findings.push('🔴 Clicked roast generate but card never became ready (createCard / API failure)');
    return out;
  }
  out.available = true;
  const data = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="roast-reveal-ready"]');
    if (!root) return {};
    const archetype = root.querySelector('.rounded-full')?.textContent?.trim() || null;
    const text = root.querySelector('p.italic')?.textContent?.trim() || null;
    const genres = Array.from(root.querySelectorAll('.flex-wrap span')).map((s) => s.textContent.trim());
    return { archetype, text, genres };
  });
  Object.assign(out, data);
  if (!out.archetype) findings.push('⚠️ Roast card rendered but archetype was empty');
  return out;
}

// ───────────────────── scoring / verdict ──────────────────────────
function scoreFit(persona, recs) {
  if (!recs.length) return { score: 0, mismatch: true, evidence: 'no recommendations' };
  const blob = recs.map((r) => `${r.title} ${r.score || ''}`).join(' ').toLowerCase();
  const love = persona.loves.reduce((n, k) => (blob.includes(k.toLowerCase()) ? n + 1 : n), 0);
  const hate = persona.hates.reduce((n, k) => (blob.includes(k.toLowerCase()) ? n + 1 : n), 0);
  // Titles alone are a weak signal (no genre tags in DOM), so this is a
  // heuristic: explicit hate-keyword presence is the strongest red flag.
  const score = Math.max(0, Math.min(1, 0.5 + 0.2 * love - 0.35 * hate));
  return { score, mismatch: hate > love, evidence: blob.slice(0, 120) };
}

function decideWouldPay(persona, result, paywallVerdict) {
  // Hard blockers: if the core experience is broken, nobody pays.
  if (!result.completed)
    return { verdict: false, reason: 'never reached a recommendation — funnel broken' };
  if (result.findings.some((f) => f.startsWith('🔴')))
    return { verdict: false, reason: 'hit a blocking bug during the run (see findings)' };

  // Fit-driven (reveal mode): does the engine actually understand the persona?
  if (result.recFitScore != null) {
    const pass = result.recFitScore >= persona.priceFloor;
    return {
      verdict: pass,
      reason: pass
        ? `recs fit taste (${(result.recFitScore * 100).toFixed(0)}% ≥ floor ${(persona.priceFloor * 100).toFixed(0)}%)` +
          (result.roastAvailable ? ' + roast landed' : ' (roast missing — minor)')
        : `recs missed taste (${(result.recFitScore * 100).toFixed(0)}% < floor ${(persona.priceFloor * 100).toFixed(0)}%)`,
    };
  }

  // Paywall-only mode: judge on teaser strength.
  if (paywallVerdict) {
    const strong = Number(paywallVerdict.matchBadge) >= 90 && paywallVerdict.hasPrice;
    return {
      verdict: strong,
      reason: strong
        ? `compelling teaser (${paywallVerdict.matchBadge}% match + clear ₪9 ask)`
        : 'teaser not convincing enough to convert',
    };
  }

  return { verdict: false, reason: 'no evaluation data captured' };
}

// ───────────────────── util ───────────────────────────────────────
const dedupe = (arr) => Array.from(new Set(arr));

function printReport(results) {
  console.log('\n\n══════════════════ SURGICAL AUDIT REPORT ══════════════════');
  const paid = results.filter((r) => r.wouldPay).length;
  const completed = results.filter((r) => r.completed).length;
  const totalErrors = results.reduce((n, r) => n + r.errors.length, 0);
  const totalNet = results.reduce((n, r) => n + r.netFailures.length, 0);
  const blocking = results.flatMap((r) =>
    r.findings.filter((f) => f.startsWith('🔴')).map((f) => `[${r.id}] ${f}`));
  const warnings = results.flatMap((r) =>
    r.findings.filter((f) => f.startsWith('⚠️')).map((f) => `[${r.id}] ${f}`));

  console.log(`Personas run:        ${results.length}`);
  console.log(`Completed quiz:      ${completed}/${results.length}`);
  console.log(`Would pay ₪9:        ${paid}/${results.length}`);
  console.log(`Console/page errors: ${totalErrors}`);
  console.log(`Network failures:    ${totalNet}`);

  console.log(`\n── Per persona ──`);
  for (const r of results) {
    console.log(
      `${r.wouldPay ? '💰' : '🚫'} ${r.persona.padEnd(34)} ` +
      `Q:${String(r.questionsAnswered).padStart(2)} ` +
      `fit:${r.recFitScore != null ? (r.recFitScore * 100).toFixed(0) + '%' : ' n/a'} ` +
      `roast:${r.roastAvailable ? '✓' : '✗'} ` +
      `err:${r.errors.length} net:${r.netFailures.length} — ${r.wouldPayReason}`);
  }

  if (blocking.length) {
    console.log(`\n🔴 BLOCKING BUGS (${blocking.length}):`);
    dedupe(blocking).forEach((b) => console.log(`   ${b}`));
  }
  if (warnings.length) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
    dedupe(warnings).forEach((w) => console.log(`   ${w}`));
  }
  if (!blocking.length && !warnings.length) console.log('\n🟢 No bugs surfaced. Suspiciously clean — verify the run actually completed.');

  const reportPath = path.join(CONFIG.SCREENSHOT_DIR, 'audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ config: CONFIG, results }, null, 2));
  console.log(`\n📄 Full JSON report: ${reportPath}`);
  console.log(`🖼️  Screenshots:     ${CONFIG.SCREENSHOT_DIR}`);
  console.log('════════════════════════════════════════════════════════════\n');
}

// ───────────────────── main ───────────────────────────────────────
(async () => {
  console.log('🎬 CineMind Surgical Persona Audit starting…');
  console.log(`   Target: ${CONFIG.BASE_URL}/${CONFIG.LOCALE}  |  mode: ${CONFIG.PAY_EVAL_MODE}  |  personas: ${CONFIG.PERSONAS_TO_RUN}`);
  fs.mkdirSync(CONFIG.SCREENSHOT_DIR, { recursive: true });

  // Preflight: is the dev server up?
  const browser = await puppeteer.launch({
    headless: CONFIG.HEADLESS,
    slowMo: CONFIG.SLOWMO_MS,
    defaultViewport: null,
    args: [
      `--window-size=${CONFIG.WINDOW.width},${CONFIG.WINDOW.height}`,
      `--window-position=${CONFIG.WINDOW.x},${CONFIG.WINDOW.y}`,
    ],
  });

  try {
    const probe = await browser.newPage();
    const ok = await probe.goto(CONFIG.BASE_URL, { waitUntil: 'domcontentloaded', timeout: 8000 })
      .then(() => true).catch(() => false);
    await probe.close();
    if (!ok) {
      console.error(`\n🔴 Could not reach ${CONFIG.BASE_URL}. Start the dev server first: npm run dev\n`);
      await browser.close();
      process.exit(1);
    }

    const results = [];
    const toRun = PERSONAS.slice(0, CONFIG.PERSONAS_TO_RUN);
    for (let i = 0; i < toRun.length; i++) {
      try {
        results.push(await runPersona(browser, toRun[i], i));
      } catch (err) {
        console.error(`   🔴 Persona crashed: ${err.message}`);
        results.push({
          persona: toRun[i].name, id: toRun[i].id, completed: false,
          findings: [`🔴 Harness crash: ${err.message}`], errors: [], netFailures: [],
          wouldPay: false, wouldPayReason: 'harness crash', questionsAnswered: 0,
          finalRecommendations: [], roastAvailable: false,
        });
      }
    }

    printReport(results);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
