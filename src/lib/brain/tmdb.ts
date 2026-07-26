// TMDB grounding for the taste brain: real candidate movies for questions, and
// title→movie resolution so LLM-proposed recommendations are validated (no
// hallucinated films or wrong posters).
import type { MovieContext } from '@/types';

const KEY = process.env.TMDB_API_KEY;

export const GENRE_NAMES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};
export const genreNames = (ids?: number[]) => (ids || []).map(id => GENRE_NAMES[id]).filter(Boolean);

export interface BrainCandidate { id: string; title: string; year?: string; genres: string[]; _genreIds?: number[]; votes?: number; }

const langOf = (locale: string) => (locale === 'en' ? 'en-US' : 'he-IL');

/** A broad, popular, real candidate pool for the brain to choose the next question
 *  from. Random year keeps successive quizzes fresh. Excludes already-seen ids. */
export async function fetchCandidatePool(seenIds: string[], locale = 'he', size = 25): Promise<BrainCandidate[]> {
  if (!KEY) return [];
  const seen = new Set(seenIds);
  const year = 1980 + Math.floor(Math.random() * (2024 - 1980 + 1));
  const page = 1 + Math.floor(Math.random() * 5);
  const url = `https://api.themoviedb.org/3/discover/movie?api_key=${KEY}&language=${langOf(locale)}&sort_by=popularity.desc&vote_count.gte=500&vote_average.gte=6.2&primary_release_year=${year}&page=${page}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .filter((m: any) => m.poster_path && m.overview && !seen.has(m.id.toString()))
      .slice(0, size)
      .map((m: any) => ({
        id: m.id.toString(), title: m.title,
        year: m.release_date ? m.release_date.split('-')[0] : undefined,
        genres: genreNames(m.genre_ids), _genreIds: m.genre_ids,
      }));
  } catch { return []; }
}

// Resolve a free-text sub-genre hint ("slasher horror", "heist thriller") to a TMDB
// keyword id, cached. Lets the brain DRILL toward a niche the generic popular pool
// would never surface.
const hintKeywordCache = new Map<string, number | null>();
async function keywordIdForHint(hint: string): Promise<number | null> {
  if (!KEY) return null;
  const k = hint.trim().toLowerCase();
  if (hintKeywordCache.has(k)) return hintKeywordCache.get(k)!;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/keyword?api_key=${KEY}&query=${encodeURIComponent(k)}`, { next: { revalidate: 604800 } });
    const data = res.ok ? await res.json() : { results: [] };
    const id = data.results?.[0]?.id ?? null;
    hintKeywordCache.set(k, id);
    return id;
  } catch { hintKeywordCache.set(k, null); return null; }
}

/** Targeted candidate pool matching a sub-genre hint — by TMDB keyword (preferred,
 *  precise) then by free-text movie search as a fallback. The brain's drilling
 *  mechanism: how a narrow niche becomes visible. */
export async function fetchPoolByHint(hint: string, seenIds: string[], locale = 'he', size = 14): Promise<BrainCandidate[]> {
  if (!KEY || !hint) return [];
  const seen = new Set(seenIds);
  const toCand = (m: any): BrainCandidate => ({
    id: m.id.toString(), title: m.title || m.original_title,
    year: m.release_date ? m.release_date.split('-')[0] : undefined,
    genres: genreNames(m.genre_ids), _genreIds: m.genre_ids,
  });
  const lang = langOf(locale);
  try {
    const kwId = await keywordIdForHint(hint);
    if (kwId) {
      const page = 1 + Math.floor(Math.random() * 3);
      const res = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${KEY}&language=${lang}&sort_by=popularity.desc&vote_count.gte=80&with_keywords=${kwId}&page=${page}`, { next: { revalidate: 0 } });
      if (res.ok) {
        const data = await res.json();
        const out = (data.results || []).filter((m: any) => m.poster_path && m.overview && !seen.has(m.id.toString())).slice(0, size).map(toCand);
        if (out.length >= 4) return out;
      }
    }
    // fallback: free-text movie search on the hint
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${KEY}&language=${lang}&query=${encodeURIComponent(hint)}`, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).filter((m: any) => m.poster_path && m.overview && !seen.has(m.id.toString())).slice(0, size).map(toCand);
  } catch { return []; }
}

