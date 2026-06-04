const puppeteer = require('puppeteer');

async function verifyTabPosition() {
  console.log("👻 Opening Chrome Ghost Tab...");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1000, height: 800 },
    args: [
      '--window-size=1000,800',
      '--window-position=0,0' // Top left, which should slide it partially behind the IDE if the IDE is centered/right
    ]
  });

  const page = await browser.newPage();
  
  // Navigate to our site just to show something
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  
  console.log("✅ Tab opened. Keeping it open for 15 seconds so the user can verify its position...");
  
  // Keep it open for 15 seconds to allow the user to see and confirm
  await new Promise(res => setTimeout(res, 15000));
  
  await browser.close();
  console.log("👋 Closed tab.");
}

verifyTabPosition().catch(console.error);
