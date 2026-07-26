# CineMind — The Goal (`/goal` loop)

> Living spec of what "done" means for the taste engine. Updated as עידו refines it.
> Reasoning/explanations to עידו are in Hebrew; all code stays in top-tier English.

## North Star

A movie-taste quiz whose engine reads taste **surgically at sub-genre resolution** —
"loving *Scream* ≠ loving horror; maybe you love **slashers**" — and this surgical
behavior must hold for **every genre and style in the world, not just horror/slashers**.
Take exactly what works in the slasher case and generalize it to all genres.

The mechanism must nail each persona's precise sub-genre AND avoid their hated styles,
no matter how adversarial the persona.

## Engine (decided & built — deterministic)

The LLM's per-turn navigation proved unreliable, so the engine is **deterministic**
(`/api/brain-question` + `src/lib/brain/tmdb.ts`); the LLM is used only for natural
rec reasons (templatable):

- PROBE every distinct sub-genre with curated iconic exemplars (title-resolved, `(YYYY)`-disambiguated).
- SCORE by strong-hit count (≥4★), robust to noisy pools.
- EXPLORE the full sub-genre sweep, THEN EXPLOIT (drill the leader). Narrow-before-broad
  ordering breaks 5★ ties between near-neighbours.
- RECOMMEND deterministically from curated canonical seeds per confirmed sub-genre.
- Confidence reflects genuine understanding (sweep coverage × lock confirmation), not clicks.

**Coverage = ALL genres.** Currently ~47 sub-genres across horror, sci-fi, animation,
action, western, crime/noir, comedy, drama, fantasy, musical. Keep expanding until every
real-world taste resolves surgically (add families/sub-genres as new adversarial waves
expose gaps).

## Open goal items (added by עידו)

1. **Generalize the surgical approach to ALL genres/styles** — not horror-centric.
   Continuously widen the sub-genre taxonomy; every wave that finds a gap → add it. ✅ in progress.

2. **Default engine = the brain.** Make the deterministic sub-genre brain the DEFAULT
   for all users in production (not behind `?brain=1`). The v12 formula becomes the fallback.

3. **Persona QA runs in PHYSICAL Google Chrome tabs.** The 20-persona acceptance tests
   must drive the REAL UI (`/scan?brain=1`) in actual Chrome tabs — clicking stars in the
   live frontend — so each persona surfaces real findings and I fix/improve accordingly.
   (Fast API runs may be used only for quick logic debugging, never as the acceptance gate.)

4. **24/7 automatic, self-healing LLM** so the site serves customers around the clock with
   zero manual reconfiguration:
   - **Now:** local `ollama` (qwen2.5:14b-instruct) auto-started and kept alive 24/7
     (run as a service / auto-restart on boot & crash). A **health check + automatic
     recovery** so a stuck/down model is detected and restarted fast and autonomously.
   - **Backup / graceful degradation:** if the LLM is unavailable, the deterministic core
     (which barely needs the LLM) still returns correct results — recs fall back to curated
     seeds + templated reasons, so customers never hit a broken experience.
   - **When first customers arrive:** migrate to a cloud-hosted model (always available,
     not tied to עידו's machine).
   - Goal: no bugs surfacing while real customers use the product — fast, autonomous, robust.

5. **When everything is perfect & defined — a simple "how to run it" guide** for עידו:
   plain steps so the LLM works on the site automatically, always on, without re-defining
   it each time.

6. **Trailers must ALWAYS show + poster/title/trailer must be synced.** Every quiz card
   shows a working "▶ Watch Trailer" button, and the poster, title, and trailer all belong
   to the SAME movie. `getTrailer` degrades Trailer→Teaser→any YouTube (no en-US-only
   filter) so anime/foreign/older titles still get a clip. Personas must guard this every
   run (a missing trailer = a harness gap). ✅ fixed 2026-06-15 (see FINDINGS.md).

7. **Contradiction lowers the confidence meter.** If the user answers a question that
   CONTRADICTS the current taste hypothesis (e.g. rates another exemplar of an already-loved
   sub-genre LOW, or flips on a confirmed family), the progress/confidence meter must go
   **DOWN** accordingly and the lock is withheld until the term is re-confirmed. This
   deliberately lengthens the quiz in exchange for the most accurate final recommendation.

8. **No two questionnaires alike (variety).** The sweep order and shown exemplars vary
   per session (seeded by sessionId), so repeat users never see the same sequence — WITHOUT
   breaking correctness (full sweep still covers all; drill-off still uses both exemplars).
   Variety spans ALL world/Hollywood tastes (rom-com, heist, kaiju, western, noir, musical,
   anime, slow-cinema…), never just slashers. Personas must assert order-uniqueness.

## Acceptance (the loop)

- Build a wave of 20 adversarial personas (distinct/niche/fine-split tastes).
- Run them **in physical Chrome tabs** against the live brain.
- For each: identify the precise sub-genre AND avoid hated styles (strict judge, ≥90).
- Fix/expand until 20/20 surgical. Then generate a HARDER wave. Repeat until saturation —
  the mechanism nails every taste no matter how aggressive the persona.
- Do not stop until certain it recommends surgically for ANY persona.

## Status snapshot (2026-06-14)

- WAVE1 (20 mainstream): 20/20 surgical — committed.
- WAVE2 (20 niche/fine-split): taxonomy expanded 27→47; full re-run in progress.
- Pending: Chrome-tab harness, brain-as-default, 24/7+health+backup, run guide, length
  optimization (safe family-based early-stop so quizzes aren't a fixed ~48 questions).
