/**
 * Physical-Chrome trailer repro. Drives /he/scan in a REAL headed Chrome tab, advances a
 * few questions, and at each card checks whether the "watch trailer" button is present —
 * and whether window.__cinemind_session.currentQuestion.movie.trailerId is populated.
 * This is the source-of-truth test (per the physical-Chrome mandate) for the "trailers
 * disappeared" regression. Screenshots each card to trailer-repro-*.png.
 *
 * Usage: node trailer-repro.js
 */
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000/he/scan';
const STEPS = Number(process.env.STEPS || 6);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const page = await browser.newPage({ viewport: { width: 980, height: 720 } });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cinemind_session && window.__cinemind_session.currentQuestion, null, { timeout: 30000 });

  let last = '';
  for (let i = 0; i < STEPS; i++) {
    // wait until a (new) question card is shown
    await page.waitForFunction((prev) => {
      const s = window.__cinemind_session;
      return s && s.currentQuestion && s.currentQuestion.movie && s.currentQuestion.movie.title !== prev;
    }, last, { timeout: 30000 }).catch(() => {});

    const mv = await page.evaluate(() => {
      const s = window.__cinemind_session;
      const m = s && s.currentQuestion && s.currentQuestion.movie;
      return m ? { title: m.title, id: m.id, trailerId: m.trailerId } : null;
    });
    if (!mv) { console.log(`step ${i}: no movie`); break; }
    last = mv.title;

    // Is the trailer button actually in the DOM/visible?
    const btn = page.locator('button', { hasText: 'צפה בטריילר' });
    const btnCount = await btn.count();
    const btnVisible = btnCount ? await btn.first().isVisible().catch(() => false) : false;

    const flag = (!mv.trailerId || !btnVisible) ? '   ⛔ MISSING' : '';
    console.log(`Q${i + 1}: ${mv.title} (id=${mv.id}) trailerId=${JSON.stringify(mv.trailerId)} | button: count=${btnCount} visible=${btnVisible}${flag}`);
    if (flag) await page.screenshot({ path: `trailer-MISSING-${i + 1}.png` }).catch(() => {});

    // advance: vary the rating (cycle 3,4,5,2,4...) to keep exploring deep without an early lock
    const star = [3, 4, 5, 2, 4, 1][i % 6];
    await page.locator('.stars-container button').nth(star - 1).click().catch(() => {});
    await page.waitForTimeout(650);
    if (await page.evaluate(() => window.__cinemind_session && window.__cinemind_session.isComplete)) { console.log(`(completed at step ${i + 1})`); break; }
  }

  console.log('\nDONE. Leaving browser open 4s for visual confirm.');
  await page.waitForTimeout(4000);
  await browser.close();
})();
