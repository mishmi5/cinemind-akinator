/**
 * Sub-genre (niche) taxonomy — the layer where individual taste actually lives.
 *
 * Genres say "Comedy"; niches say "parody, not sitcom". Loving Scary Movie
 * tags k:parody — NOT a general love of Comedy. Each TMDB keyword maps into a
 * curated niche; a movie carries up to 4 niches; niche affinities ride the
 * same userAffinities map with a `k:` prefix (archetype derivation skips them).
 *
 * Matching is by inclusion on lowercase keyword text so TMDB variants
 * ("post-apocalyptic future", "parody of") still land in the right niche.
 */

// substring → niche. First match wins per keyword; a movie's niche list is
// deduped and capped (see nichesForKeywords).
const NICHE_RULES: [string, string][] = [
  // Comedy family — the Scary Movie problem
  ['parody', 'parody'],
  ['spoof', 'parody'],
  ['mockumentary', 'parody'],
  ['satire', 'satire'],
  ['social commentary', 'satire'],
  ['dark comedy', 'dark-comedy'],
  ['black comedy', 'dark-comedy'],
  ['coming of age', 'coming-of-age'],
  ['stoner', 'stoner-comedy'],
  ['stag night', 'party-comedy'],
  ['house party', 'party-comedy'],
  ['romantic comedy', 'rom-com'],

  // Horror family
  ['slasher', 'slasher'],
  ['serial killer', 'serial-killer'],
  ['psychopath', 'serial-killer'],
  ['zombie', 'zombie'],
  ['vampire', 'vampire'],
  ['werewolf', 'monster'],
  ['monster', 'monster'],
  ['creature', 'monster'],
  ['giant snake', 'monster'],
  ['haunted', 'supernatural-horror'],
  ['possession', 'supernatural-horror'],
  ['exorcism', 'supernatural-horror'],
  ['ghost', 'supernatural-horror'],
  ['demon', 'supernatural-horror'],
  ['witch', 'occult'],
  ['occult', 'occult'],
  ['found footage', 'found-footage'],
  ['body horror', 'body-horror'],

  // Thriller / Crime family
  ['whodunit', 'whodunit'],
  ['detective', 'whodunit'],
  ['investigation', 'whodunit'],
  ['murder mystery', 'whodunit'],
  ['heist', 'heist'],
  ['robbery', 'heist'],
  ['stolen money', 'heist'],
  ['gangster', 'gangster'],
  ['mafia', 'gangster'],
  ['bratva', 'gangster'],
  ['crime boss', 'gangster'],
  ['drug traffick', 'gangster'],
  ['psychological thriller', 'psychological-thriller'],
  ['manipulation', 'psychological-thriller'],
  ['hypnosis', 'psychological-thriller'],
  ['conspiracy', 'conspiracy'],
  ['spy', 'spy'],
  ['espionage', 'spy'],
  ['secret organization', 'spy'],
  ['hitman', 'assassin'],
  ['assassin', 'assassin'],
  ['revenge', 'revenge'],
  ['film noir', 'noir'],
  ['neo-noir', 'noir'],
  ['courtroom', 'legal-drama'],
  ['prison', 'prison'],

  // Sci-Fi family
  ['cyberpunk', 'cyberpunk'],
  ['dystopia', 'dystopia'],
  ['artificial intelligence', 'ai-scifi'],
  ['android', 'ai-scifi'],
  ['man vs machine', 'ai-scifi'],
  ['robot', 'ai-scifi'],
  ['time travel', 'time-travel'],
  ['time warp', 'time-travel'],
  ['time loop', 'time-travel'],
  ['post-apocalyptic', 'post-apocalyptic'],
  ['apocalypse', 'post-apocalyptic'],
  ['space', 'space'],
  ['astronaut', 'space'],
  ['nasa', 'space'],
  ['spacecraft', 'space'],
  ['alien', 'alien'],
  ['extraterrestrial', 'alien'],
  ['superhero', 'superhero'],
  ['based on comic', 'superhero'],
  ['kaiju', 'monster'],
  ['transhumanism', 'cyberpunk'],

  // Fantasy / Adventure family
  ['sword and sorcery', 'high-fantasy'],
  ['elves', 'high-fantasy'],
  ['dwarf', 'high-fantasy'],
  ['dragon', 'high-fantasy'],
  ['wizard', 'high-fantasy'],
  ['magic', 'magic-fantasy'],
  ['fairy tale', 'fairy-tale'],
  ['mythology', 'mythology'],
  ['treasure', 'treasure-adventure'],
  ['expedition', 'expedition'],
  ['survival', 'survival'],
  ['disaster', 'disaster'],
  ['shipwreck', 'disaster'],
  ['martial arts', 'martial-arts'],
  ['kung fu', 'martial-arts'],
  ['gladiator', 'sword-and-sandal'],
  ['roman empire', 'sword-and-sandal'],
  ['pirate', 'swashbuckler'],
  ['western', 'western'],
  ['samurai', 'samurai'],

  // Drama / Romance family
  ['based on true story', 'true-story'],
  ['based on a true story', 'true-story'],
  ['biography', 'biopic'],
  ['biopic', 'biopic'],
  ['historical', 'period-drama'],
  ['period drama', 'period-drama'],
  ['wartime', 'war-drama'],
  ['world war', 'war-drama'],
  ['soulmates', 'epic-romance'],
  ['forbidden love', 'epic-romance'],
  ['secret love', 'epic-romance'],
  ["love of one's life", 'epic-romance'],
  ['love triangle', 'romance-drama'],
  ['melancholy', 'melancholic'],
  ['musical', 'musical'],
  ['jazz', 'music-film'],
  ['dancing', 'music-film'],
  ['sports', 'sports'],
  ['boxing', 'sports'],
  ['class differences', 'class-drama'],
  ['working class', 'class-drama'],
  ['family', 'family-drama'],
  ['friendship', 'friendship'],
  ['road trip', 'road-movie'],
  ['road movie', 'road-movie'],
];

