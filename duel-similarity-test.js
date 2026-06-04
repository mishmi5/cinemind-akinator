const { generateText } = require('ai');
const { openai } = require('@ai-sdk/openai');
require('dotenv').config({ path: '.env.local' });

// Mock TasteVectors
const p1 = {
  handle: 'ActionBro',
  archetype: 'The Action Junkie',
  topGenres: ['Action', 'Thriller'],
  affinities: {
    '28': 10, // Action
    '53': 8,  // Thriller
    '18': 2   // Drama
  }
};

const p2 = {
  handle: 'ArtSnob',
  archetype: 'The Pretentious Cinephile',
  topGenres: ['Drama', 'History'],
  affinities: {
    '18': 15, // Drama
    '36': 10, // History
    '28': -5  // Action
  }
};

function computeSimilarity(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const key of keys) {
    if (key === 'General') continue;
    const valA = vecA[key] || 0;
    const valB = vecB[key] || 0;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return Math.max(0, dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))); // 0 to 1
}

async function runTest() {
  console.log("⚔️ Running Duel Similarity Test...");
  const sim = computeSimilarity(p1.affinities, p2.affinities);
  console.log(`Similarity Score: ${(sim * 100).toFixed(1)}%`);

  const prompt = `You are the brutal CineMind AI judge. Two friends are dueling their movie tastes.
Challenger: ${p1.handle} (${p1.archetype})
Opponent: ${p2.handle} (${p2.archetype})
Their Taste Similarity Score is ${(sim * 100).toFixed(0)}%.

Write a short, highly sarcastic "verdict" (2-3 sentences max) roasting their combination of tastes or their lack of compatibility. 
Make it hilarious. Reply ONLY with the verdict string.`;

  console.log("🤖 Asking OpenAI for a roast...");
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt,
    temperature: 0.9,
  });

  console.log("\n🔥 Verdict:");
  console.log(`"${text}"`);
}

runTest().catch(console.error);
