# Claude Code Surgical Audit Results 🔍

The audit is complete. Here's what the four-stream surgical audit found:

## Top-line: 3 critical clusters

**1. Monetization-bypass exploit in the scan flow** 🔴
The server is fully stateless — quiz state round-trips through client-controlled headers/body. `api/user/bootstrap` grants XP + paywall-bypass **popcornTokens** from a **client-forged `tasteVector`** with zero server-side proof the quiz happened, and its idempotency key (`quiz_completed_${tasteVector.totalAnswers}_${uid}`) is derived from a client value. → `curl` the endpoint, vary the number, mint unlimited rewards. (SCAN-2, SCAN-3)

**2. The English locale is effectively broken** 🔴
8 of ~14 routes (admin, arena, leaderboard, pricing, login, profile, privacy, terms) hardcode **both** `dir="rtl"` and Hebrew literals, ignoring locale. `/en` visitors get Hebrew in forced RTL, plus a Hebrew `<title>`/meta description site-wide from `layout.tsx`. (UI-1, I18N-3)

**3. The roast archetype is broken for everyone** 🔴
`deriveTaste.ts` matches English genre **names** (`'Action'`, `'Romance'`) against affinities keyed by numeric TMDB genre **IDs** (`'28'`, `'10749'`). Nothing ever matches → near-everyone collapses to *"The Pretentious Cinephile"*; 6 of 7 archetypes are unreachable. (SCAN-1)

## Good news
- **i18n key parity is perfect** — `en.json`/`he.json` have identical 71-key trees, zero missing/empty/untranslated. The i18n problem is *coverage*, not *drift*.
- Async `params` are correctly awaited everywhere (clean for Next 16), `proxy.ts` middleware rename is correct, no client/server boundary violations.

## Also notable
- 🔴 **Duplicate Stripe webhook** — `api/webhooks/stripe` (plural) skips signature verification entirely → event forgery. (NEXT-2)
- 🔴 **`firebase-admin` in the OG image route** with no `runtime='nodejs'` pin → crashes under Edge. (NEXT-1)
- 🔴 **`cron/abandoned` auth check commented out** → publicly callable email/Telegram trigger. (NEXT-11)
- 🟠 Fast finishers lose everything: bootstrap only fires `if (… && user)` but anonymous sign-in is async → blank roast, no error, no retry. (SCAN-4)
- 🟠 "20-question quiz" is neither bounded nor deterministic (35→480+ questions). (SCAN-6)

## Single highest-leverage fix
**Persist the quiz session server-side** — the `sessions` collection already exists in `COLLECTIONS`. Have `next-question` write it and `bootstrap` read+validate `isComplete` from it, keying idempotency on a real `sessionId`. That one change neutralizes SCAN-2, SCAN-3, and de-risks SCAN-11.
