export const MICRO_GENRES: Record<string, { he: string[]; en: string[]; parent: number }> = {
  parody: {
    he: ['פרודיה', 'פארודיה', 'סאטירה', 'גרסה עוקצנית', 'מטורלל', 'שטויות', 'מת לצעוק', 'האקדח מת מצחוק', 'טיסה נעימה', 'ג\'וני אינגליש', 'זומבילנד', 'מת על המתים', 'סופרהירו', 'דיקטטור', 'בוראט', 'קיק אס', 'קיק-אס', 'פרודי', 'פארודי', 'לגו', 'גברים בגטקעס', 'מגוחך', 'מטופש', 'שטותי', 'סאטירי', 'סלפסטיק', 'לסלי נילסן', 'אוסטין פאוורס', 'הוט שוטס'],
    en: ['parody', 'parodies', 'satire', 'satirical', 'spoof', 'spoofs', 'mockumentary', 'talking heads', 'interview style', 'slapstick', 'funny', 'hilarious', 'goofy', 'farce', 'lampoon', 'scary movie', 'naked gun', 'airplane!', 'johnny english', 'zombieland', 'shaun of the dead', 'superhero movie', 'dictator', 'borat', 'kick-ass', 'robin hood: men in tights', 'spinal tap', 'waiting for guffman', 'best in show', 'christopher guest', 'austin powers', 'hot shots', 'silly'],
    parent: 35 // Comedy
  },
  psych_thriller: {
    he: ['פסיכולוגי', 'מתח פסיכולוגי', 'טוויסט', 'תעלומה', 'מסתורין', 'שאטר איילנד', 'מועדון קרב', 'שבעה חטאים', 'התחלה', 'פסיכופת', 'סכיזופרניה', 'הזיה', 'מציאות', 'תת מודע', 'חלום', 'זיכרון', 'חוקר', 'חקירה', 'בלש', 'מוח', 'נפש', 'נפשי', 'מבלבל', 'שאטר איילנד', 'מועדון קרב', 'החשוד המיידי'],
    en: ['psychological', 'thriller', 'mind-bending', 'twist', 'mystery', 'shutter island', 'fight club', 'se7en', 'inception', 'psychopath', 'schizophrenia', 'hallucination', 'delusion', 'paranoia', 'subconscious', 'dream', 'memory', 'detective', 'investigation', 'brain', 'mind', 'confusing', 'usual suspects', 'memento'],
    parent: 53 // Thriller
  },
  hard_scifi: {
    he: ['מדע בדיוני קשה', 'חלל', 'חללית', 'אסטרונאוט', 'פיזיקה', 'בין כוכבים', 'פרויקט הייל מרי', 'המאדים', 'מפגש', 'גלקסיה', 'כוכב לכת', 'כוכבים', 'חלל החיצון', 'נאס"א', 'מסע בזמן', 'יקומים מקבילים', 'עתידני', 'חייזר', 'חייזרים', 'חלליות', 'מדע בדיוני'],
    en: ['hard sci-fi', 'space', 'spaceship', 'astronaut', 'physics', 'interstellar', 'project hail mary', 'martian', 'arrival', 'galaxy', 'planet', 'stars', 'outer space', 'nasa', 'time travel', 'parallel universes', 'futuristic', 'alien', 'aliens', 'spaceships', 'science fiction', 'cosmos', 'orbit'],
    parent: 878 // Sci-Fi
  },
  classic_noir: {
    he: ['קלאסיקה', 'ישן', 'נואר', 'שחור לבן', 'חלון אחורי', 'הסנדק', 'שבעת הסמוראים', 'היצ\'קוק', 'פילם נואר', 'הבלש', 'חוקר פרטי', 'פשע מאורגן', 'מאפיה', 'שנות ה-50', 'שנות ה-40', 'קלאסי', 'ורטיגו', 'פסיכו', 'האזרח קיין', 'קזבלנקה', '12 המושבעים', 'הטוב הרע והמכוער'],
    en: ['classic', 'vintage', 'noir', 'film noir', 'black and white', 'rear window', 'godfather', 'seven samurai', 'hitchcock', 'detective', 'private eye', 'organized crime', 'mafia', 'mob', '1950s', '1940s', 'vertigo', 'psycho', 'citizen kane', 'casablanca', '12 angry men', 'good the bad and the ugly'],
    parent: 80 // Crime / Drama
  },
  slasher_horror: {
    he: ['דם', 'רוצח', 'מפלצת', 'סלאשר', 'מסור', 'צעקה', 'בקתה ביער', 'הנוסע השמיני', 'על-טבעי', 'שדים', 'אימה', 'רוחות', 'חטיפה', 'סיוט', 'רצח', 'רוצח סדרתי', 'רוצחים', 'קצבים', 'דם ותימרות עשן', 'ערפד', 'ערפדים', 'זומבי', 'זומבים', 'רדיפה', 'רודף'],
    en: ['blood', 'bloody', 'killer', 'monster', 'slasher', 'saw', 'scream', 'cabin in the woods', 'alien', 'supernatural', 'demons', 'horror', 'ghosts', 'kidnapping', 'nightmare', 'murder', 'serial killer', 'killers', 'butcher', 'vampire', 'vampires', 'zombie', 'zombies', 'haunting', 'chase'],
    parent: 27 // Horror
  },
  arthouse_oscar: {
    he: ['דרמה איכותית', 'זוכה אוסקר', 'רשימת שינדלר', 'חומות של תקווה', 'פרזיטים', 'לה לה לנד', 'פסטיבל קאן', 'מופת', 'עומק', 'אוסקר', 'דרמה רגשית', 'קולנוע עצמאי', 'במאי', 'מועמד לאוסקר', 'נוגע ללב', 'מרגש', 'כאב', 'התמודדות', 'אובדן', 'מערכת יחסים', 'חיים יפים', 'פורסט גאמפ'],
    en: ['quality drama', 'oscar winner', 'schindler\'s list', 'shawshank redemption', 'parasite', 'la la land', 'cannes festival', 'masterpiece', 'depth', 'oscar', 'emotional drama', 'indie', 'independent film', 'director', 'oscar nominee', 'touching', 'moving', 'pain', 'coping', 'loss', 'relationship', 'life is beautiful', 'forrest gump'],
    parent: 18 // Drama
  },
  kids_magic: {
    he: ['קסם', 'ילדים', 'אנימציה', 'דיסני', 'פיקסאר', 'המסע המופלא', 'מלך האריות', 'אנקאנטו', 'שרק', 'הרפתקה', 'משפחה', 'לכל המשפחה', 'צעצועים', 'חברות', 'חמוד', 'צבעוני', 'מצויר', 'דמויות מצוירות', 'לשבור את הקרח', 'מוצאים את נמו', 'בת הים הקטנה', 'אלאדין'],
    en: ['magic', 'kids', 'children', 'animation', 'animated', 'disney', 'pixar', 'spirited away', 'lion king', 'encanto', 'shrek', 'adventure', 'family', 'toys', 'friendship', 'cute', 'colorful', 'cartoon', 'frozen', 'finding nemo', 'little mermaid', 'aladdin'],
    parent: 16 // Animation
  },
  dystopian: {
    he: ['דיסטופיה', 'סייברפאנק', 'עתיד קודר', 'בינה מלאכותית', 'מטריקס', 'בלייד ראנר', 'רכבת הקרח', 'רובוטים', 'טכנולוגיה', 'שליטה', 'משטר', 'עולם פוסט', 'פוסט-אפוקליפטי', 'שורדים', 'הישרדות', 'רובוט', 'מקס הזועם', 'שליחות קטלנית', 'טרמינייטור'],
    en: ['dystopia', 'dystopian', 'cyberpunk', 'dark future', 'artificial intelligence', 'matrix', 'blade runner', 'snowpiercer', 'robots', 'technology', 'control', 'regime', 'post-apocalyptic', 'survivors', 'survival', 'robot', 'mad max', 'terminator'],
    parent: 878 // Sci-Fi
  },
  fast_action: {
    he: ['מהיר', 'מרדף', 'פיצוצים', 'אקשן טהור', 'ג\'ון וויק', 'קראנק', 'מרוץ קטלני', 'אדרנלין', 'יריות', 'קרבות', 'לחימה', 'אומנויות לחימה', 'סוכן חשאי', 'נקמה', 'נקמת', 'סרט פעולה', 'מתח ופעולה', 'מהיר ועצבני', 'מת לחיות', 'רובוטריקים', 'בלתי נשכחים', 'מרדף מכוניות'],
    en: ['fast', 'chase', 'explosions', 'pure action', 'john wick', 'crank', 'death race', 'adrenaline', 'shootout', 'battles', 'fighting', 'martial arts', 'secret agent', 'revenge', 'action movie', 'action thriller', 'fast and furious', 'die hard', 'transformers', 'expendables', 'car chase'],
    parent: 28 // Action
  },
  foreign_taboo: {
    he: ['נועז', 'פרובוקטיבי', 'טאבו', 'אינטימיות', 'הטנגו האחרון בפריז', 'קליגולה', 'סרט זר', 'קולנוע זר', 'מחוץ למיינסטרים', 'אקספרימנטלי', 'ניסיוני', 'ניסיוני-קולנועי', 'ארוטי', 'מיני', 'עירום', 'עירום מלא', 'קולנוע צרפתי', 'קולנוע איטלקי', 'קולנוע ספרדי', 'קולנוע יפני'],
    en: ['bold', 'provocative', 'taboo', 'intimacy', 'last tango in paris', 'caligula', 'foreign movie', 'foreign cinema', 'off-mainstream', 'experimental', 'sensual', 'erotic', 'sexual', 'nudity', 'naked', 'french cinema', 'italian cinema', 'spanish cinema', 'japanese cinema'],
    parent: 18 // Drama
  },
  high_fantasy: {
    he: ['פנטזיה', 'קסם', 'שר הטבעות', 'הוביט', 'דרקון', 'דרקונים', 'חרב', 'חרבות', 'ממלכה', 'אלף', 'קוסם', 'מסע', 'אימפריה', 'כישוף'],
    en: ['fantasy', 'magic', 'lord of the rings', 'hobbit', 'dragon', 'dragons', 'sword', 'swords', 'kingdom', 'elf', 'elves', 'wizard', 'wizards', 'quest', 'empire', 'spell'],
    parent: 14 // Fantasy
  },
  slow_cinema: {
    he: ['סולאריס', 'סטוקר', 'מראה', 'טרקובסקי', 'קולנוע איטי', 'מדיטטיבי', 'בלה טאר', 'לשוטות ארוכות', 'שקט', 'עמוק', 'קולנוע אמנותי', 'קונטמפלטיבי'],
    en: ['solaris', 'stalker', 'mirror', 'tarkovsky', 'slow cinema', 'meditative', 'bela tarr', 'angelopoulos', 'long take', 'contemplative', 'deliberate', 'minimal dialogue', 'art house', 'bergman', 'godard', 'antonioni'],
    parent: 18 // Drama
  },
  body_horror: {
    he: ['גוף', 'טרנספורמציה', 'מוטציה', 'בשר', 'ויראלי', 'קרוננברג', 'הזבוב', 'וידאודרום', 'אנהיליישן', 'פלישה', 'טפיל'],
    en: ['body horror', 'transformation', 'mutation', 'flesh', 'viral', 'cronenberg', 'the fly', 'videodrome', 'existenz', 'the thing', 'tetsuo', 'annihilation', 'parasite', 'invasion', 'biological', 'organic horror'],
    parent: 27 // Horror
  },
  musical: {
    he: ['מחזמר', 'שירה', 'ריקוד', 'ברודווי', 'לס מיז', 'שיקגו', 'וסט סייד', 'מוזיקלי', 'שירים', 'להקה', 'קוריאוגרפיה', 'מאמא מיה'],
    en: ['musical', 'singing', 'dancing', 'broadway', 'les miserables', 'chicago', 'la la land', 'west side story', 'greatest showman', 'mamma mia', 'grease', 'hamilton', 'cabaret', 'dream girls', 'choreography', 'showstopper'],
    parent: 10402 // Music
  },
  nordic_noir: {
    he: ['סקנדינבי', 'שוודי', 'דני', 'נורווגי', 'הגשר', 'הרוצח', 'מילניום', 'ליזבט', 'קר', 'אפלולי', 'נורדי', 'סקנדינביה'],
    en: ['nordic', 'swedish', 'danish', 'norwegian', 'icelandic', 'the bridge', 'the killing', 'millennium', 'lisbeth salander', 'girl with dragon tattoo', 'wallander', 'borgen', 'scandinavian', 'cold case', 'fjord'],
    parent: 80 // Crime
  },
  blaxploitation: {
    he: ['בלקספלויטיישן', 'שנות ה-70', 'פאנק', 'סופרפליי', 'שאפט', 'פוקסי בראון', 'טראש', 'גריינדהאוס', 'קאלט', 'גריינדהאוז', 'פאם גריר'],
    en: ['blaxploitation', '1970s', 'funk', 'superfly', 'shaft', 'foxy brown', 'grindhouse', 'exploitation', 'b-movie', 'quentin tarantino', 'pam grier', 'cult classic', 'drive-in', 'blacksploitation', 'coffy'],
    parent: 28 // Action
  }
};

