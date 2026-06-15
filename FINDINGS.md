# CineMind — Findings (do not relitigate; only move forward)

Persisted technical findings so we never rediscover them.

## Hardware (owner's machine)
- **GPU:** NVIDIA RTX 3090, 24 GB GDDR6X, 10496 CUDA cores, 936 GB/s, PCIe Gen4, Resizable BAR on.
- **CPU:** Intel i9-12900K. **RAM:** 64 GB. **OS:** Windows 11 Pro. Driver 610.47.
- Budget rule: usable VRAM ≈ 24 × 0.85 ≈ 20 GB. A 27B-Q4 (~18-20GB) just fits; 9B (~5.5GB) leaves
  lots of headroom (room to also load the test-sim model concurrently).

## Models — benchmarked IN PHYSICAL CHROME (the only valid test)

### Engine model (customer-facing recs + Hebrew reasons) → **gemma2:9b**
- **ALL qwen models fail Hebrew** with severe code-switching (drift into Chinese/French/Russian
  mid-sentence) — qwen2.5:14b, qwen2.5:32b, qwen3:30b-a3b all do it. This is the exact failure
  the owner's research warned about. The research's #1 pick "Qwen 3.6 27B" does NOT exist in ollama.
- **gemma2 (Google) = clean, natural Hebrew, no code-switching.**
  - gemma2:27b — best Hebrew polish, but ~9.7s/reason (slow for live use).
  - **gemma2:9b — clean Hebrew AND ~1.2s/reason (8x faster). CHOSEN as the engine model.**
- Set in `.env.local`: `OLLAMA_MODEL=gemma2:9b`. Next dev auto-reloads env. keepalive default = gemma2:9b.
- The engine is DETERMINISTIC — the model writes only the recommendation *reason* (in the user's
  language), never the film selection, so it can't break the surgical pick. `recReason()` in tasteBrain.ts.

### Test-sim model (rates movies in QA personas) → qwen3:30b-a3b think:false + plot overview
- Reasoning models (gpt-oss:20b, qwen3-thinking, qwen2.5:32b) = accurate but 3-15x slower (156-447s/persona).
- qwen3:30b-a3b with `think:false` (via /api/chat) = ~0.8s/call, MoE 3B-active speed, 30B knowledge.
- KEY: feed the sim the PLOT OVERVIEW, not just broad TMDB genres — that's what lets it tell
  "Wes-Anderson deadpan" from "Comedy/Drama" (Deadpan 0→80). The input mattered more than the model.

## Ollama tuning for the 3090 (in keepalive script)
- `OLLAMA_FLASH_ATTENTION=1` (faster prefill), `OLLAMA_KV_CACHE_TYPE=q8_0` (halves context VRAM).

## Engine (settled)
- Deterministic sub-genre brain, 47 sub-genres, surgical. API: WAVE1 20/20, WAVE2 18/20.
- explore→exploit + DRILL-OFF (close 5★ neighbours drilled before lock); narrow-before-broad ordering;
  EARLY-STOP with FAMILY_ADJ (lock once leader's family + adjacent families explored) → adaptive length.
- Curated canonical recommendation seeds per sub-genre; year-qualified titles (Hero (2002), Jaws (1975)).
- brain = DEFAULT engine (scan/page.tsx; ?engine=formula opts out). /api/brain-health probe.

## Test methodology (mandatory)
- Persona QA runs in PHYSICAL headed Google Chrome tabs (brain-chrome-swarm.js, Playwright channel:chrome),
  clicking real stars, reading window.__cinemind_session. Hunt every bug, bring findings, fix, repeat.
- For /he runs, feed the sim the ORIGINAL (English) title from originalDetails — Hebrew titles
  ("ליל המסכות") aren't recognized by the sim.
- Residual flaky personas in Chrome (Kaiju, slow-cinema) = sim noise on broad/pacing categories, not
  engine defects (engine is correct: API 40/40 + Chrome trace proved Heist locks perfectly).

## 24/7 (local now → cloud at 50+ users)
- scripts/ollama-keepalive.ps1 (+ installer): health-check, auto-restart, model warm, 3090 tuning.
- ⚠️ The security agent removed the sessionToken fallback secret — production CRASHES without
  `SESSION_SECRET` in env. Set it before deploy.
- At 50+ users: move the model to a cloud VM, change `OLLAMA_BASE_URL`/`OLLAMA_MODEL` — no code change.
