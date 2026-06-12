# CineMind — The Taste Formula (v1)

The documented template for how the engine narrows questions interactively and
converges on the individual taste of every user — down to the sub-genre.

---

## 1. The Taste Vector

Every user is a vector over TWO layers of axes:

```
T(user) = { genre axes }  ∪  { sub-genre (niche) axes }
            g:28 Action          k:parody
            g:27 Horror          k:slasher
            g:35 Comedy          k:whodunit
            ...19 axes           ...40+ niches
```

- **Genre axes** come from TMDB genre ids (existing).
- **Niche axes** come from TMDB keywords mapped into a curated taxonomy
  (`src/lib/engine/subGenres.ts`). Keys are prefixed `k:` and ride the same
  `userAffinities` map (taste derivation skips them for archetype math).

## 2. The Update Rule (per answer)

For a vote `v ∈ {1..5}` on a movie with genres `[g₀, g₁, ...]` and niches `[k₁..kₙ]`:

```
base     = v − 3                          // −2 … +2
polarity = base > 0 ? 2 : 3               // love amplified ×2, hate punished ×3
IDF(g)   = informativeness weight          // Action 0.85 … Mystery 1.15

Genres:   Δaff[g₀] = base · polarity · 1.0 · IDF(g₀)      // primary: full
          Δaff[gᵢ] = base · polarity · 0.5 · IDF(gᵢ)      // secondary: half, LOVE ONLY
          (negative votes touch the PRIMARY genre only — hating a comedy-drama
           means hating the comedy, not drama)

Niches:   Δaff[k] = base · polarity · 0.75                 // each tagged niche
          (niches are rarer and self-selected — no primary/secondary order,
           but capped at 4 niches per movie to prevent tag-spam dilution)

Latent:   strong Crime ∧ Thriller (> Action) ⇒ Mystery := 0.9 · max(Crime, Thriller)
          (inference never outranks observation)
```

**The Scary Movie rule**: "Scary Movie" carries genres [Comedy, Horror] but
niches [k:parody, k:slasher-adjacent]. A 5★ vote moves `k:parody +3` while
Comedy moves only +3.8·IDF — and the DRILL phase (below) then serves a *pure*
comedy and a *pure* parody to separate the hypotheses. Loving parody ≠ loving
comedy, and the vector keeps them distinct.

## 3. The Question Routing (Explore → Drill → Confirm)

```
Phase 1 — EXPLORE (Q1–Q12, deterministic coverage)
  12 taste buckets × rotating representative (session-seeded).
  Every genre axis gets measured at least once. No bucket repeats.
  Purpose: locate the user's macro-region in taste space.

Phase 2 — DRILL (Q13+, adaptive)
  After every answer, rank axes by |signal| and ambiguity:
    target  = argmax over axes A of  (evidence(A) · uncertainty(A))
  where uncertainty is high when sibling niches share evidence
  (comedy vs parody, slasher vs supernatural, space-opera vs cyberpunk).
  Serve movies that maximally SEPARATE the live hypotheses:
    - liked a parody-tagged comedy? → serve a pure comedy AND a pure parody.
    - liked two crime-thrillers?    → serve a pure whodunit (Mystery axis).
  Implementation: TMDB discover filtered by the contested genre, then scored
  client-of-the-engine-side by niche purity (movie that carries ONE of the two
  contested niches, not both).

Phase 3 — CONFIRM / COMPLETE
  Completion gates: ≥15 answers; conf≥0.97 after 18; ≥26 & conf≥0.85; hard cap 40.
  Precision beats speed: more questions for an exact read > fewer for a guess.
```

## 4. The Recommendation Score

Final movies are ranked by the full vector — NOT popularity order:

```
S(movie | user) = Σ_genres  aff[g] · w(position) · IDF(g)
                + Σ_niches  aff[k] · 2.0          // niches dominate: this is
                                                   // where individuality lives
                + serendipity(movie)               // small bonus to high-rated
                                                   // low-popularity matches
   gated by:  any genre with aff ≤ −4 ⇒ S = −∞    // hard negative gate

match% shown to user = normalized S (real, per movie — not a constant).
```

## 5. Signal Integrity Rules (bugs this formula survived)

| Rule | Bug it prevents |
|------|-----------------|
| First answer must update the vector | init pre-push silently discarded vote #1 |
| 429/5xx votes retry, never swallowed | shared-IP rate limit eroded taste signal |
| Negative votes hit primary genre only | comedy-drama hate cratered Drama lovers |
| IDF on over-represented genres | fantasy lovers drifting to "Action Junkie" |
| Same-title dedup (id + title) | remakes felt like duplicate questions |
| Session-seeded bucket rotation | monotone quizzes; unmeasured taste axes |

## 6. Live Instrumentation

The 31-persona swarm (visible, human-like Chrome) validates every change:
archetype accuracy, sub-genre accuracy (planned: parody-vs-comedy persona),
posters load, trailers load and match, no duplicates, every page healthy —
churn target 0%, then and only then ship.
