import { NextResponse } from 'next/server';

// Keep the local AI (gemma2:9b) resident in VRAM for as long as anyone is using the site.
// The scan page pings this on mount and every few minutes, so the moment a user is on
// /scan the model is loaded and STAYS loaded (keep_alive:-1 = never auto-unload) — the AI
// taste-director + recommendation reasons are then instant, no cold-start.
//
// An empty-prompt /api/generate just LOADS the model (no token generation), so this is cheap
// to call repeatedly. The deterministic engine still works even if the model is unavailable,
// so a failure here never blocks the quiz.

const BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'gemma2:9b';

export async function GET() {
  let loaded = false;
  let durationMs = 0;
  try {
    // Is it already resident? (fast path — no work needed)
    const ps = await fetch(`${BASE}/api/ps`, { signal: AbortSignal.timeout(3000) }).then(r => r.json()).catch(() => null);
    const resident = !!ps?.models?.some((m: { name?: string }) => m.name === MODEL);
    if (resident) return NextResponse.json({ ok: true, model: MODEL, loaded: true, alreadyResident: true });

    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // empty prompt + keep_alive:-1 → load into VRAM and pin it there indefinitely.
      body: JSON.stringify({ model: MODEL, prompt: '', stream: false, keep_alive: -1 }),
      signal: AbortSignal.timeout(120000),
    });
    loaded = r.ok;
    durationMs = Date.now() - t0;
  } catch {
    return NextResponse.json({ ok: false, model: MODEL, loaded: false }, { status: 200 });
  }
  return NextResponse.json({ ok: loaded, model: MODEL, loaded, durationMs });
}