/**
 * Genre-ID → micro-genre fallback table.
 * When text matching fails (English overview, no Hebrew translation),
 * we derive micro-genre tags from TMDB genre IDs which are always present.
 */
const GENRE_ID_MICRO_MAP: Array<{ ids: number[]; tag: string; minRating?: number; maxRating?: number }> = [
  { ids: [27, 35], tag: 'parody' },          // Comedy-Horror → often spoof/parody
  { ids: [27, 878], tag: 'body_horror' },    // Horror + Sci-Fi → body horror territory
  { ids: [27], tag: 'slasher_horror' },      // Horror alone
  { ids: [53], tag: 'psych_thriller' },      // Thriller
  { ids: [878, 12], tag: 'hard_scifi' },     // Sci-Fi + Adventure
  { ids: [878], tag: 'hard_scifi' },         // Sci-Fi alone
  { ids: [878], tag: 'dystopian' },          // Sci-Fi can also be dystopian
  { ids: [18], tag: 'arthouse_oscar', minRating: 7.5 }, // High-rated Drama
  { ids: [18], tag: 'arthouse_oscar', minRating: 6.8 },  // Emotional drama (tearjerker territory)
  { ids: [18, 80], tag: 'classic_noir' },    // Crime Drama (HIGHEST priority for Crime+Drama combos)
  { ids: [80, 53], tag: 'classic_noir' },    // Crime + Thriller → classic noir/detective
  { ids: [80, 9648], tag: 'classic_noir' },  // Crime + Mystery → whodunit/detective
  { ids: [80], tag: 'classic_noir' },        // Crime alone
  { ids: [80], tag: 'nordic_noir' },         // Crime also maps to nordic_noir (via text matching mostly)
  { ids: [16, 10751], tag: 'kids_magic' },   // Animation + Family
  { ids: [16], tag: 'kids_magic' },          // Animation alone
  { ids: [28, 12], tag: 'fast_action' },     // Action + Adventure
  { ids: [28], tag: 'fast_action' },         // Action alone
  { ids: [18, 36], tag: 'arthouse_oscar' },  // Drama + History
  // NOTE: removed { ids: [10749], tag: 'foreign_taboo' } — Romance alone does NOT mean foreign/taboo.
  // foreign_taboo is now TEXT-ONLY (via MICRO_GENRES keywords) to prevent contamination of Classic Noir persona.
  { ids: [18, 10749], tag: 'arthouse_oscar', minRating: 7.0 }, // High-rated Romance Drama → arthouse
  { ids: [14], tag: 'high_fantasy' },        // Fantasy
  { ids: [10402], tag: 'musical' },          // Music genre
  { ids: [10402, 18], tag: 'musical' },      // Music + Drama = musical film
  { ids: [10402, 35], tag: 'musical' },      // Music + Comedy = musical comedy
  { ids: [99], tag: 'arthouse_oscar', minRating: 7.0 }, // High-quality documentary
];