// Distinct sub-genres to PROBE in the opening phase, each with TWO instantly-recognizable,
// iconic exemplars. We resolve these by TITLE (not by TMDB keyword top-result, which is
// noisy and often surfaces obscure films the user won't recognize) — so a narrow taste
// gets a clear, unambiguous hit on a film they actually know. The sub-genre TERM is what
// the deterministic engine scores and later recommends within. Exemplars are chosen to be
// UNMISTAKABLE members of their sub-genre and minimally cross-contaminating with neighbours.
// ORDER MATTERS: when two near-neighbour sub-genres tie (a fan rates BOTH exemplars 5),
// the engine breaks the tie by this list order. So the NARROWER / more distinctive member
// of each family is listed BEFORE its broader "elevated" neighbour — e.g. body horror
// before psychological horror, whodunit before neo-noir, hard-SF before space-opera. A fan
// of the narrow taste rates its distinctive exemplar high AND wins the tie; a fan of the
// broad taste rates the narrow exemplar low, so no tie occurs and the avg separates them.
const SUBGENRE_EXEMPLARS: { term: string; titles: [string, string] }[] = [
  // Horror — visceral/distinctive first, atmospheric/default last.
  { term: 'giallo', titles: ['Suspiria', 'Deep Red'] },
  { term: 'slasher', titles: ['Halloween', 'Scream'] },
  { term: 'splatter horror comedy', titles: ['The Evil Dead', 'Re-Animator'] },
  { term: 'body horror', titles: ['The Fly', 'The Thing'] },
  { term: 'zombie', titles: ['Dawn of the Dead', '28 Days Later'] },
  { term: 'creature feature', titles: ['Jaws (1975)', 'Tremors'] },
  { term: 'kaiju monster', titles: ['Godzilla', 'Pacific Rim'] },
  { term: 'cosmic horror', titles: ['The Lighthouse', 'Color Out of Space'] },
  { term: 'found-footage horror', titles: ['The Blair Witch Project', 'Paranormal Activity'] },
  { term: 'psychological horror', titles: ['Hereditary', 'The Babadook'] },
  { term: 'supernatural horror', titles: ['The Conjuring', 'Insidious'] },
  // Sci-fi — order matters for 5★ ties: a hard-SF fan rates Arrival/Ex Machina higher
  // (hi-count wins) so cosmic-first is safe, while a cosmic-epic fan ties on hits and
  // needs cosmic listed first to claim the tie.
  { term: 'cosmic sci-fi epic', titles: ['Interstellar', 'Dune'] },
  { term: 'hard science fiction', titles: ['Arrival', 'Ex Machina'] },
  { term: 'cyberpunk', titles: ['Blade Runner', 'The Matrix'] },
  { term: 'time travel', titles: ['Back to the Future', 'Looper'] },
  { term: 'space opera', titles: ['Star Wars', 'Guardians of the Galaxy'] },
  // Animation — by technique, distinctive first.
  { term: 'stop-motion animation', titles: ['Coraline', 'Kubo and the Two Strings'] },
  { term: 'mecha anime', titles: ['The End of Evangelion', "Mobile Suit Gundam: Char's Counterattack"] },
  { term: 'hand-drawn anime', titles: ['Spirited Away', 'Your Name'] },
  // Action / adventure.
  { term: 'wuxia', titles: ['Hero (2002)', 'House of Flying Daggers'] },
  { term: 'martial arts', titles: ['The Raid', 'Ip Man'] },
  { term: 'heist', titles: ["Ocean's Eleven", 'Heat'] },
  { term: 'war epic', titles: ['Saving Private Ryan', '1917'] },
  { term: 'superhero', titles: ['The Avengers', 'The Dark Knight'] },
  { term: 'disaster', titles: ['Twister', 'The Day After Tomorrow'] },
  { term: 'spaghetti western', titles: ['The Good, the Bad and the Ugly', 'Once Upon a Time in the West'] },
  // Crime / mystery — narrow puzzle/era first, then the broader/cross-appealing ones.
  // Spy-thrillers come AFTER whodunit & psych-thriller: their cerebral exemplars (Tinker
  // Tailor) tempt a 5★ from whodunit/psych fans, so the narrower puzzle sub-genres must
  // claim the tie first.
  { term: 'classic film noir', titles: ['Double Indemnity', 'The Maltese Falcon'] },
  { term: 'psychological thriller', titles: ['Se7en', 'Zodiac'] },
  { term: 'whodunit mystery', titles: ['Knives Out', 'Murder on the Orient Express'] },
  { term: 'neo-noir', titles: ['Chinatown', 'Drive'] },
  { term: 'cerebral spy thriller', titles: ['Tinker Tailor Soldier Spy', 'Bridge of Spies'] },
  { term: 'action spy thriller', titles: ['Skyfall', 'Mission: Impossible'] },
  { term: 'courtroom drama', titles: ['12 Angry Men', 'A Few Good Men'] },
  { term: 'erotic thriller', titles: ['Basic Instinct', 'Fatal Attraction'] },
  // Comedy — distinctive first.
  { term: 'satire', titles: ['Dr. Strangelove', 'Thank You for Smoking'] },
  { term: 'black comedy', titles: ['In Bruges', 'Fargo'] },
  { term: 'deadpan comedy', titles: ['The Grand Budapest Hotel', 'The Lobster'] },
  { term: 'slapstick comedy', titles: ['Dumb and Dumber', 'The Naked Gun'] },
  { term: 'romantic comedy', titles: ['Notting Hill', 'When Harry Met Sally'] },
  { term: 'holiday christmas', titles: ['Elf', 'Home Alone'] },
  // Drama / other.
  { term: 'coming-of-age', titles: ['Lady Bird', 'Stand By Me'] },
  { term: 'period costume drama', titles: ['Pride & Prejudice', 'Atonement'] },
  { term: 'sports drama', titles: ['Rocky', 'Rudy'] },
  { term: 'slow cinema arthouse', titles: ['Stalker', 'The Tree of Life'] },
  { term: 'musical', titles: ['La La Land', 'Les Misérables'] },
  { term: 'epic high fantasy', titles: ['The Lord of the Rings: The Fellowship of the Ring', 'The Hobbit: An Unexpected Journey'] },
  { term: 'sword and sorcery fantasy', titles: ['Conan the Barbarian', 'Krull'] },
];
// Each sub-genre's broad FAMILY — used by the engine's early-stop: once a confirmed 5★
// leader's WHOLE family has been explored (so all its close neighbours were compared), it
// is safe to lock without sweeping the remaining families (a focused taste won't suddenly
// love an unrelated family more). This is what makes the quiz length adaptive (~13 for a
// sharp taste, full sweep for an ambiguous one) instead of a fixed ~48 questions.
const FAMILY_OF: Record<string, string> = {
  'giallo': 'horror', 'slasher': 'horror', 'splatter horror comedy': 'horror', 'body horror': 'horror', 'zombie': 'horror', 'creature feature': 'horror', 'kaiju monster': 'horror', 'cosmic horror': 'horror', 'found-footage horror': 'horror', 'psychological horror': 'horror', 'supernatural horror': 'horror',
  'cosmic sci-fi epic': 'scifi', 'hard science fiction': 'scifi', 'cyberpunk': 'scifi', 'time travel': 'scifi', 'space opera': 'scifi',
  'stop-motion animation': 'animation', 'mecha anime': 'animation', 'hand-drawn anime': 'animation',
  'wuxia': 'action', 'martial arts': 'action', 'heist': 'action', 'war epic': 'action', 'superhero': 'action', 'disaster': 'action',
  'spaghetti western': 'western',
  'classic film noir': 'crime', 'psychological thriller': 'crime', 'whodunit mystery': 'crime', 'neo-noir': 'crime', 'cerebral spy thriller': 'crime', 'action spy thriller': 'crime', 'courtroom drama': 'crime', 'erotic thriller': 'crime',
  'satire': 'comedy', 'black comedy': 'comedy', 'deadpan comedy': 'comedy', 'slapstick comedy': 'comedy', 'romantic comedy': 'comedy', 'holiday christmas': 'comedy',
  'coming-of-age': 'drama', 'period costume drama': 'drama', 'sports drama': 'drama', 'slow cinema arthouse': 'drama', 'musical': 'drama',
  'epic high fantasy': 'fantasy', 'sword and sorcery fantasy': 'fantasy',
};
export function subGenreFamily(term: string): string | undefined { return FAMILY_OF[term]; }

