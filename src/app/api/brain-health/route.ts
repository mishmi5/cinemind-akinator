import { NextResponse } from 'next/server';
import { brainBackend } from '@/lib/brain/model';

// Liveness/health probe for the taste brain — used by the 24/7 keep-alive and for a quick
// "is everything up?" check. The engine itself is DETERMINISTIC and does not require the
// LLM to serve correct results (the LLM only writes recommendation reasons), so `ok` stays
// true even when the LLM is down — we just flag `degraded` so ops knows to recover it.
export async function GET() {
  const backend = brainBackend();
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:14b-instruct';
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  // Checking only that ollama answers is NOT enough: it happily returns 200 on /api/tags while
  // the engine's model is absent, so the probe used to report llm:"up", degraded:false with a
  // missing model — a lying health check. We verify the MODEL ITSELF is installed, and whether
  // it is currently resident in VRAM (warm) so ops can tell "ready" from "will cold-start".
  let llm: 'up' | 'down' = 'down';
  let modelInstalled = false;
  let modelWarm = false;
  try {
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      llm = 'up';
      const tags = await r.json().catch(() => null);
      modelInstalled = !!tags?.models?.some((m: { name?: string }) => m.name === model);
      if (modelInstalled) {
        const ps = await fetch(`${base}/api/ps`, { signal: AbortSignal.timeout(4000) })
          .then(x => x.json()).catch(() => null);
        modelWarm = !!ps?.models?.some((m: { name?: string }) => m.name === model);
      }
    }
  } catch { llm = 'down'; }
  const ready = llm === 'up' && modelInstalled;
  return NextResponse.json({
    ok: true,                 // the deterministic engine can always serve
    engine: 'brain-deterministic',
    backend, model, llm,
    modelInstalled, modelWarm,
    // degraded → recs fall back to templated reasons (still correct). True when ollama is down
    // OR the model is missing, so `ollama pull <model>` is the recovery action.
    degraded: !ready,
    ts: Date.now(),
  });
}
