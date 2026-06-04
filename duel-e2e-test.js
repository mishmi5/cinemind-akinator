const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
require('dotenv').config({ path: '.env.local' });

// Initialize Firebase Admin to mint tokens
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'cinemind-70cc9'
  });
}

const TEST_URL = 'http://localhost:3000';

async function mintToken(uid) {
  return await admin.auth().createCustomToken(uid);
}

async function runTest() {
  console.log("⚔️ Starting E2E Duel Test...");
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: { width: 1280, height: 800 } });
  
  // PLAYER 1 (Challenger)
  const challengerContext = await browser.createBrowserContext();
  const page1 = await challengerContext.newPage();
  const p1Uid = `test_challenger_${Date.now()}`;
  const p1Token = await mintToken(p1Uid);

  console.log(`[P1] Minted custom token for ${p1Uid}`);

  // Navigate to home to load Firebase JS SDK
  await page1.goto(TEST_URL);
  
  // Expose login function to page
  await page1.evaluate(async (token) => {
    return new Promise((resolve, reject) => {
      import('firebase/auth').then(({ getAuth, signInWithCustomToken }) => {
        const auth = getAuth();
        signInWithCustomToken(auth, token).then(() => resolve()).catch(reject);
      });
    });
  }, p1Token);

  console.log(`[P1] Logged in.`);

  // 1. P1 must run the quiz quickly to get a taste vector
  console.log(`[P1] Running quiz...`);
  await page1.goto(`${TEST_URL}/scan`);
  
  // Answer questions until complete
  let quizComplete = false;
  for (let i = 0; i < 60; i++) {
    try {
      await page1.waitForSelector('.stars-container button', { timeout: 5000 });
      // Click 5 stars
      const stars = await page1.$$('.stars-container button');
      if (stars.length > 4) {
        await stars[4].click();
      }
      await page1.waitForTimeout(1000); // wait for next question

      // Check if we hit the results page
      const url = await page1.url();
      if (url.includes('/results') || await page1.$('text/We decoded your cinematic DNA')) {
        quizComplete = true;
        break;
      }
    } catch (e) {
      const url = page1.url();
      if (url.includes('/results')) quizComplete = true;
      break;
    }
  }

  if (!quizComplete) {
    console.error("[P1] Failed to complete quiz.");
    await browser.close();
    return;
  }

  console.log(`[P1] Quiz completed. Bootstrapping session...`);
  // Give it a moment to call bootstrap
  await page1.waitForTimeout(3000);

  // Go to Duel Lobby
  console.log(`[P1] Creating Duel...`);
  await page1.goto(`${TEST_URL}/duel`);
  
  // Click Create Duel
  await page1.waitForSelector('button');
  const buttons = await page1.$$('button');
  // Find the button with text containing Create
  let createBtn;
  for (const btn of buttons) {
    const text = await page1.evaluate(el => el.textContent, btn);
    if (text.includes('Create')) createBtn = btn;
  }
  
  await createBtn.click();
  
  // Wait for redirect to /duel/[id]/play
  await page1.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log(`[P1] In Duel Play page: ${page1.url()}`);

  // Extract Invite Code
  await page1.waitForSelector('.tracking-\\[0\\.2em\\]'); // The invite code has this class
  const inviteCode = await page1.evaluate(() => {
    return document.querySelector('.tracking-\\[0\\.2em\\]').textContent.trim();
  });

  console.log(`[P1] Generated Invite Code: ${inviteCode}`);

  // PLAYER 2 (Opponent)
  const opponentContext = await browser.createBrowserContext();
  const page2 = await opponentContext.newPage();
  const p2Uid = `test_opponent_${Date.now()}`;
  const p2Token = await mintToken(p2Uid);

  console.log(`[P2] Minted custom token for ${p2Uid}`);
  await page2.goto(TEST_URL);
  
  await page2.evaluate(async (token) => {
    return new Promise((resolve, reject) => {
      import('firebase/auth').then(({ getAuth, signInWithCustomToken }) => {
        const auth = getAuth();
        signInWithCustomToken(auth, token).then(() => resolve()).catch(reject);
      });
    });
  }, p2Token);

  console.log(`[P2] Logged in. Running quiz...`);
  await page2.goto(`${TEST_URL}/scan`);
  
  // Answer questions differently (e.g. 1 star)
  let p2Complete = false;
  for (let i = 0; i < 60; i++) {
    try {
      await page2.waitForSelector('.stars-container button', { timeout: 5000 });
      const stars = await page2.$$('.stars-container button');
      if (stars.length > 0) {
        await stars[0].click(); // 1 star
      }
      await page2.waitForTimeout(1000);
      const url = await page2.url();
      if (url.includes('/results') || await page2.$('text/We decoded your cinematic DNA')) {
        p2Complete = true;
        break;
      }
    } catch (e) {
      if (page2.url().includes('/results')) p2Complete = true;
      break;
    }
  }

  console.log(`[P2] Quiz completed. Waiting for bootstrap...`);
  await page2.waitForTimeout(3000);

  // Go to Duel Lobby
  console.log(`[P2] Joining Duel with code ${inviteCode}...`);
  await page2.goto(`${TEST_URL}/duel`);
  
  // Enter invite code
  await page2.waitForSelector('input[type="text"]');
  await page2.type('input[type="text"]', inviteCode);
  
  // Click Join
  const p2Buttons = await page2.$$('button');
  let joinBtn;
  for (const btn of p2Buttons) {
    const text = await page2.evaluate(el => el.textContent, btn);
    if (text.includes('Join') || text.includes('join')) joinBtn = btn;
  }
  
  await joinBtn.click();
  
  console.log(`[P2] Waiting for navigation...`);
  await page2.waitForNavigation({ waitUntil: 'networkidle2' });
  console.log(`[P2] In Duel Play page: ${page2.url()}`);

  // Wait for AI Roast and Match Result to appear on BOTH pages
  console.log(`Waiting for Duel Finalization (AI Roast)...`);
  await page1.waitForSelector('text/AI Judge Verdict', { timeout: 30000 });
  await page2.waitForSelector('text/AI Judge Verdict', { timeout: 30000 });

  console.log(`✅ Duel completed successfully!`);
  
  await page1.screenshot({ path: 'duel_result_p1.png', fullPage: true });
  await page2.screenshot({ path: 'duel_result_p2.png', fullPage: true });
  
  console.log(`📸 Saved screenshots: duel_result_p1.png, duel_result_p2.png`);

  await browser.close();
  console.log("🏁 E2E Duel Test Finished!");
  process.exit(0);
}

runTest().catch(err => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