// TIER-1 POPULAR OPENERS — one household-name blockbuster per broad taste. These are served
// FIRST (the opening ~25 questions) so the user almost never answers "didn't see" early; that
// reliable early signal is what lets the engine calibrate before it deepens into the niche
// tier-2 exemplars for surgical sub-genre resolution. Every `term` exists in the engine, so
// rating an opener scores that sub-genre's probe directly (no wasted question).
// Each broad family carries SEVERAL household-name blockbusters. The opening sweep serves
// ONE per family (the rest are skipped once that family is probed), and WHICH one is picked
// is seeded by sessionId — so every quiz opens with a DIFFERENT set of popular films in a
// DIFFERENT order. Rich opening variety, never the same questionnaire twice, yet always
// recognizable (near-zero "didn't see").
const POPULAR_OPENERS: { term: string; titles: string[] }[] = [
  { term: 'superhero', titles: ['The Dark Knight', 'The Avengers', 'Iron Man', 'Spider-Man', 'Black Panther', 'Wonder Woman', 'Deadpool', 'Captain America: The Winter Soldier', 'Thor: Ragnarok', 'The Batman'] },
  { term: 'space opera', titles: ['Star Wars', 'The Empire Strikes Back', 'Return of the Jedi', 'Star Wars: The Force Awakens', 'Guardians of the Galaxy', 'Rogue One: A Star Wars Story', 'The Fifth Element', 'Star Trek'] },
  { term: 'cosmic sci-fi epic', titles: ['Interstellar', 'Avatar', 'Gravity', 'The Martian', 'Contact', 'Ad Astra', 'Avatar: The Way of Water', 'Prometheus'] },
  { term: 'cyberpunk', titles: ['The Matrix', 'Blade Runner 2049', 'Blade Runner', 'Ready Player One', 'Ghost in the Shell', 'Tron: Legacy', 'Total Recall', 'The Matrix Reloaded'] },
  { term: 'time travel', titles: ['Back to the Future', 'Back to the Future Part II', 'Edge of Tomorrow', 'Looper', 'Terminator 2: Judgment Day', 'The Terminator', 'X-Men: Days of Future Past', 'Tenet'] },
  { term: 'slasher', titles: ['Scream', 'Halloween', 'A Nightmare on Elm Street', 'Friday the 13th', 'The Texas Chain Saw Massacre', "Child's Play", 'I Know What You Did Last Summer', 'Happy Death Day'] },
  { term: 'creature feature', titles: ['Jaws (1975)', 'Jurassic Park', 'Jurassic World', 'King Kong', 'Anaconda', 'The Meg', 'Tremors', 'Crawl'] },
  { term: 'supernatural horror', titles: ['The Conjuring', 'Insidious', 'The Exorcist', 'It', 'The Ring', 'Sinister', 'Annabelle', 'Poltergeist'] },
  { term: 'zombie', titles: ['World War Z', 'Zombieland', 'Train to Busan', 'Shaun of the Dead', '28 Days Later', 'I Am Legend', 'Resident Evil', 'Dawn of the Dead'] },
  { term: 'heist', titles: ["Ocean's Eleven", 'The Italian Job', 'Now You See Me', 'Baby Driver', "Ocean's 8", 'The Town', 'Den of Thieves', 'Logan Lucky'] },
  { term: 'action spy thriller', titles: ['Skyfall', 'Mission: Impossible - Fallout', 'Casino Royale', 'The Bourne Identity', 'Kingsman: The Secret Service', 'GoldenEye', 'Spectre', 'Quantum of Solace'] },
  { term: 'war epic', titles: ['Saving Private Ryan', 'Dunkirk', '1917', 'Black Hawk Down', 'Hacksaw Ridge', 'Fury', 'American Sniper', 'Platoon'] },
  { term: 'martial arts', titles: ['Enter the Dragon', 'Ip Man', 'Kung Fu Hustle', 'The Raid', 'Ong-Bak', 'Rush Hour', 'Drunken Master', 'Police Story'] },
  { term: 'spaghetti western', titles: ['The Good, the Bad and the Ugly', 'A Fistful of Dollars', 'For a Few Dollars More', 'Once Upon a Time in the West', 'Django Unchained', 'The Magnificent Seven', 'True Grit', 'Tombstone'] },
  { term: 'psychological thriller', titles: ['Se7en', 'Shutter Island', 'Gone Girl', 'The Silence of the Lambs', 'Prisoners', 'Memento', 'Fight Club', 'Joker'] },
  { term: 'whodunit mystery', titles: ['Knives Out', 'Murder on the Orient Express', 'Glass Onion', 'Death on the Nile', 'Clue', 'Sherlock Holmes', 'The Girl with the Dragon Tattoo', 'Gosford Park'] },
  { term: 'disaster', titles: ['Twister', '2012', 'San Andreas', 'The Day After Tomorrow', 'Deep Impact', 'Armageddon', 'Geostorm', 'Greenland'] },
  { term: 'epic high fantasy', titles: ['The Lord of the Rings: The Fellowship of the Ring', 'The Lord of the Rings: The Two Towers', 'The Lord of the Rings: The Return of the King', "Harry Potter and the Philosopher's Stone", 'The Hobbit: An Unexpected Journey', 'The Chronicles of Narnia: The Lion, the Witch and the Wardrobe', 'Stardust', 'Willow'] },
  { term: 'romantic comedy', titles: ['When Harry Met Sally', 'Notting Hill', 'Pretty Woman', 'Crazy Rich Asians', "Bridget Jones's Diary", '10 Things I Hate About You', 'The Proposal', 'Love Actually'] },
  { term: 'slapstick comedy', titles: ['Dumb and Dumber', 'The Hangover', 'Ace Ventura: Pet Detective', 'Anchorman: The Legend of Ron Burgundy', 'Step Brothers', 'Superbad', '21 Jump Street', "We're the Millers"] },
  { term: 'holiday christmas', titles: ['Home Alone', 'Elf', 'The Polar Express', 'How the Grinch Stole Christmas', 'Home Alone 2: Lost in New York', 'The Santa Clause', 'A Christmas Carol', 'Klaus'] },
  { term: 'coming-of-age', titles: ['Stand By Me', 'The Breakfast Club', 'Lady Bird', 'Boyhood', 'Dead Poets Society', 'The Perks of Being a Wallflower', 'Juno', 'Call Me by Your Name'] },
  { term: 'sports drama', titles: ['Rocky', 'The Blind Side', 'Creed', 'Remember the Titans', 'Moneyball', 'Rush', 'Million Dollar Baby', 'Ford v Ferrari'] },
  { term: 'musical', titles: ['La La Land', 'The Greatest Showman', 'Mamma Mia!', 'Les Misérables', 'Chicago', 'Grease', 'Moulin Rouge!', 'A Star Is Born'] },
  { term: 'hand-drawn anime', titles: ['Spirited Away', 'Your Name', 'Princess Mononoke', 'My Neighbor Totoro', "Howl's Moving Castle", 'Demon Slayer: Kimetsu no Yaiba the Movie: Mugen Train', 'Akira', 'Weathering with You'] },
];

