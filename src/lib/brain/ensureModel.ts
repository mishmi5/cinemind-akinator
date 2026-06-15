// Auto-boot for the local AI: makes sure Ollama is running and the engine model is warm,
// so the site "just works" the moment it comes up — zero manual steps. Called from
// instrumentation.register() on every server start. Designed to be safe and non-blocking:
// if anything fails, the deterministic engine still serves correct results (the model only
// writes recommendation reasons), so customers never hit a broken experience.

const BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'gemma2:9b';

async function ollamaUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

let booted = false; // guard so concurrent boots/HMR don't double-run

export async function ensureModel(): Promise<{ ok: boolean; started: boolean; warmed: boolean }> {
  if (booted) return { ok: true, started: false, warmed: false };
  booted = true;
  let up = await ollamaUp();
  let started = false;

  // If Ollama is down, try to start it (local dev/desktop). The scheduled keepalive is the
  // belt-and-suspenders; this is the just-in-time boot when the site comes up first.
  if (!up && process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { spawn } = await import('child_process');
      spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' }).unref();
      started = true;
    } catch { /* ollama not on PATH — keepalive / manual start will handle it */ }
    for (let i = 0; i < 15 && !up; i++) { await new Promise(r => setTimeout(r, 2000)); up = await ollamaUp(); }
  }

  if (!up) {
    console.warn(`[ensureModel] Ollama unavailable at ${BASE} — engine serves deterministic-only (reasons templated).`);
    booted = false; // allow a later retry
    return { ok: false, started, warmed: false };
  }

  // Warm the model into VRAM (keep_alive 30m) so the first customer request is instant.
  let warmed = false;
  try {
    const r = await fetch(`${BASE}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: 'ok', stream: false, keep_alive: '30m' }),
      signal: AbortSignal.timeout(120000),
    });
    warmed = r.ok;
    console.log(`[ensureModel] ${MODEL} ${warmed ? 'warm & ready' : 'warm request returned ' + r.status} at ${BASE}`);
  } catch (e) {
    console.warn(`[ensureModel] could not warm ${MODEL}:`, (e as Error).message);
  }
  return { ok: true, started, warmed };
}
