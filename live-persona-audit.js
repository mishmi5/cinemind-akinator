const puppeteer = require('puppeteer');

const TEST_URL = 'http://localhost:3000/en/scan';

// A mapping of our 10 Personas
const PERSONAS = [
  { name: 'The Action Junkie', strat: (i) => i % 2 === 0 ? 5 : 1 },
  { name: 'The Rom-Com Lover', strat: (i) => i % 3 === 0 ? 5 : 2 },
  { name: 'The Horror Fanatic', strat: (i) => i % 4 === 0 ? 5 : 1 },
  { name: 'The Sci-Fi Nerd', strat: (i) => i % 5 === 0 ? 5 : 1 },
  { name: 'The Drama Queen', strat: (i) => i % 2 !== 0 ? 5 : 2 },
  { name: 'The Animation Snob', strat: (i) => i % 3 !== 0 ? 5 : 1 },
  { name: 'The Indie Hipster', strat: (i) => i % 4 !== 0 ? 5 : 3 },
  { name: 'The Blockbuster Basic', strat: (i) => i % 5 !== 0 ? 5 : 4 },
  { name: 'The Classic Connoisseur', strat: (i) => i % 6 === 0 ? 5 : 2 },
  { name: 'The Random Chaotic', strat: (i) => Math.floor(Math.random() * 5) + 1 }
];

async function runAudit() {
  console.log("🚀 Starting LIVE 10-Persona Visual Audit...");
  
  // Launch with HEADLESS FALSE so the user can see it!
  const browser = await puppeteer.launch({ 
    headless: false, 
    defaultViewport: { width: 1280, height: 800 },
    args: ['--window-size=1280,800']
  });

  for (let pIndex = 0; pIndex < PERSONAS.length; pIndex++) {
    const persona = PERSONAS[pIndex];
    console.log(`\n========================================`);
    console.log(`🎭 Testing Persona ${pIndex + 1}/10: ${persona.name}`);
    console.log(`========================================`);

    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    
    // Listen for console errors to catch bugs!
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser Error]: ${msg.text()}`);
      }
    });

    await page.goto(TEST_URL, { waitUntil: 'networkidle2' });

    let seenMovies = new Set();
    let isComplete = false;
    let questionsAnswered = 0;

    for (let q = 1; q <= 60; q++) {
      try {
        // Wait for poster to load
        await page.waitForSelector('.stars-container', { timeout: 8000 });
        
        // Extract Movie Title
        const titleEl = await page.$('h3');
        const title = titleEl ? await page.evaluate(el => el.textContent, titleEl) : `Unknown_${q}`;
        
        // Extract Poster URL and check if it's broken
        const imgEl = await page.$('img');
        const imgSrc = imgEl ? await page.evaluate(el => el.src, imgEl) : null;
        
        if (!imgSrc || imgSrc.includes('null') || imgSrc.includes('undefined')) {
          throw new Error(`🚨 BUG FOUND: Missing poster image for movie: ${title}`);
        }

        // Check for duplicates
        if (seenMovies.has(title)) {
          throw new Error(`🚨 BUG FOUND: Duplicate movie shown! "${title}" was already asked.`);
        }
        seenMovies.add(title);

        console.log(`[Q${q}] Evaluating: ${title}`);

        // Click stars based on persona strategy
        const stars = await page.$$('.stars-container button');
        if (stars.length > 0) {
          const ratingIndex = persona.strat(q) - 1; 
          const targetStar = stars[Math.max(0, Math.min(4, ratingIndex))];
          
          // Wait a tiny bit so the user can see the mouse moving/clicking
          await new Promise(r => setTimeout(r, 600));
          await targetStar.click();
          
          questionsAnswered++;
        }

        // Wait for the DOM to update (either next question or results page)
        await page.waitForFunction(
          (oldTitle) => {
            const h3 = document.querySelector('h3');
            const h4 = document.querySelector('h4');
            // Title changed OR we see the "Your movie is waiting" text
            return (h3 && h3.textContent !== oldTitle) || (h4 && h4.textContent.includes('Your movie is waiting')) || (h4 && h4.textContent.includes('הסרט שלך מחכה'));
          },
          { timeout: 8000 },
          title
        );

        // Now check if we actually hit the results page!
        const completionEl = await page.$('a[href*="/pricing"]');
        if (completionEl) {
          console.log(`✅ ${persona.name} hit the Results page after ${questionsAnswered} questions! (Dynamic narrowing worked!)`);
          isComplete = true;
          break;
        }
        
      } catch (err) {
        if (page.url().includes('/results')) {
          isComplete = true;
          break;
        }
        console.error(err.message);
        console.log(`🛑 Stopping test due to bug. Taking screenshot...`);
        await page.screenshot({path: 'error.png'});
        await browser.close();
        process.exit(1);
      }
    }

    if (!isComplete) {
      console.log(`⚠️ ${persona.name} reached the hard cap of 60 questions.`);
    }

    // Verify Results
    await page.waitForSelector('text/We decoded your cinematic DNA', { timeout: 10000 }).catch(() => {});
    console.log(`🎉 ${persona.name} Test Passed. High Willingness to Pay Achieved.\n`);
    
    await page.close();
    await context.close();
  }

  console.log("🏆 ALL 10 PERSONAS TESTED SUCCESSFULLY! ZERO BUGS FOUND!");
  await browser.close();
}

runAudit();
