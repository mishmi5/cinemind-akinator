const puppeteer = require('puppeteer');

const delay = ms => new Promise(res => setTimeout(res, ms));

(async () => {
  console.log("👻 GHOST AUTOMATION INITIATED - VISUAL TEST 👻");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--window-position=-1920,0' // Force to second monitor on the left
    ]
  });
  
  const page = await browser.newPage();
  
  // Telemetry: Listen to all network responses to track the bootstrap request
  page.on('response', response => {
    if (response.url().includes('/api/user/bootstrap')) {
      console.log(`📡 [NETWORK] /api/user/bootstrap answered with status: ${response.status()}`);
    }
  });
  
  page.on('console', msg => console.log('💻 [BROWSER]', msg.text()));
  page.on('pageerror', err => console.log('🚨 [BROWSER ERROR]', err.message));

  console.log("Navigating to http://localhost:3000/he/scan");
  
  try {
    await page.goto('http://localhost:3000/he/scan', { waitUntil: 'networkidle2' });
  } catch (e) {
    console.log("Error navigating. Is the server running?");
    await browser.close();
    return;
  }
  
  console.log("Answering quiz automatically...");
  
  let isComplete = false;
  let attempts = 0;
  
  while (!isComplete && attempts < 100) {
    attempts++;
    try {
      // Look for the new data-testid hook
      const roastCta = await page.$('[data-testid="roast-generate-btn"]');
      
      if (roastCta) {
        console.log("🔥 Roast CTA found! Quiz is complete.");
        isComplete = true;
        
        await delay(2000); // Let the user see the complete screen
        
        console.log("Clicking Roast CTA...");
        await roastCta.click();
        
        console.log("Waiting for generation...");
        // Wait for ShareBar
        await page.waitForSelector('button svg.lucide-share-2', { timeout: 15000 });
        
        console.log("✅ Card generated and Share button appeared! Visual test successful.");
        console.log('👀 Waiting 10 seconds for you to admire the result...');
        await delay(10000);
        break;
      }
      
      // If not complete, answer the question.
      const stars = await page.$$('button:not([disabled]) svg[viewBox="0 0 24 24"]');
      if (stars.length >= 5) {
        await stars[4].click();
        console.log(`Clicked star 5. Attempt ${attempts}`);
        await delay(1200); // wait for request and animation to settle
      } else {
        await delay(500);
      }
      
    } catch (e) {
      console.log("Waiting...", e.message);
      await delay(1000);
    }
  }

  if (!isComplete) {
    console.log("❌ Failed to reach the end of the quiz.");
  }
  
  console.log("Closing browser...");
  await browser.close();
})();
