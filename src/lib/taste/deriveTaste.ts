const TMDB_GENRES: Record<string, string> = {
  "28": "Action", "12": "Adventure", "16": "Animation", "35": "Comedy",
  "80": "Crime", "99": "Documentary", "18": "Drama", "10751": "Family",
  "14": "Fantasy", "36": "History", "27": "Horror", "10402": "Music",
  "9648": "Mystery", "10749": "Romance", "878": "Sci-Fi", "10770": "TV Movie",
  "53": "Thriller", "10752": "War", "37": "Western"
};

const ROAST_TEMPLATES: Record<string, (genres: string[]) => string> = {
  'The Pretentious Cinephile': (g) => `Oh great, another self-proclaimed expert who thinks watching a black-and-white French film once makes them superior. Your love for ${g.join(' and ')} just screams "I read Letterboxd reviews before forming my own opinion."`,
  'The Basic Binge-Watcher': (g) => `You probably think Marvel movies are peak cinema. Enjoying ${g.join(', ')} is fine, but maybe try a movie that doesn't have a number in the title for once.`,
  'The Action Junkie': (g) => `If nothing explodes in the first 10 minutes, you're asleep. ${g.join(', ')}? We get it, you like loud noises and zero plot.`,
  'The Escapist': (g) => `Reality is just too hard, huh? You hide in ${g.join(', ')} to avoid your actual problems. Cute.`,
  'The Cinematic Edge-Lord': (g) => `We get it, you're "dark and twisted". Your obsession with ${g.join(', ')} doesn't make you interesting, it just makes you hard to be around at parties.`,
  'The Hopeless Romantic': (g) => `Still waiting for someone to hold a boombox outside your window? Your taste in ${g.join(' and ')} proves you've learned everything about relationships from people who get paid millions to pretend to like each other.`,
  'The Chaos Demon': (g) => `Your taste makes absolutely no sense. Mixing ${g.join(', ')}? You're the human equivalent of mixing all the sodas at the fountain dispenser.`,
  'The Family & Animation Enthusiast': (g) => `You watch ${g.join(', ')} and pretend it's for the 'art style', but we both know you just can't handle movies with real adult problems.`
};

function computeContrarianScore(affinities: Record<string, number>): number {
  const mainstream = ['Action', 'Comedy', 'Romance', 'Adventure'];
  let score = 0;
  let total = 0;
  for (const [genreId, weight] of Object.entries(affinities)) {
    const genre = TMDB_GENRES[genreId] || 'Unknown';
    if (weight > 0) {
      if (!mainstream.includes(genre)) {
        score += weight;
      }
      total += weight;
    }
  }
  return total === 0 ? 0 : score / total;
}

function pickArchetype(affinities: Record<string, number>, contrarian: number, confidence: number): string {
  const values = Object.values(affinities);
  if (values.length === 0) return 'The Basic Binge-Watcher';
  
  const maxScore = Math.max(...values);
  const MIN_SIGNAL = 3; // Absolute floor: Requires at least one 5-star (+2) and 4-star (+1) combined
  
  if (maxScore < MIN_SIGNAL) return 'The Basic Binge-Watcher'; // If they liked nothing strongly, they are basic

  const hasStrongSignal = (genres: string[]) => {
    return genres.some(g => (affinities[g] || 0) >= maxScore * 0.85 && (affinities[g] || 0) >= MIN_SIGNAL); 
  };

  // 1. Explicit Niche Signals
  if (hasStrongSignal(['Horror'])) return 'The Cinematic Edge-Lord';
  if (hasStrongSignal(['Romance'])) return 'The Hopeless Romantic';
  if (hasStrongSignal(['Animation', 'Family'])) return 'The Family & Animation Enthusiast';
  if (hasStrongSignal(['Sci-Fi', 'Fantasy', 'Adventure', 'Mystery'])) return 'The Escapist';
  if (hasStrongSignal(['Action', 'Thriller', 'Crime'])) return 'The Action Junkie';
  
  // 2. Pretentious check (Drama, History, Documentary, or just highly contrarian)
  if (hasStrongSignal(['History', 'Documentary', 'Drama']) || contrarian > 0.8) return 'The Pretentious Cinephile';

  return 'The Basic Binge-Watcher';
}

export function deriveTaste(affinities: Record<string, number>, confidence: number) {
  // Convert affinities to use string genre names instead of IDs
  const mappedAffinities: Record<string, number> = {};
  for (const [id, weight] of Object.entries(affinities)) {
    if (id === 'General') continue; // Skip the general tracking key
    const name = TMDB_GENRES[id] || 'Unknown';
    mappedAffinities[name] = (mappedAffinities[name] || 0) + weight;
  }
  
  const sorted = Object.entries(mappedAffinities).sort((a, b) => b[1] - a[1]);
  const topGenres = sorted.slice(0, 3).map(([g]) => g);
  
  const contrarian = computeContrarianScore(affinities); // This uses TMDB_GENRES internally now
  const archetype = pickArchetype(mappedAffinities, contrarian, confidence);
  const roastText = ROAST_TEMPLATES[archetype] ? ROAST_TEMPLATES[archetype](topGenres) : ROAST_TEMPLATES['The Basic Binge-Watcher'](topGenres);
  
  return { archetype, roastText, topGenres, contrarian };
}