/** Map raw TMDB keywords to curated niches. Deduped, capped to keep one
 * tag-spammy movie from washing out the vector. */
export function nichesForKeywords(keywords: string[], cap: number = 4): string[] {
  const niches: string[] = [];
  for (const kwRaw of keywords) {
    const kw = kwRaw.toLowerCase();
    for (const [needle, niche] of NICHE_RULES) {
      if (kw.includes(needle)) {
        if (!niches.includes(niche)) niches.push(niche);
        break;
      }
    }
    if (niches.length >= cap) break;
  }
  return niches;
}

/** Hebrew display names for niches (paywall personalization, taste summaries). */
export const NICHE_HE: Record<string, string> = {
  'parody': 'פארודיות', 'satire': 'סאטירה', 'dark-comedy': 'קומדיה שחורה',
  'coming-of-age': 'סרטי התבגרות', 'party-comedy': 'קומדיות מסיבה', 'rom-com': 'קומדיות רומנטיות',
  'slasher': 'סלאשרים', 'serial-killer': 'רוצחים סדרתיים', 'zombie': 'זומבים',
  'monster': 'מפלצות', 'supernatural-horror': 'אימה על-טבעית', 'occult': 'תורת הנסתר',
  'whodunit': 'בלש קלאסי', 'heist': 'סרטי שוד', 'gangster': 'גנגסטרים',
  'psychological-thriller': 'מתח פסיכולוגי', 'spy': 'ריגול', 'assassin': 'מתנקשים',
  'revenge': 'נקמה', 'noir': 'פילם נואר', 'prison': 'סרטי כלא',
  'cyberpunk': 'סייברפאנק', 'dystopia': 'דיסטופיה', 'ai-scifi': 'בינה מלאכותית',
  'time-travel': 'מסע בזמן', 'post-apocalyptic': 'פוסט-אפוקליפסה', 'space': 'חלל',
  'alien': 'חייזרים', 'superhero': 'גיבורי-על', 'high-fantasy': 'פנטזיה אפית',
  'magic-fantasy': 'קסם ופנטזיה', 'martial-arts': 'אומנויות לחימה', 'survival': 'הישרדות',
  'sword-and-sandal': 'אפוסים היסטוריים', 'epic-romance': 'רומנטיקה אפית',
  'period-drama': 'דרמה תקופתית', 'true-story': 'מבוסס על אמת', 'biopic': 'ביוגרפיות',
  'musical': 'מחזות זמר', 'music-film': 'סרטי מוזיקה', 'class-drama': 'דרמה חברתית',
  'war-drama': 'דרמות מלחמה', 'treasure-adventure': 'הרפתקאות אוצר', 'expedition': 'מסעות',
  'disaster': 'סרטי אסון', 'friendship': 'חברות', 'family-drama': 'דרמה משפחתית',
};

/** Affinity key for a niche axis. */
export const nicheKey = (niche: string) => `k:${niche}`;

/** Niche axes are engine-internal: archetype math and genre displays skip them. */
export const isNicheKey = (key: string) => key.startsWith('k:');
