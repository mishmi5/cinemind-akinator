# Wave-2 Certainty Plan — for approval

## 0. Done already
- PR #1 MERGED to main (2ddc5ea). Production build passes.
- 31/31 wave-1 report delivered (persona × recs × niches) for manual review.
- 30 wave-2 personas authored (personas-wave2.js) — niche-first, new tastes.

## 1. BLOCKER — deploy needs you (2 minutes)
Vercel CLI is installed but NOT authenticated; `vercel whoami` hangs on
interactive login. Two options:
  a) Run `npx vercel login` once in the terminal (browser flow), then I link
     the project (`npx vercel link`), set env vars (TMDB_API_KEY + Stripe +
     PostHog when ready), and deploy `npx vercel --prod` autonomously.
  b) Connect the GitHub repo to a Vercel project in the dashboard — every
     push to main auto-deploys. (Recommended: set TMDB_API_KEY in project env.)

## 2. Wave-2 swarm (after approval)
30 new personas, three difficulty rings:
- 10 niche specialists — same archetype, different sub-genre identity
  (parody vs supernatural vs found-footage; heist vs spy vs noir).
- 8 cross-genre hybrids — two competing axes (rom-zom-com, sci-fi romantic,
  action mom, epic historian).
- 6 casuals by age/context + 6 stress behaviors (speed clicker, back-button
  abuser at 15% per question, 55% never-seen, trailer-before-everything,
  4-page site wanderer, all-4s enthusiast).

New validations on top of wave-1's:
- Subscription TIER: each persona has expectedTier (elite ₪34 / starter ₪9).
  Harness verifies the paywall presents BOTH offers with correct pricing and
  records which tier the persona's profile justifies; report includes tier.
- Niche accuracy: report asserts the persona's signature niche appears in
  their measured nicheLoves (e.g., Parody Connoisseur must show k:parody or
  k:dark-comedy positive).
- Trailer scrutiny: trailerFocus personas check up to 5 trailers; the
  trailer-everything persona opens one on EVERY question with a trailer.
- Wandering: wanderer personas audit 4 pages with scroll-through reading.

Exit criterion: 30/30 subscribe with correct tier + correct niches. Loop
fix→rerun as before (code freeze during runs; replay for diagnosis).

## 3. Additional certainty angles (proposed, pick any)
- A. Drill-phase implementation (TASTE-FORMULA §3): ambiguity-driven probes
  (parody-vs-comedy disambiguation pairs) instead of random TMDB pages.
  Biggest remaining accuracy lever. ~2-3h work + validation wave.
- B. Recommendation QUALITY floor: penalize vote_average < 6.5 candidates
  ×1.5 unless niche-perfect — kills "365 Days"-class picks for snobs
  (observed in wave-1: Theater Snob got After-We-Fell-grade titles).
- C. Mobile-RTL visual audit: screenshot-based check (he locale, 390px) for
  layout breaks on all pages.
- D. Payment-flow E2E (Stripe test mode): persona clicks ₪9 CTA → checkout
  session created (requires STRIPE_SECRET_KEY test key).
- E. Cold-start latency budget: assert first question < 3s, posters < 2s.
- F. Accessibility pass (axe-core) on the 5 core pages.

## 4. Known bugs/observations from wave-1 review (queued)
1. Theater Snob / Wedding Planner / Festival Critic got low-brow romance
   recs (365 Days, After We Fell) — quality floor (item B) fixes.
2. K-Drama Addict recs drifted to comedy/animation (טד, רטטוי) — second-genre
   ordering in discover + item B.
3. Whodunit Bookworm got באטמן (action-adjacent) — niche injection helps but
   whodunit keyword id may resolve loosely; tune mapping.
4. Festival Critic/Documentary Purist niches show gangster/revenge leakage
   from 1-votes on crime — cosmetic in report (negative niches displayed as
   loves threshold is ≥2; their +3 came from drama reps' tags). Verify.
5. Junk root files (`0.3)`, etc.) reappeared once — suspect a stray script;
   add a guard or find the writer.
6. /daily + share-card built but not linked from results page (growth wiring).

## 5. Suggested run order
1) You: vercel login (unblocks deploy) — parallel to everything.
2) Me: wire tier+niche+wander checks into harness (1 patch), code-frozen run
   of wave-2 (~80 min), loop until 30/30.
3) Then: items B (quality floor) + A (drill phase) + revalidation wave-3.
4) Deploy to prod + smoke test on the live URL.
