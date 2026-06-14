# CineMind — Taste Brain (Akinator-style LLM engine)

An LLM reasons about the user's taste at **sub-genre resolution** and drives the
quiz dynamically, instead of hand-tuned formula weights. Grounded by TMDB so it
never hallucinates movies/posters. It's an alternative engine behind a flag — the
v12 formula stays the default.

## Try it right now (no model needed)

Open the quiz with the **mock** brain (deterministic, validates the whole pipeline):

```
http://localhost:3000/he/scan?brain=mock
```

You'll get adaptive questions → 3 real TMDB recommendations. This proves the
plumbing; the *reasoning quality* needs a real model (below).

## Activate the REAL brain

The brain is backend-pluggable (`src/lib/brain/model.ts`). Pick one:

### Option A — Local Ollama (free, private) ← preferred, you already have the models
Your 32B models are still on disk (`deepseek-r1:32b`, `qwen:latest`,
`deepseek-r1-tool-calling:32b`) but the **ollama binary is missing** — reinstall it
(the models stay), then:

```powershell
# 1. reinstall ollama (binary only; your pulled models are reused)
#    download from https://ollama.com/download  (or: winget install Ollama.Ollama)
# 2. start the server
ollama serve
# 3. confirm a model answers
ollama run qwen:latest "hi"
```

Then in `.env.local` uncomment **one** model line and restart `npm run dev`:

```
OLLAMA_MODEL=qwen:latest          # fast, good enough to start
# OLLAMA_MODEL=deepseek-r1:32b    # much stronger reasoning, but slow per question
# OLLAMA_BASE_URL=http://localhost:11434   # only if non-default
```

> Tip: `qwen:latest` for snappy questions; the 32B reasoner shines on final recs but
> adds latency. We can route questions→small, final-recs→32B later.

### Option B — OpenAI cloud
```
OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o   # default
```

Restart the dev server, then open:

```
http://localhost:3000/he/scan?brain=1
```

If no backend is configured, `?brain=1` returns 503 and you should use `?brain=mock`
or fall back to the default formula engine (plain `/he/scan`).

## How it works (per turn)

1. Server fetches a real **TMDB candidate pool** (excludes already-seen + recent).
2. The brain (`brainStep`) gets the rating history + pool and returns either:
   - `phase:"ask"` → the `nextPickId` (a real pool movie) that best resolves the taste, or
   - `phase:"done"` → 3 `recommendations` (title+year+reason) once it understands you.
3. Recommendations are **grounded**: each proposed title is validated against TMDB
   (`resolveByTitle`) — unresolved ones are dropped, so no fake movies/posters.
4. `confidence` is the brain's own honest certainty; the meter tracks it.

The system prompt enforces the owner's principles: sub-genre decomposition for every
genre, literal ratings (1★ = steer away), resolve-by-contrast, and honest confidence.