let samplerCache: BrainCandidate[] | null = null;
const samplerProbeMap = new Map<string, string>(); // movieId -> sub-genre probe term
const samplerTierMap = new Map<string, 1 | 2>(); // movieId -> 1 (popular opener) | 2 (niche exemplar)
export function samplerProbeOf(movieId: string): string | undefined { return samplerProbeMap.get(movieId); }
export function samplerTier(movieId: string): 1 | 2 { return samplerTierMap.get(movieId) || 2; }

// Resolve a curated exemplar TITLE to a real TMDB candidate (search en-US for reliable
// matching, then carry genre ids). A trailing "(YYYY)" disambiguates common titles
// (e.g. "Hero (2002)" — bare "Hero" mis-resolves to "Local Hero"). Returns null if not
// found / no poster.
async function candidateByTitle(raw: string): Promise<BrainCandidate | null> {
  if (!KEY) return null;
  const ym = raw.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  const title = ym ? ym[1] : raw;
  const yq = ym ? `&year=${ym[2]}` : '';
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${KEY}&language=en-US&query=${encodeURIComponent(title)}${yq}`, { next: { revalidate: 604800 } });
    if (!res.ok) return null;
    const d = await res.json();
    // Taking TMDB's FIRST usable result made curated blockbusters resolve to obscure
    // sequels, remakes and knockoffs ("Halloween" → a direct-to-video entry), which broke the
    // whole point of an opening the user has certainly seen. Rank instead: an exact title
    // match wins, then the best-known film (vote_count), then popularity.
    const norm = (x: string) => (x || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const want = norm(title);
    const usable = (d.results || []).filter((m: any) => m.poster_path && m.overview);
    const score = (m: any) => {
      const exact = norm(m.title) === want || norm(m.original_title) === want ? 1_000_000 : 0;
      const starts = norm(m.title).startsWith(want) ? 100_000 : 0;
      return exact + starts + (m.vote_count || 0) + (m.popularity || 0);
    };
    const hit = usable.sort((a: any, b: any) => score(b) - score(a))[0] || (d.results || [])[0];
    if (!hit || !hit.poster_path) return null;
    return {
      id: hit.id.toString(), title: hit.title || hit.original_title,
      year: hit.release_date ? hit.release_date.split('-')[0] : undefined,
      genres: genreNames(hit.genre_ids), _genreIds: hit.genre_ids,
      votes: hit.vote_count || 0,
    };
  } catch { return null; }
}

// A tier-1 opener only earns its slot if it is genuinely household-name. Some curated entries
// resolve to films a mainstream user has plausibly never seen (a 1964 spaghetti western landing
// at question 4), and every such card burns a calibration slot AND a SHOWN_CAP slot while
// yielding zero taste signal. Below this vote_count the film is demoted to the tier-2 niche
// sweep rather than dropped — it is still a fine probe, just not an opener.
const OPENER_MIN_VOTES = 2500;

export async function fetchSubGenreSampler(_locale = 'he'): Promise<BrainCandidate[]> {
  if (samplerCache) return samplerCache;
  if (!KEY) return [];
  // Flatten every title to resolve (tier-1 openers FIRST so a film that is both keeps its
  // tier-1 tag and opens). ~290 titles → resolve in batches to avoid TMDB rate-limiting
  // (429s would silently drop openers). Cached after the first build (candidateByTitle is
  // revalidate-cached too), so this cost is paid once.
  const jobs: { term: string; tier: 1 | 2; title: string }[] = [
    ...POPULAR_OPENERS.flatMap(({ term, titles }) => titles.map(title => ({ term, tier: 1 as const, title }))),
    ...SUBGENRE_EXEMPLARS.flatMap(({ term, titles }) => titles.map(title => ({ term, tier: 2 as const, title }))),
  ];
  const byId = new Map<string, BrainCandidate>();
  for (let i = 0; i < jobs.length; i += 30) {
    const batch = jobs.slice(i, i + 30);
    const resolved = await Promise.all(batch.map(async j => ({ ...j, cand: await candidateByTitle(j.title) })));
    for (const { term, tier, cand } of resolved) {
      if (cand && !byId.has(cand.id)) {
        const effectiveTier = (tier === 1 && (cand.votes ?? 0) < OPENER_MIN_VOTES) ? 2 : tier;
        byId.set(cand.id, cand); samplerProbeMap.set(cand.id, term); samplerTierMap.set(cand.id, effectiveTier);
      }
    }
  }
  samplerCache = Array.from(byId.values());
  return samplerCache;
}

// Canonical, PURE recommendation seeds per sub-genre. The deterministic engine confirms a
// sub-genre, then recommends from THIS list (resolved against TMDB, filtered to unseen) —
// not from an LLM that drifts to adjacent/contaminated titles, and not from a noisy keyword
// pool. Every title is a defensible, central member of its sub-genre with minimal neighbour
// bleed (e.g. slasher excludes supernatural "Nightmare on Elm St" and torture-porn "Saw").
const SUBGENRE_RECS: Record<string, string[]> = {
  'giallo': ['Suspiria', 'Deep Red', 'Tenebrae', 'Blood and Black Lace', 'The Bird with the Crystal Plumage', "Don't Torture a Duckling", 'Opera', 'A Bay of Blood'],
  'slasher': ['Halloween', 'Scream', 'Friday the 13th', 'Black Christmas', 'My Bloody Valentine', 'Prom Night', 'Happy Death Day', 'Sleepaway Camp'],
  'splatter horror comedy': ['The Evil Dead', 'Evil Dead II', 'Re-Animator', 'Braindead', 'Bad Taste', 'The Return of the Living Dead', 'Tokyo Gore Police', 'Planet Terror'],
  'body horror': ['The Fly', 'The Thing', 'Videodrome', 'Possessor', 'Tetsuo: The Iron Man', 'Society', 'From Beyond', 'Titane'],
  'zombie': ['Dawn of the Dead', '28 Days Later', 'Shaun of the Dead', 'Train to Busan', 'Night of the Living Dead', 'World War Z', 'Zombieland', '28 Weeks Later'],
  'creature feature': ['Jaws (1975)', 'Tremors', 'The Descent', 'Crawl', 'Anaconda', 'The Shallows', 'Lake Placid', 'The Meg'],
  'kaiju monster': ['Godzilla', 'Pacific Rim', 'King Kong', 'Cloverfield', 'Shin Godzilla', 'Kong: Skull Island', 'The Host', 'Rampage'],
  'cosmic horror': ['The Lighthouse', 'Annihilation', 'Color Out of Space', 'The Mist', 'In the Mouth of Madness', 'Event Horizon', 'The Void', 'Underwater'],
  'found-footage horror': ['The Blair Witch Project', 'Paranormal Activity', 'REC', 'Cloverfield', 'Creep', 'As Above, So Below', 'Host', 'The Visit'],
  'psychological horror': ['Hereditary', 'The Witch', 'Midsommar', 'The Babadook', 'Black Swan', 'Repulsion', 'Saint Maud', 'Relic'],
  'supernatural horror': ['The Conjuring', 'Insidious', 'The Exorcist', 'Sinister', 'The Ring', 'Poltergeist', 'The Conjuring 2', 'Ouija'],
  'hard science fiction': ['Arrival', 'Ex Machina', 'Primer', 'Gattaca', 'Moon', 'Coherence', 'Solaris', 'Predestination'],
  'cosmic sci-fi epic': ['Interstellar', 'Dune', 'Contact', '2001: A Space Odyssey', 'Ad Astra', 'Sunshine', 'Gravity', 'Arrival'],
  'cyberpunk': ['Blade Runner', 'The Matrix', 'Ghost in the Shell', 'Akira', 'Blade Runner 2049', 'Strange Days', 'Upgrade', 'Johnny Mnemonic'],
  'time travel': ['Back to the Future', 'Looper', '12 Monkeys', 'Edge of Tomorrow', 'Predestination', 'Timecrimes', 'About Time', 'Primer'],
  'space opera': ['Star Wars', 'Guardians of the Galaxy', 'The Fifth Element', 'Flash Gordon', 'Valerian and the City of a Thousand Planets', 'Jupiter Ascending', 'John Carter', 'Star Wars: The Force Awakens'],
  'stop-motion animation': ['Coraline', 'Kubo and the Two Strings', 'Wallace & Gromit: The Curse of the Were-Rabbit', 'Fantastic Mr. Fox', 'ParaNorman', 'Isle of Dogs', 'The Nightmare Before Christmas', 'Chicken Run'],
  'mecha anime': ['The End of Evangelion', "Mobile Suit Gundam: Char's Counterattack", 'Patlabor: The Movie', 'Evangelion: 1.0 You Are (Not) Alone', 'Gundam Wing: Endless Waltz', 'Macross: Do You Remember Love?', 'Neon Genesis Evangelion: Death & Rebirth', 'Mobile Suit Gundam I'],
  'hand-drawn anime': ['Spirited Away', 'Your Name', 'Princess Mononoke', 'My Neighbor Totoro', "Howl's Moving Castle", "Kiki's Delivery Service", 'Weathering with You', 'Castle in the Sky'],
  'wuxia': ['Hero (2002)', 'House of Flying Daggers', 'Crouching Tiger, Hidden Dragon', 'The Grandmaster', 'Once Upon a Time in China', 'Ashes of Time', 'The Assassin', 'Reign of Assassins'],
  'martial arts': ['The Raid', 'Ip Man', 'Enter the Dragon', 'Ong-Bak', 'Drunken Master', 'The Raid 2', 'Police Story', 'Kung Fu Hustle'],
  'heist': ["Ocean's Eleven", 'Heat', 'The Italian Job', 'Inside Man', 'The Town', 'Reservoir Dogs', 'Logan Lucky', 'Baby Driver'],
  'cerebral spy thriller': ['Tinker Tailor Soldier Spy', 'Bridge of Spies', 'The Spy Who Came in from the Cold', 'Munich', 'A Most Wanted Man', 'The Lives of Others', 'The Constant Gardener', 'Syriana'],
  'action spy thriller': ['Skyfall', 'Mission: Impossible - Fallout', 'Casino Royale', 'The Bourne Identity', 'Kingsman: The Secret Service', 'GoldenEye', 'Mission: Impossible - Rogue Nation', 'Salt'],
  'war epic': ['Saving Private Ryan', '1917', 'Apocalypse Now', 'Platoon', 'Dunkirk', 'Full Metal Jacket', 'Black Hawk Down', 'Hacksaw Ridge'],
  'superhero': ['The Dark Knight', 'Spider-Man', 'Iron Man', 'Logan', 'Black Panther', 'Wonder Woman', 'The Avengers', 'Spider-Man: Into the Spider-Verse'],
  'disaster': ['Twister', 'The Day After Tomorrow', '2012', 'San Andreas', "Dante's Peak", 'Deep Impact', 'The Towering Inferno', 'Geostorm'],
  'spaghetti western': ['The Good, the Bad and the Ugly', 'Once Upon a Time in the West', 'A Fistful of Dollars', 'For a Few Dollars More', 'Django', 'The Great Silence', 'Day of Anger', 'My Name Is Nobody'],
  'classic film noir': ['Double Indemnity', 'The Maltese Falcon', 'Out of the Past', 'The Big Sleep', 'Sunset Boulevard', 'Touch of Evil', 'The Third Man', 'Gilda'],
  'neo-noir': ['Chinatown', 'Drive', 'L.A. Confidential', 'Nightcrawler', 'Sin City', 'Brick', 'The Nice Guys', 'Mulholland Drive'],
  'psychological thriller': ['Se7en', 'Zodiac', 'Prisoners', 'Gone Girl', 'Shutter Island', 'The Silence of the Lambs', 'Memento', 'Nightcrawler'],
  'whodunit mystery': ['Knives Out', 'Murder on the Orient Express', 'Death on the Nile', 'Glass Onion', 'Clue', 'Gosford Park', 'The Last of Sheila', 'Sleuth'],
  'courtroom drama': ['12 Angry Men', 'A Few Good Men', 'The Verdict', 'A Time to Kill', 'Primal Fear', 'Witness for the Prosecution', 'Philadelphia', 'My Cousin Vinny'],
  'erotic thriller': ['Basic Instinct', 'Fatal Attraction', 'Body Heat', 'Unfaithful', 'Wild Things', 'Indecent Proposal', 'Disclosure (1994)', 'Dressed to Kill'],
  'satire': ['Dr. Strangelove', 'Thank You for Smoking', 'In the Loop', 'Wag the Dog', 'Network', 'Idiocracy', 'The Death of Stalin', 'Election'],
  'black comedy': ['In Bruges', 'Fargo', 'Burn After Reading', 'Three Billboards Outside Ebbing, Missouri', 'Seven Psychopaths', 'Jojo Rabbit', 'The Death of Stalin', 'A Serious Man'],
  'deadpan comedy': ['The Grand Budapest Hotel', 'The Lobster', 'Moonrise Kingdom', 'The Royal Tenenbaums', 'Napoleon Dynamite', 'The Favourite', 'Dogtooth', 'Rushmore'],
  'slapstick comedy': ['Dumb and Dumber', 'The Naked Gun', 'Airplane!', 'Hot Shots!', 'The Pink Panther', 'Tommy Boy', 'Ace Ventura: Pet Detective', "Mr. Bean's Holiday"],
  'romantic comedy': ['Notting Hill', 'When Harry Met Sally', '10 Things I Hate About You', "Bridget Jones's Diary", 'Crazy Rich Asians', 'The Proposal', 'Pretty Woman', 'Love Actually'],
  'holiday christmas': ['Elf', 'Home Alone', 'The Holiday', 'Love Actually', 'The Santa Clause', 'Miracle on 34th Street', 'The Polar Express', "National Lampoon's Christmas Vacation"],
  'coming-of-age': ['Lady Bird', 'Stand By Me', 'Boyhood', 'Call Me by Your Name', 'The Perks of Being a Wallflower', 'Eighth Grade', 'Moonlight', 'The Edge of Seventeen'],
  'period costume drama': ['Pride & Prejudice', 'Atonement', 'Little Women', 'Sense and Sensibility', 'Emma', 'The Age of Innocence', 'A Room with a View', 'Far from the Madding Crowd'],
  'sports drama': ['Rocky', 'Rudy', 'Miracle', 'Warrior', 'Remember the Titans', 'Coach Carter', 'Creed', 'The Blind Side'],
  'slow cinema arthouse': ['Stalker', 'The Tree of Life', 'Andrei Rublev', 'Jeanne Dielman', 'Uncle Boonmee Who Can Recall His Past Lives', 'The Turin Horse', 'Mirror', "Winter Sleep"],
  'musical': ['La La Land', 'Les Misérables', 'The Greatest Showman', 'Chicago', 'Moulin Rouge!', 'West Side Story', 'Mamma Mia!', 'Hairspray'],
  'epic high fantasy': ['The Lord of the Rings: The Fellowship of the Ring', 'The Hobbit: An Unexpected Journey', 'The Lord of the Rings: The Two Towers', 'Willow', 'The Chronicles of Narnia: The Lion, the Witch and the Wardrobe', 'Stardust', 'Eragon', 'The Lord of the Rings: The Return of the King'],
  'sword and sorcery fantasy': ['Conan the Barbarian', 'Krull', 'The Beastmaster', 'Dragonslayer', 'Red Sonja', 'Conan the Destroyer', 'The Sword and the Sorcerer', 'Hawk the Slayer'],
};
export function subGenreRecTitles(term: string): string[] { return SUBGENRE_RECS[term] || []; }

/** Deterministically recommend up to `n` real, unseen films squarely inside a CONFIRMED
 *  sub-genre, from the curated canonical seeds. Surgical: no LLM title drift, no keyword
 *  noise. Returns full MovieContexts (grounded). `seenIds` excludes already-rated films. */
export async function recommendBySubGenre(term: string, seenIds: string[], locale = 'he', n = 3): Promise<MovieContext[]> {
  const titles = SUBGENRE_RECS[term];
  if (!titles || !titles.length) return [];
  const seen = new Set(seenIds);
  // Shuffle so successive quizzes of the same taste surface different (still on-genre) picks.
  const order = titles.map((t, i) => ({ t, k: (i + 1) * (1 + Math.random()) })).sort((a, b) => a.k - b.k).map(x => x.t);
  const out: MovieContext[] = [];
  for (const title of order) {
    if (out.length >= n) break;
    const cand = await candidateByTitle(title);
    if (!cand || seen.has(cand.id) || out.some(m => m.id === cand.id)) continue;
    const m = await movieById(cand.id, locale);
    if (m) out.push(m);
  }
  return out;
}

/** Build a full MovieContext for a TMDB movie id (poster, overview, genres). */
export async function movieById(id: string, locale = 'he'): Promise<MovieContext | null> {
  if (!KEY || !/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${KEY}&language=${langOf(locale)}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const m = await res.json();
    if (!m.poster_path) return null;
    // TMDB's he-IL response falls back to the ORIGINAL title when no Hebrew one exists, which
    // put raw CJK on a Hebrew results card (機動警察パトレイバー 劇場版). Prefer a Latin title in
    // that case — recognizable to an Israeli reader in a way the original script is not.
    const cjk = /[　-鿿가-힯]/;
    const heTitle = m.title || m.original_title || '';
    const safeTitle = cjk.test(heTitle) && m.original_title && !cjk.test(m.original_title)
      ? m.original_title : heTitle;
    return {
      id: m.id.toString(), title: safeTitle,
      originalDetails: `${m.original_title} · ${m.release_date ? m.release_date.split('-')[0] : ''}`,
      rating: m.vote_average, posterUrl: `/api/poster?path=${m.poster_path}`,
      overview: m.overview || '', trailerId: '', easterEgg: { type: 'oscar' },
      _genreIds: (m.genres || []).map((g: any) => g.id),
    };
  } catch { return null; }
}

/** Resolve an LLM-proposed {title, year} to a REAL TMDB movie — grounding the recs.
 *  Search runs in en-US (TMDB matches English/original titles far more reliably than
 *  localized ones), then details are fetched in the user's locale. */
export async function resolveByTitle(title: string, year: string | null, locale = 'he'): Promise<MovieContext | null> {
  if (!KEY) return null;
  try {
    const q = encodeURIComponent(title);
    const yq = year ? `&year=${encodeURIComponent(year)}` : '';
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${KEY}&language=en-US&query=${q}${yq}`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = (data.results || []).find((m: any) => m.poster_path && m.overview) || (data.results || [])[0];
    if (!hit) return null;
    return movieById(hit.id.toString(), locale);
  } catch { return null; }
}