/**
 * Returns micro-genre tags derived from TMDB genre IDs.
 * This is the reliable fallback when text matching yields nothing.
 */
export function tagMicroGenresByIds(genreIds: number[], rating: number = 0): string[] {
  const tags = new Set<string>();
  for (const rule of GENRE_ID_MICRO_MAP) {
    if (rule.minRating && rating < rule.minRating) continue;
    if (rule.ids.every(id => genreIds.includes(id))) {
      tags.add(rule.tag);
    }
  }
  return Array.from(tags);
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function matchHebrewKeyword(text: string, keyword: string): boolean {
  const escaped = escapeRegExp(keyword.toLowerCase());
  const pattern = `(?:^|[^א-ת])(?:[בכלהומשד]{0,2})${escaped}(?:$|[^א-ת])`;
  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

export function matchEnglishKeyword(text: string, keyword: string): boolean {
  const escaped = escapeRegExp(keyword.toLowerCase());
  const pattern = `\\b${escaped}\\b`;
  const regex = new RegExp(pattern, 'i');
  return regex.test(text);
}

/**
 * Scans title and overview against our micro-genre catalog.
 * Falls back to genre-ID-based tagging if text matching yields nothing.
 * Returns matching tags (always at least 1 if genreIds are provided).
 */
export function tagMicroGenres(title: string, overview: string, genreIds: number[] = [], rating: number = 0): string[] {
  const hay = `${title} ${overview}`.toLowerCase();
  const textTags = Object.entries(MICRO_GENRES)
    .filter(([, def]) => {
      const matchHe = def.he.some(w => matchHebrewKeyword(hay, w));
      const matchEn = def.en.some(w => matchEnglishKeyword(hay, w));
      return matchHe || matchEn;
    })
    .map(([key]) => key);

  // UNION: always combine text-based tags (high precision) with genre-ID-based tags (coverage).
  // Claude Code: "don't gate the fallback on 'keywords empty'" — a movie can legitimately
  // carry both a text-precise tag AND its parent-genre tag.
  const idTags = tagMicroGenresByIds(genreIds, rating);
  return Array.from(new Set([...textTags, ...idTags]));
}
