// Runs ONCE when the Next.js server starts (Next 16 instrumentation hook). We use it to
// AUTO-BOOT the local AI: ensure Ollama is up and the engine model (gemma2:9b) is warm, so
// the site is fully ready the instant it comes online — no manual model start needed.
// Fire-and-forget so it never blocks the server from accepting requests; the deterministic
// engine works even before/without the model.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureModel } = await import('./lib/brain/ensureModel');
    void ensureModel().catch(() => { /* never let boot warm-up crash the server */ });
  }
}