export async function getTrailer(id: string): Promise<string> {
  if (!KEY || !/^\d+$/.test(id)) return '';
  try {
    // No language filter: the old `language=en-US` silently dropped anime/foreign/older
    // titles that have no en-US video (e.g. Evangelion), leaving the card with NO trailer
    // button. Query ALL videos, then degrade gracefully so almost every film gets a clip.
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}/videos?api_key=${KEY}`, { next: { revalidate: 3600 } });
    if (!res.ok) return '';
    const data = await res.json();
    const yt = (data.results || []).filter((v: any) => v.site === 'YouTube');
    if (!yt.length) return '';
    // Prefer an official Trailer, then a Teaser, then any YouTube clip — preferring
    // English (or language-agnostic) entries within each tier when available.
    const pick = (type: string) =>
      yt.find((v: any) => v.type === type && (v.iso_639_1 === 'en' || !v.iso_639_1)) ||
      yt.find((v: any) => v.type === type);
    const chosen = pick('Trailer') || pick('Teaser') || yt[0];
    return chosen ? chosen.key : '';
  } catch { return ''; }
}

// ── WHERE TO WATCH IT, IN ISRAEL ─────────────────────────────────────────────
// A recommendation nobody can act on is worth nothing, and the Israeli catalogue is split
// across Netflix / Disney+ / HBO Max via Cellcom / yes / HOT VOD — figuring out where a film
// actually is IS the user's real pain. This is also the one thing a chatbot cannot fake: it
// will happily hallucinate that a film is on yes VOD. TMDB's provider data is JustWatch-backed,
// so it is real. Cached for a day; failure is silent (the card simply omits availability).
export interface WatchAvailability {
  stream: { name: string; logo: string }[];  // included with a subscription
  rent: { name: string; logo: string }[];    // rent or buy
  link?: string;                             // JustWatch page for the region
}

export async function getWatchProviders(id: string, region = 'IL'): Promise<WatchAvailability | null> {
  if (!KEY || !/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${KEY}`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[region];
    if (!r) return null;
    const map = (arr?: { provider_name: string; logo_path: string }[]) =>
      (arr || []).map(p => ({ name: p.provider_name, logo: `https://image.tmdb.org/t/p/w45${p.logo_path}` }));
    const stream = map(r.flatrate);
    // rent and buy are usually the same storefronts; dedupe so the card is not a wall of logos.
    const rent = map([...(r.rent || []), ...(r.buy || [])])
      .filter((p, i, a) => a.findIndex(x => x.name === p.name) === i);
    if (!stream.length && !rent.length) return null;
    return { stream, rent, link: r.link };
  } catch { return null; }
}
