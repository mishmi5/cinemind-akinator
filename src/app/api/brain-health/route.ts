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
  let llm: 'up' | 'down' = 'down';
  try {
    const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    llm = r.ok ? 'up' : 'down';
  } catch { llm = 'down'; }
  return NextResponse.json({
    ok: true,                 // the deterministic engine can always serve
    engine: 'brain-deterministic',
    backend, model, llm,
    degraded: llm !== 'up',   // true → recs use templated reasons (still correct), recover the LLM
    ts: Date.now(),
  });
}
