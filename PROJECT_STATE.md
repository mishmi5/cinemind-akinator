# CineMind Studio - Project State & Handoff Document
**Target Agent:** Antigravity (or any incoming AI Agent)
**Project Path:** `C:\Users\EDOZA\Desktop\cinemind-akinator`
**Language:** TypeScript, Next.js 16.2.6 (App Router)
**Tone & Style:** "Israeli snarky/sarcastic" with heavy FOMO & Gamification.

## Core Architecture
- **Framework:** Next.js 16.2.6
- **Database:** Firebase Firestore (Admin SDK for server-side auth & ledger writes).
- **Core Loop:** Users take a dynamic 20-question movie quiz. When finished, their taste is evaluated.

## Accomplished Phases
### Phase 1 & 2: Infrastructure & Economy (COMPLETED)
- Created `src/types/firebase.ts` defining `UserDoc`, `TasteVector`, `EconomyState`, `LedgerEvent`, `ShareCard`, `Duel`, and `LiveEvent`.
- Created `firestore.rules` - Clients CANNOT modify their economy, taste vectors, or streak. All progression is server-authored.
- Implemented `/api/user/bootstrap` API - Idempotent endpoint that runs a transaction when the quiz completes, creates the user, grants XP/Tokens via a Ledger Event (`QUIZ_COMPLETED`).

### Phase 3: The Roast Card (COMPLETED)
- Implemented `src/lib/taste/deriveTaste.ts` which uses deterministic templates to assign an archetype (e.g. "The Pretentious Cinephile") and a funny, insulting roast based on the user's genre affinities.
- The `bootstrap` API was updated to derive the roast securely on the server.
- Implemented `/api/cards/route.ts` which securely generates a `ShareCard` in Firestore.
- Implemented `src/app/[locale]/cards/[id]/page.tsx` and `opengraph-image.tsx` (Node.js runtime, not Edge, to support `firebase-admin`).

### Phase 4: Frontend Roast Integration (COMPLETED)
- Created `createCard.ts` and `share.ts` client utilities to interface with the cards API and Web Share API.
- Implemented `RoastReveal`, `RoastCard`, and `ShareBar` UI components.
- Wired a live Firestore mirror into `AuthContext` to sync `userData` to the client.
- Injected `<RoastReveal />` unconditionally at the end of the `session.isComplete` branch in `scan/page.tsx` to serve as the viral share loop.

## Current Phase
### Phase 5: Unknown (Waiting for User Direction)

## Instructions for Incoming Agents
1. **READ THIS FILE FIRST.**
2. If continuing work, check `task.md` in your artifact directory for granular steps.
3. Consult Claude Code (via CLI) for high-level architectural decisions. Antigravity acts as the Executor, Claude acts as the Architect.
4. Keep all user-facing documentation and artifacts in **Hebrew** with RTL wrapper (`<div dir="rtl">`).
