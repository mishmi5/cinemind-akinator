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

## 8. Exposure-Adjusted Serving — the Beta-Binomial skip weight (v11)

A NOT_SEEN carries **zero taste signal** (it's an omitted item, MCAR — see
`notseen-is-omitted-item`), so it never touches the affinity vector, the rated
clock, or confidence. But it carries a strong **exposure** signal: a genre the
user keeps skipping is one we should stop spending questions on.

Per genre we keep a tally `{n, s}` — `n` = times SERVED, `s` = times SKIPPED — and
derive a continuous serving weight:

```
w_g = (N_g − S_g + 2) / (N_g + 3)        // posterior mean of a Beta(2,1) prior
```

- Unseen genre → 0.67 (gentle optimism). Always-rated → →1. Always-skipped → →0.
- This **replaces the brittle binary** "exclude after 3 skips": a skip-rate, not a
  cliff. A genre is hard-excluded from the live `discover` query only once
  `w_g < 0.3` **and** `N_g ≥ 3` (sustained, not one unlucky miss), capped at 3
  exclusions so a horror lover who hates comedy keeps horror-comedies.
- `P(seen)` of a whole movie = `min` of its genres' weights (one reliably-skipped
  tag sinks the title — a disliked niche can't ride in on a popular co-genre).

## 9. Adaptive Stopping by Standard Error (v11, CAT/IRT)

Question selection and the stop rule are now information-theoretic:

```
effective_EIG(movie) = EIG(movie) · P(seen)        // research-backed item pick
   EIG(movie)  = Σ_genres (1 − |tanh(aff/4)|) · IDF // high where taste is UNKNOWN
   P(seen)     = min_g w_g                          // §8 exposure weight
```

Live candidates are ranked by `effective_EIG` and sampled from the top few (not
pure argmax — keeps quizzes varied). We spend each question where taste is most
uncertain **and** the user is most likely to have actually seen the title.

Stopping uses the estimate's **standard error**, not an ad-hoc confidence drip:

```
infoSum += base² · IDF(primary)  (+0.5·base² if the movie carries niches)
SE = 1 / √(1 + infoSum)            // shrinks as informative ratings accumulate
```

`base² ∈ {0,1,4}` — a fence-sitting 3★ adds **zero** information, a decisive 1★/5★
adds four. Completion gates (RATED clock only; NOT_SEEN never advances):

```
ratedCount ≥ 18 ∧ SE ≤ 0.13   ⇒ done   (decisive raters exit ~18 Qs)
ratedCount ≥ 26 ∧ SE ≤ 0.20   ⇒ done
ratedCount ≥ 40               ⇒ hard cap (fence-sitters; never premature)
```

A heavy skipper who skips 55 and rates 8 is therefore **never** rushed to a
low-confidence read — they keep getting questions until 15+ informative ratings
land. Validated headless (decisive→18 Q, skipper→18 rated/31 screens,
fence-sitter→40, all-hater→3 recs) and by the live persona swarm.

## 7. Planned: Niche-Direct Candidate Injection (post-v9)

When a niche axis is strong (aff[k:niche] ≥ 4), the recommendation pool gains a
second discover pass: `with_keywords=<id1>|<id2>` using a reverse map
niche → representative TMDB keyword IDs. **OR semantics (`|`), never AND (`,`)** —
multiple strong niches must WIDEN the candidate stream, not intersect it to
nothing (the same starvation failure mode as the over-eager `without_genres`).
Injected candidates carry the niche tag by construction, so the vector score
can finally reward esoteric tastes with esoteric movies.
