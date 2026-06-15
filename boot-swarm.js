/**
 * Auto-boot QA swarm — adversarial "personas" that attack the auto-start / health /
 * recovery / graceful-degradation mechanism of the local AI, exactly like brain-swarm
 * attacks the recommendation accuracy. Each scenario hunts a specific failure mode and
 * reports PASS/FAIL with a finding to fix.
 *
 * Usage: node boot-swarm.js
 */
const SITE = 'http://localhost:3000';
const OLLAMA = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'gemma2:9b';

const results = [];
function rec(name, pass, detail) { results.push({ name, pass, detail }); console.log(`${pass ? '✅' : '❌'} ${name} — ${detail}`); }
const ms = (t0) => `${Date.now() - t0}ms`;

async function jget(url, opts) { const r = await fetch(url, opts); return { ok: r.ok, status: r.status, json: await r.json().catch(() => null) }; }

// 1. HEALTH — after boot, the health probe must report the engine model up & not degraded.
async function sHealth() {
  try {
    const { ok, json } = await jget(`${SITE}/api/brain-health`);
    if (!ok || !json) return rec('Health probe', false, 'endpoint did not respond');
    const good = json.llm === 'up' && json.model === MODEL && json.degraded === false;
    rec('Health probe', good, `llm=${json.llm} model=${json.model} degraded=${json.degraded}`);
  } catch (e) { rec('Health probe', false, 'threw: ' + e.message); }
}

// 2. MODEL RESPONSIVE — health says "up" only checks ollama is alive; verify the ENGINE
//    MODEL itself actually answers (a loaded-but-wrong or unloaded model is a real bug).
async function sModelResponsive() {
  const t0 = Date.now();
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: 'reply with OK', stream: false, keep_alive: '30m' }), signal: AbortSignal.timeout(60000) });
    const j = await r.json();
    rec('Model responds', r.ok && !!(j.response), `${MODEL} answered in ${ms(t0)}`);
  } catch (e) { rec('Model responds', false, `${MODEL} did not answer: ` + e.message); }
}

// 3. WARM LATENCY — after boot the model should be resident (fast). A cold first reply
//    means the boot warm-up didn't run.
async function sWarm() {
  const t0 = Date.now();
  try {
    await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: 'ok', stream: false }), signal: AbortSignal.timeout(60000) });
    const took = Date.now() - t0;
    rec('Warm latency', took < 4000, `first reply ${took}ms (warm if <4000)`);
  } catch (e) { rec('Warm latency', false, 'threw: ' + e.message); }
}

// 4. GRACEFUL DEGRADATION — even with NO model, the deterministic engine must still return
//    3 real recommendations (mock mode = no LLM). Customers never see a broken result.
async function sGraceful() {
  try {
    const headers = { 'Content-Type': 'application/json', 'x-locale': 'en', 'x-brain-mock': '1' };
    let s = await (await fetch(`${SITE}/api/brain-question`, { method: 'POST', headers, body: JSON.stringify({ isInit: true, sessionId: 'boot_' + Date.now() }) })).json();
    // Answering 5★ to EVERYTHING is the all-lover path — the engine sweeps every
    // family before locking and legitimately needs ~32 questions. Cap must sit
    // safely above that natural length, else we exit before `isComplete` (false 0/3).
    let probe = {}, n = 0;
    while (s && !s.isComplete && n < 60) {
      const mv = s.currentQuestion && s.currentQuestion.movie; if (!mv) break; n++;
      s = await (await fetch(`${SITE}/api/brain-question`, { method: 'POST', headers, body: JSON.stringify({ sessionId: s.sessionId, movieId: mv.id, answer: 5, genreIds: mv._genreIds || [], title: mv.title, ratingHistory: s.ratingHistory || [], searchHint: s.searchHint || '', probeScores: s.probeScores || probe }) })).json();
      probe = s.probeScores || probe;
    }
    const recsN = (s.finalMovies || []).length;
    rec('Graceful (no-LLM)', recsN === 3, `deterministic engine returned ${recsN}/3 recs without the model`);
  } catch (e) { rec('Graceful (no-LLM)', false, 'threw: ' + e.message); }
}

// 5. RECOVERY — unload the model from VRAM (simulates eviction/crash), confirm the next
//    warm reloads it. (Uses keep_alive:0 to unload — does NOT kill ollama.)
async function sRecovery() {
  try {
    await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: 'x', stream: false, keep_alive: 0 }) }); // unload
    await new Promise(r => setTimeout(r, 1500));
    const t0 = Date.now();
    const r = await fetch(`${OLLAMA}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: 'ok', stream: false, keep_alive: '30m' }), signal: AbortSignal.timeout(60000) });
    rec('Recovery (reload)', r.ok, `model reloaded after unload in ${ms(t0)}`);
  } catch (e) { rec('Recovery (reload)', false, 'threw: ' + e.message); }
}

(async () => {
  console.log(`\n🔌 AUTO-BOOT swarm — site ${SITE} | model ${MODEL}\n`);
  await sHealth();
  await sModelResponsive();
  await sWarm();
  await sGraceful();
  await sRecovery();
  const passed = results.filter(r => r.pass).length;
  console.log(`\n════════════════════\n📊 AUTO-BOOT: ${passed}/${results.length} robust\n════════════════════`);
  if (passed < results.length) for (const r of results.filter(r => !r.pass)) console.log(`  ❌ ${r.name}: ${r.detail}`);
})();
