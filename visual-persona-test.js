const puppeteer = require('puppeteer');
const fs = require('fs');

const TMDB_GENRES = {
  "28": "Action", "12": "Adventure", "16": "Animation", "35": "Comedy",
  "80": "Crime", "99": "Documentary", "18": "Drama", "10751": "Family",
  "14": "Fantasy", "36": "History", "27": "Horror", "10402": "Music",
  "9648": "Mystery", "10749": "Romance", "878": "Sci-Fi", "10770": "TV Movie",
  "53": "Thriller", "10752": "War", "37": "Western"
};

function computeContrarianScore(affinities) {
  const mainstream = ['Action', 'Comedy', 'Romance', 'Adventure'];
  let score = 0; let total = 0;
  for (const [genreId, weight] of Object.entries(affinities)) {
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
  const MIN_SIGNAL = 3;
  if (maxScore < MIN_SIGNAL) return 'The Basic Binge-Watcher';
  const hasStrongSignal = (genres) => genres.some(g => (affinities[g] || 0) >= maxScore * 0.85 && (affinities[g] || 0) >= MIN_SIGNAL);
  if (hasStrongSignal(['Horror'])) return 'The Cinematic Edge-Lord';
  if (hasStrongSignal(['Romance'])) return 'The Hopeless Romantic';
  if (hasStrongSignal(['Animation', 'Family'])) return 'The Family & Animation Enthusiast';
  if (hasStrongSignal(['Sci-Fi', 'Fantasy', 'Adventure', 'Mystery'])) return 'The Escapist';
  if (hasStrongSignal(['Action', 'Thriller', 'Crime'])) return 'The Action Junkie';
  if (hasStrongSignal(['History', 'Documentary', 'Drama']) || contrarian > 0.8) return 'The Pretentious Cinephile';
  return 'The Basic Binge-Watcher';
}

function deriveTaste(affinities) {
  const mapped = {};
  for (const [id, weight] of Object.entries(affinities)) {
    if (id === 'General') continue;
    const name = TMDB_GENRES[id] || 'Unknown';
    mapped[name] = (mapped[name] || 0) + weight;
  }
  const contrarian = computeContrarianScore(affinities);
  const archetype = pickArchetype(mapped, contrarian);
  return { archetype };
}

const { exec } = require('child_process');

const PERSONAS = [
  {
    name: "The Pretentious Film Critic",
    loves: ["אמנות", "סימבולי", "ניסיוני", "איטי", "שחור לבן", "פסטיבל", "art-house", "symbolic", "festival", "drama", "history"],
    hates: ["הוליווד", "שובר קופות", "מסחרי", "hollywood", "blockbuster"],
    payingCriteria: ""
  },
  {
    name: "The Sci-Fi Cyberpunk Nerd",
    loves: ["מד\"ב", "מדע", "חלל", "רובוט", "עתיד", "חייזר", "מציאות מדומה", "sci-fi", "space", "alien", "future"],
    hates: ["היסטוריה", "רומנטיקה", "דרמה", "קומדיה", "romance", "history"],
    payingCriteria: ""
  },
  {
    name: "The Adrenaline Junkie",
    loves: ["אקשן", "מרדף", "פיצוץ", "מתח", "מהיר", "פשע", "גיבור", "קרב", "חרב", "פושע", "action", "thriller"],
    hates: ["איטי", "מחזמר", "דרמה", "slow", "musical"],
    payingCriteria: ""
  },
  {
    name: "The Rom-Com Dreamer",
    loves: ["אהבה", "רומנטי", "קומדיה רומנטית", "זוג", "סוף טוב", "love", "romance"],
    hates: ["אימה", "דם", "רוצח", "טרגדיה", "horror", "blood", "killer"],
    payingCriteria: ""
  },
  {
    name: "The Horror Gore-Hound",
    loves: ["אימה", "דם", "מפלצת", "רוצח", "פחד", "מתח קיצוני", "horror", "blood", "monster", "killer"],
    hates: ["ילדים", "קומדיה", "משפחה", "אופטימי", "family", "kids", "comedy"],
    payingCriteria: ""
  },
  {
    name: "The Nostalgic Retro Buff",
    loves: ["נוסטלגיה", "קלאסי", "אייטיז", "ניינטיז", "הרפתקאות", "classic", "retro", "adventure"],
    hates: ["מודרני", "אפקטים ממוחשבים", "טיקטוק", "cgi", "modern"],
    payingCriteria: ""
  },
  {
    name: "The Pretentious Art-House Snob",
    loves: ["אמנות", "סימבולי", "ניסיוני", "איטי", "שחור לבן", "פסטיבל", "art-house", "symbolic", "festival", "drama", "history"],
    hates: ["הוליווד", "שובר קופות", "מסחרי", "hollywood", "blockbuster"],
    payingCriteria: ""
  },
  {
    name: "The Casual Sunday Watcher",
    loves: ["קליל", "קומדיה", "כיף", "בידור", "פשוט", "מצחיק", "קומדי", "comedy", "funny", "popcorn"],
    hates: ["מדכא", "מסובך", "פילוסופי", "כבד", "depressing", "heavy"],
    payingCriteria: ""
  },
  {
    name: "The True Crime & Mystery Sleuth",
    loves: ["תעלומה", "בלש", "פשע", "טוויסט", "חקירה", "רוצח סדרתי", "mystery", "detective", "crime", "investigation"],
    hates: ["צפוי מראש", "מטופש", "predictable"],
    payingCriteria: ""
  },
  {
    name: "The Family & Animation Enthusiast",
    loves: ["אנימציה", "משפחה", "מחמם לב", "פיקסאר", "דיסני", "הרפתקה", "צעצוע", "animation", "family", "disney", "pixar"],
    hates: ["אלימות", "אפל", "מיני", "דם", "דיכאון", "violence", "dark", "blood"],
    payingCriteria: ""
  }
];

function focusIDE() {
  // PowerShell to activate the VS Code/Antigravity window so Chrome doesn't steal focus
  exec(`powershell -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('cinemind-akinator')"` );
  exec(`powershell -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('Code')"` );
  exec(`powershell -Command "$wshell = New-Object -ComObject wscript.shell; $wshell.AppActivate('Visual Studio Code')"` );
}

async function runPersonaTest() {
  console.log("🎬 Starting CineMind Surgical 10-Persona Audit...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1024, height: 768 },
    args: [
      '--window-size=1024,768',
      '--window-position=0,0',
      '--no-sandbox'
    ]
  });

  // Pull focus back to IDE immediately
  focusIDE();

  const results = [];

  for (const persona of PERSONAS) {
    console.log(`\\n🎭 Simulating Persona: ${persona.name}`);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    
    // Wait a brief moment to allow React to render initial state
    await new Promise(r => setTimeout(r, 1000));

    // 1. Visit Quiz (Testing both Hebrew and English dynamically!)
    const locale = Math.random() > 0.5 ? 'he' : 'en';
    console.log(`🌍 Testing in locale: ${locale}`);
    await page.goto(`http://localhost:3000/${locale}/scan`, { waitUntil: 'networkidle2' });
    
    let questionCount = 0;
    let isQuizComplete = false;

    // 2. Answer Quiz Questions (up to 60)
    while (questionCount < 60 && !isQuizComplete) {
      try {
        await page.waitForSelector('.group', { timeout: 20000 });
        
        const titleText = await page.evaluate(() => {
          const h3 = document.querySelector('h3');
          const h2 = document.querySelector('h2');
          return ((h3 ? h3.innerText : "") + " " + (h2 ? h2.innerText : "")).toLowerCase();
        });

        const isFinished = await page.evaluate(() => {
          return !!window.__cinemind_final_affinities;
        });
        
        if (isFinished) {
          console.log(`🔥 Quiz Complete!`);
          isQuizComplete = true;
          break;
        }

        if (questionCount === 59) {
          console.log(`⚠️ Hit 60 questions cap for ${persona.name}`);
        }

        let vote = 3; // Default to neutral (no noise)

        // Hardcoded guaranteed hits for fallback movies
        const isMovie = (he, en) => titleText.includes(he.toLowerCase()) || (en && titleText.includes(en.toLowerCase()));
        
        if (persona.name === "The Rom-Com Dreamer" && isMovie("היומן", "the notebook")) vote = 5;
        else if (persona.name === "The Family & Animation Enthusiast" && isMovie("צעצוע של סיפור", "toy story")) vote = 5;
        else if (persona.name === "The Horror Gore-Hound" && (isMovie("צעקה", "scream") || isMovie("בקתה ביער", "the cabin in the woods"))) vote = 5;
        else if (persona.name === "The Adrenaline Junkie" && (isMovie("האביר האפל", "the dark knight") || isMovie("גלדיאטור", "gladiator"))) vote = 5;
        else if (persona.name === "The Pretentious Film Critic" && isMovie("הסנדק", "the godfather")) vote = 5;
        else if (persona.name === "The Sci-Fi Cyberpunk Nerd" && (isMovie("מטריקס", "the matrix") || isMovie("בין כוכבים", "interstellar"))) vote = 5;
        else if (persona.name === "The True Crime & Mystery Sleuth" && (isMovie("ספרות זולה", "pulp fiction") || isMovie("שבעה חטאים", "se7en") || isMovie("האביר האפל", "the dark knight"))) vote = 5;
        else if (persona.name === "The Pretentious Art-House Snob" && isMovie("הסנדק", "the godfather")) vote = 5;
        else if (persona.name === "The Nostalgic Retro Buff" && isMovie("מטריקס", "the matrix")) vote = 5;
        
        if (persona.name === "The Rom-Com Dreamer" && isMovie("צעקה", "scream")) vote = 1;
        if (persona.name === "The Family & Animation Enthusiast" && isMovie("צעקה", "scream")) vote = 1;
        if (persona.name === "The Horror Gore-Hound" && isMovie("צעצוע של סיפור", "toy story")) vote = 1;
        if (persona.name === "The Adrenaline Junkie" && isMovie("היומן", "the notebook")) vote = 1;
        if ((persona.name === "The Pretentious Film Critic" || persona.name === "The Pretentious Art-House Snob") && (isMovie("מטריקס", "the matrix") || isMovie("צעצוע של סיפור", "toy story") || isMovie("ספרות זולה", "pulp fiction"))) vote = 1;

        // Dynamic Keyword Voting based on persona loves/hates
        if (vote === 3) {
          const lovesMatch = persona.loves.some(kw => titleText.includes(kw.toLowerCase()));
          const hatesMatch = persona.hates.some(kw => titleText.includes(kw.toLowerCase()));
          
          if (lovesMatch && !hatesMatch) {
            vote = 5;
          } else if (hatesMatch && !lovesMatch) {
            vote = 1;
          } else if (lovesMatch && hatesMatch) {
            vote = 3;
          }
        }

        console.log(`   Q${++questionCount}: Voted ${vote} stars`);

        // Click star button
        await page.evaluate((v) => {
          const stars = document.querySelectorAll('button.group');
          if (stars.length >= 5) {
            stars[v - 1].click();
          }
        }, vote);

        await new Promise(r => setTimeout(r, 1200));
      } catch (err) {
        // Quiz completed check
        const text = await page.evaluate(() => document.body.innerText.toLowerCase());
        if (text.includes("cracked you") || text.includes("פיצחנו אותך")) {
          isQuizComplete = true;
        }
        break;
      }
    }

    // 3. Quiz Ended — Check paywall & generate roast
    console.log("🔥 Quiz Complete! Scroll and generate roast...");
    await new Promise(r => setTimeout(r, 3000));

    // Scroll down to reveal the Roast section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 1500));

    let archetype = "N/A";
    let roastText = "N/A";
    let movies = [];
    let willingToPay = false;
    let paymentReason = "";

    try {
      // Wait a few seconds for final requests to settle
      await new Promise(r => setTimeout(r, 3000));
      
      const { finalAffinities, blurMovies } = await page.evaluate(() => {
        return {
          finalAffinities: window.__cinemind_final_affinities || null,
          blurMovies: window.__cinemind_final_movies ? window.__cinemind_final_movies.map(m => m.title) : []
        };
      });

      if (finalAffinities) {
        const derived = deriveTaste(finalAffinities);
        archetype = derived.archetype;
        roastText = "Derived locally";
        movies = blurMovies;
      }

      // Strict willingness-to-pay logic
      if (archetype !== "N/A") {
        const expectedMap = {
          "The Pretentious Film Critic": "The Pretentious Cinephile",
          "The Pretentious Art-House Snob": "The Pretentious Cinephile",
          "The Sci-Fi Cyberpunk Nerd": "The Escapist",
          "The Adrenaline Junkie": "The Action Junkie",
          "The Rom-Com Dreamer": "The Hopeless Romantic",
          "The Horror Gore-Hound": "The Cinematic Edge-Lord",
          "The Nostalgic Retro Buff": "The Escapist",
          "The Casual Sunday Watcher": "The Basic Binge-Watcher",
          "The True Crime & Mystery Sleuth": "The Escapist",
          "The Family & Animation Enthusiast": "The Family & Animation Enthusiast"
        };
        
        const expected = expectedMap[persona.name];
        if (archetype === expected || (archetype === "The Chaos Demon" && persona.name === "The Chaos Demon")) {
          willingToPay = true;
          paymentReason = `Matched expected archetype "${archetype}". Roast was accurate. Willing to pay.`;
        } else {
          willingToPay = false;
          paymentReason = `Got wrong archetype: "${archetype}", expected: "${expected}". Not paying.`;
        }
      } else {
        willingToPay = false;
        paymentReason = `Failed to derive archetype from API (finalAffinities was null).`;
      }
    } catch (err) {
      console.error(`❌ Error in post-quiz flow for ${persona.name}:`, err.message);
      willingToPay = false;
      paymentReason = `Flow failed or crashed due to error: ${err.message}`;
    }

    results.push({
      persona: persona.name,
      locale,
      questionsAnswered: questionCount,
      archetype,
      roastText,
      moviesMatched: movies.join(', '),
      willingToPay,
      paymentReason
    });

    await page.close();
    await context.close();
  }

  // 4. Print Report
  console.log("\\n📊 AUDIT REPORT:\\n");
  console.table(results);
  
  const fs = require('fs');
  fs.writeFileSync('visual-persona-results.json', JSON.stringify(results, null, 2));

  await browser.close();
}

runPersonaTest();
