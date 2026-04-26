# Kivora 1.0 — Architecture Review & Improvement Plan

**Date:** 2026-04-25
**Reviewer:** Architecture audit (engineering:architecture skill)
**Scope:** Full-stack review of Kivora desktop-first AI study workspace — Next.js 16 web app, Electron desktop runtime, llama.cpp offline AI, Postgres metadata + IndexedDB blob storage.
**Status:** Proposed — pending engineering sign-off on prioritised action items.

---

## 1. Executive Summary

Kivora's architecture is sound for a 1.0 release: the three-pillar product surface (`/workspace`, `/coach`, `/math`) is cleanly mirrored in route groups, the AI runtime is well-abstracted behind a single `callAi()` entry point with a deterministic offline fallback, and the metadata-in-Postgres + blobs-in-IndexedDB split is the right call for a privacy-leaning study product.

The biggest risks today are not architectural mistakes — they are **maturation gaps** that will start to bite as the surface area grows: a few god-files in the dashboard, no runtime schema validation on a 73-route API surface, dormant client-side encryption that is shipping but not enforced, a NextAuth v5-beta dependency with no upgrade plan, and llama.cpp lifecycle code that needs hardening before broader Windows rollout.

This document inventories the current architecture, calls out **17 concrete improvement areas** ranked by priority, and formalises **four** of them as ADRs that need an explicit decision before the next release cycle.

---

## 2. Current Architecture Snapshot

**Frontend.** Next.js 16 (App Router, Turbopack) with two route groups — `(auth)` and `(dashboard)` — plus `api/` for ~73 server route handlers. Client state is React context + ~6 custom hooks (`useFolders`, `useStudyPlans`, `useLocalRuntimeStatus`, etc.); no Redux/Zustand/React Query. `providers/SessionProvider.tsx` and `providers/VaultProvider.tsx` wrap the tree.

**Backend.** Postgres via Drizzle ORM with a multi-provider resolver (Supabase → DATABASE_URL → DIRECT_URL → POSTGRES_URL → POSTGRES_PRISMA_URL). 11 migrations to date. Schema centres on users, accounts, sessions, folders, topics, files, libraryItems, srsDecks/sessions/preferences/reviewHistory, ragFileIndexes, shares, quizAttempts, studyPlans, plannerEvents.

**Auth.** NextAuth.js v5-beta with JWT sessions, Credentials + Google + GitHub + Microsoft Entra providers, TOTP 2FA, and a guest-by-default flow (`lib/auth/guest-session.ts`) that creates ephemeral users with `guest+{sessionId}@local.kivora` emails. Desktop OAuth pins to port 3893 and falls back to guest mode if unavailable.

**Desktop runtime.** Electron 40 hosting the Next.js production server on `127.0.0.1:{port}`. `electron/main.js` orchestrates llama.cpp with three model tiers (Mini 1.5B / Balanced 3B / Pro 7B), startup timeout 25s, request timeout 45s, max 4 restart attempts. IPC bridge in `electron/preload.js` exposes `electronAPI.desktopAI.{generate, health, modelInfo, listModels, getSelection, setModel, completeSetup, installModel, removeModel, downloadStatus}`.

**AI generation.** `lib/ai/call.ts` is the single entry point. Resolution order: privacyMode=offline short-circuit → cloud (Grok → OpenAI) → Ollama at `http://localhost:11434/v1/chat/completions` → deterministic offline fallback (`lib/offline/generate.ts`, 623 LOC, TF-weighted sentence extraction, never throws). Policy enforcement in `lib/ai/policy.ts` gates intent against allowed modes (assignment, summarize, mcq, quiz, notes, math, flashcards, essay, planner, rephrase) with multilingual block patterns.

**Storage.** File metadata in Postgres (with optional encrypted `name`/`content` columns + blind-index columns for searchability), file blobs in IndexedDB (`kivora_blobs_v1`, with auto-migration from legacy `studypilot_blobs_v1`), text extraction client-side via PDF.js, JSZip, Mammoth. AES-256-GCM encryption (`lib/crypto/encryption.ts`, PBKDF2 100k iterations, salt+iv+ciphertext+authTag base64-packed) is implemented but currently disabled by default via `ENCRYPTION_DISABLED=1`.

**Testing.** Node native test runner (no Jest/Vitest), ~20 test files covering AI policy, web rate limiting, theme normalisation, offline generation, SRS algorithm, flashcard importers, deck routes, auth capabilities, DB verification, folder CRUD, math solver, language support, privacy preferences, local runtime, and model checksums. Playwright config exists; visible E2E specs are sparse.

**Build & release.** `npm run electron:build:mac:laptop` is the canonical happy path: stages Mini model, runs `next build` (stable, non-Turbopack), bundles via electron-builder. Model files are excluded from `asar` and shipped as `extraResources`. `release:models:publish` uploads GGUFs + manifest + checksums to a GitHub release; `release:verify` cross-checks before announcement.

---

## 3. What's Working Well

A few things are notably right and worth preserving as the codebase grows.

The **AI fallback chain never throws.** `callAi()` always returns a usable result by cascading cloud → local → offline. For a study app where students need answers even on a flaky connection, this is the correct default and should be the model for any other "external dependency with offline fallback" feature added later.

The **route group separation** is clean — `(auth)` and `(dashboard)` have distinct layouts, the api routes sit beside the pages they serve, and there's no leakage of auth UI into dashboard chrome. New product surfaces can plug in without restructuring.

The **encryption design** (client-side AES-256-GCM with blind indexes for search) is the right architecture for a privacy-positioned study product, even if it isn't currently enabled. The blind-index columns in the schema mean enabling encryption later is a flag flip plus a backfill — not a re-architecture.

The **metadata/blob split** keeps server payloads small and gives users meaningful local sovereignty over their files. Postgres holds folder structure and search-friendly metadata; PDFs and Word docs never leave the device unless the user explicitly syncs.

The **multi-provider DB resolver** (`SUPABASE_DATABASE_URL` → `DATABASE_URL` → `DIRECT_URL` → `POSTGRES_URL` → `POSTGRES_PRISMA_URL`) means contributors can run against a local Postgres in Docker without touching production config — a small thing that compounds over time.

The **deterministic offline generator** (623 LOC of TF-weighted sentence extraction, mode-aware structured output) is unusually thoughtful. Most products would degrade to "AI unavailable" — Kivora produces a usable summary or quiz from pure text analysis. Worth keeping prominent in marketing.

---

## 4. Areas for Improvement — Prioritised

The 17 items below are grouped into P0 (ship-blocking before next release), P1 (in the next quarter), and P2 (track but don't accelerate). File paths cite where the work would land.

### P0 — Address before next release

**4.1 Add runtime schema validation to API routes.** 73 route handlers currently validate request bodies with optional chaining and `as Record<string, unknown>` casts. This is the single largest source of latent bugs and security risk in the codebase. Adopt Zod (small bundle, good DX, plays well with Drizzle). Create `lib/api/validate.ts` that wraps `request.json()` + parse + 400 response. Migrate routes in waves: auth → generate → folders/files → srs → coach. Effort: 3–5 engineer-days.

**4.2 Lock down the encryption default story.** `ENCRYPTION_DISABLED=1` is shipping in production-shaped configs but the schema, vault, and crypto code suggest it was meant to be on. Decide explicitly: (a) ship encrypted-by-default with a master-password onboarding flow, or (b) document encryption as a future feature and remove the dormant code paths from the critical path. The current "implemented but off" state is the worst of both worlds — bundle bloat without the privacy guarantee. See ADR-001 below.

**4.3 Harden llama.cpp process lifecycle.** `electron/main.js` configures `maxRestartAttempts: 4` and a 25s startup timeout, but the audit could not confirm a graceful shutdown handler on app exit, child-process leak guards, or zombie reaping on Windows. Long-running Electron sessions with model swaps will hit this. Add: `app.on('before-quit')` handler that SIGTERMs the llama-server, a 5s SIGKILL fallback, and a heartbeat that detects orphaned processes from prior crashes. See ADR-002.

**4.4 Plan the NextAuth v5-beta exit.** v5-beta has been "beta" for over a year. Two paths: (a) pin to a known-good beta and own the upgrade pain when v5-stable lands, (b) downgrade to v4.x for the 1.0 release and migrate later. Either is fine; "stay on v5-beta and hope" is not. Today's auth surface (Credentials, 4 OAuth providers, 2FA, guest mode, JWT sessions) is small enough that a downgrade is a 1–2 day job. See ADR-003.

**4.5 Stop the dashboard god-files from growing.** `app/(dashboard)/settings/page.tsx` is 1,881 LOC mixing theme, font, density, 2FA, notifications, privacy, analytics, account, language, AI runtime, issue reporting, Ollama setup, and model panels. `app/(dashboard)/planner/page.tsx` is 1,467 LOC. These will only get worse. Introduce a `/settings/[section]` nested route with one file per section (theme, security, ai, account, notifications, privacy, language) and lift shared state into a `SettingsProvider`. Same treatment for planner: extract `Calendar`, `EventEditor`, `ScheduleImporter` components into `components/planner/`.

### P1 — Within the next quarter

**4.6 Unify AI routing.** `lib/ai/server-routing.ts` and `lib/ai/call.ts` both encode cloud→local fallback logic. `call.ts` is the public surface; fold the rest of the routing primitives into it (or move both behind a `lib/ai/index.ts` barrel) and delete the duplication. While there, replace the silent `catch {}` on the Ollama branch with a typed result so callers can distinguish "Ollama unreachable" from "Ollama returned empty content" — useful telemetry for the desktop runtime status hook.

**4.7 Standardise error responses across all routes.** Some routes use `apiError()` from `lib/api/error-response.ts` (good — includes request IDs), others return `NextResponse.json({ error: '...' }, { status: 400 })` directly. Pick one. Recommend: extend `apiError()` to be the only path, add a Next.js `error.tsx` boundary at the dashboard layout level, and wire the existing `/api/errors` endpoint into a client-side error reporter.

**4.8 Add a guest session cleanup lifecycle.** `deleteGuestSessionData()` exists in `lib/auth/guest-session.ts` but the audit could not find the scheduler that calls it. Guest data accumulates indefinitely otherwise. Options: (a) cron-style cleanup via a Vercel scheduled function, (b) opportunistic cleanup on session creation (delete guest users older than N days), (c) cleanup on explicit user sign-out from guest mode. Document the chosen policy in `lib/auth/guest-session.ts` header.

**4.9 Backfill E2E test coverage.** Playwright is configured (`test:e2e` script present) but visible specs are thin. The three flows that absolutely need E2E coverage before each release: (1) guest → upload PDF → generate summary → save to library, (2) sign-up → upload file → generate quiz → study via SRS, (3) desktop install → first-run model download → generate offline. These are the demo paths and the regression paths. Effort: 3–5 days for the first three flows.

**4.10 Add structured rate limit + circuit breaker on cloud AI.** Today's cloud AI flow has 45s timeouts but no exponential backoff and no circuit breaker. A misbehaving Grok or OpenAI will degrade the whole web tier. Wrap `tryCloudGeneration()` in a simple circuit breaker (open after N consecutive failures within M seconds, half-open after cooldown). Surface state via `/api/ai/status` so the client can show "Cloud AI degraded — using local" without waiting for a 45s timeout per request.

**4.11 Lazy-load heavy client libraries.** PDF.js, Tesseract.js, Mammoth, JSZip, and the Mathjs/Nerdamer stack in `lib/math/symbolic-solver.ts` (2,733 LOC) are all candidates for dynamic import on the routes that actually use them. The login page should not be parsing PDFs. Audit with `next-bundle-analyzer` and split.

**4.12 Document the Drizzle migration runbook.** 11 migrations exist; there's no doc on (a) how to add one (`drizzle-kit generate` workflow), (b) how to test a destructive migration locally before staging, (c) how the production migration runs (manual, CI, on-deploy). Add `docs/DATABASE_MIGRATIONS.md`. The triggering use case: a new contributor needs to add a column safely without breaking guest-mode users.

### P2 — Track but don't accelerate

**4.13 Consider a server-state cache layer.** No SWR/React Query today. For the current scope (folders, files, plans, settings) custom hooks + fetch are fine, but as the dashboard grows with realtime collaboration or multi-device sync, the cache invalidation problem will get hard. Pre-decision: monitor; revisit when sync becomes a feature.

**4.14 Tighten typescript coverage on API boundaries.** `as Record<string, unknown>` and `any` usage at route boundaries is acceptable today but becomes brittle as the surface grows. The Zod work in P0 (4.1) will mostly fix this; treat 4.14 as a follow-on tracking item to enable `noImplicitAny` in `tsconfig.json` once routes are clean.

**4.15 Mobile (Capacitor) — decide or delete.** `capacitor.config.ts` is checked in but mobile is not in the documented routes. Either pick up the mobile track explicitly (with a separate route group, touch-optimised components, native plugins for IndexedDB-equivalent storage) or remove the config to reduce confusion. Today it's signal noise.

**4.16 Centralise the AI system prompt.** The desktop llama.cpp wrapper hardcodes a system prompt; web routes assemble their own per-mode. As policy evolves (and it will — see `lib/ai/policy.ts`), prompt drift between desktop and web becomes a correctness bug. Move all system prompts into `lib/ai/prompts/` keyed by mode, import from both surfaces.

**4.17 Telemetry — pick a story.** `useAnalytics.ts` hook exists, `/api/analytics` endpoint exists, but the audit could not determine the destination (PostHog? Mixpanel? Self-hosted? Off?). Document in `docs/TELEMETRY.md`: what events are emitted, where they go, how guest-mode users are handled, what the privacy policy says. This is also a GDPR question — see the `gdpr-compliance` skill.

---

## 5. ADRs Requiring Explicit Decision

The following four items are large enough that they need a written decision rather than just a backlog ticket. ADR templates below; fill in deciders and target the next architecture sync.

### ADR-001: Encryption Default — Enable, Defer, or Remove

**Status:** Proposed
**Date:** 2026-04-25
**Deciders:** Engineering lead, Product, Security

**Context.** Client-side AES-256-GCM encryption with blind indexes is implemented across `lib/crypto/{encryption,vault,secure-storage}.ts` (~900 LOC) and the schema has dedicated columns (`name_index`, `content_index`). Today it ships disabled via `ENCRYPTION_DISABLED=1`. The marketing positioning of "your data stays yours" implies encryption is on; the implementation says it isn't.

**Decision.** Choose one explicitly.

| Dimension | A: Enable by default | B: Defer to v1.1 | C: Remove from 1.0 |
|-----------|---------------------|-----------------|--------------------|
| User onboarding | +1 step (master password) | No change | No change |
| Marketing claim | Truthful | Marketing must be hedged | Marketing must be hedged |
| Engineering work | Onboarding flow + key recovery (5–8 days) | Move feature flag, add UI gate (1 day) | Remove code paths (2 days) |
| Risk | Lost master password = lost data | Dormant code rot | Loses a future differentiator |
| Recommended | If product wants the privacy story now | If there's no time to build recovery | If encryption isn't actually a near-term roadmap item |

**Recommendation.** Option B for 1.0 with a documented v1.1 ship date. The code is too well-built to delete and the recovery UX is too important to rush.

### ADR-002: llama.cpp Process Lifecycle on Desktop

**Status:** Proposed
**Date:** 2026-04-25
**Deciders:** Desktop engineering, Platform

**Context.** `electron/main.js` spawns llama.cpp as a child process with restart-on-crash logic. Long Electron sessions, model swaps, and Windows-specific process semantics create three failure modes: (1) zombie processes from prior crashes holding the model file, (2) silent restart loops consuming CPU, (3) processes surviving app quit on macOS when the dock icon is closed but the app continues running.

**Decision.** Adopt a documented lifecycle contract.

Required behaviours: SIGTERM with 5s grace period then SIGKILL on `app.before-quit`; PID file at `{userData}/runtime.pid` with stale-PID cleanup on app start; a circuit breaker that pauses restart attempts after 4 failures within 60s and surfaces a "runtime unavailable" state to the renderer; structured logs per restart with cause classification (startup-timeout, request-timeout, OOM, exit-code).

**Consequences.** Renderer must handle a "runtime unavailable" state in `useLocalRuntimeStatus.ts`. Settings page needs a "restart runtime" action. Telemetry adds a `runtime.restart` event with cause. Effort: 4–6 days including Windows verification.

### ADR-003: NextAuth v5-Beta Exit Plan

**Status:** Proposed
**Date:** 2026-04-25
**Deciders:** Engineering lead, Security

**Context.** `next-auth@5.x-beta` has been the dependency for over a year. Beta means breaking changes between minor versions and no LTS commitment. The current auth surface (Credentials + Google + GitHub + Microsoft + TOTP 2FA + guest mode + JWT sessions) is implemented across `auth.ts` and `lib/auth/config.ts` (~314 LOC).

**Decision.** Pick a path before the 1.0 announcement.

| Option | Pros | Cons |
|--------|------|------|
| Pin to v5-beta.X, own upgrades | Modern API, no migration today | Breaking changes land at upstream's pace |
| Downgrade to v4.x | Stable, well-documented, security patches | 1–2 day migration; v4 API is older |
| Replace with Lucia/Auth.js Core directly | Full control, no framework lock-in | 5–7 day migration; team learning curve |

**Recommendation.** Pin v5-beta with a documented upgrade owner and quarterly upgrade cadence. The migration cost away from NextAuth is high enough that betting on it stabilising is reasonable — but only with an owner and a calendar.

### ADR-004: API Validation Strategy

**Status:** Proposed
**Date:** 2026-04-25
**Deciders:** Backend engineering

**Context.** 73 API routes today, growing. No runtime validation library; routes use TypeScript types + optional chaining, which TypeScript erases at runtime. Recent pattern in `app/api/folders/[folderId]/route.ts` and `app/api/srs/[deckId]/route.ts` (and others) reads the body into `Record<string, unknown>` and trusts the shape. This is the source of latent 500s and the route layer most likely to surface a security issue.

**Decision.** Adopt Zod as the runtime schema validator. Add `lib/api/validate.ts`:

```ts
export async function validateBody<T>(req: NextRequest, schema: z.ZodSchema<T>): Promise<
  { ok: true; data: T } | { ok: false; response: NextResponse }
> { /* parse + 400 with structured errors */ }
```

Define one schema file per route domain in `lib/api/schemas/{folders,files,srs,generate,coach,...}.ts`. Backfill in waves; gate new routes on schema-first via PR template + lint rule.

**Consequences.** ~3KB Zod added to the server bundle (acceptable). Routes become 5–10 LOC longer but uniformly readable. Drizzle types and Zod schemas should be co-located to keep them in sync. Effort: 3–5 days for backfill.

---

## 6. Recommended Action Plan

The cleanest sequencing for the next two release cycles.

For the **next release (P0 only)**, focus on the four ADRs and two execution items: validate API inputs with Zod (4.1), make an explicit encryption decision (4.2 / ADR-001), harden the desktop runtime lifecycle (4.3 / ADR-002), commit to a NextAuth direction (4.4 / ADR-003), and break up the settings + planner god-files (4.5). Total estimate: 12–18 engineer-days for one engineer or 6–9 days with two.

For the **following quarter (P1)**, unify AI routing (4.6), standardise error responses (4.7), document the guest cleanup lifecycle (4.8), backfill the three critical E2E flows (4.9), add the cloud-AI circuit breaker (4.10), lazy-load heavy libraries (4.11), and write the migration runbook (4.12). Total estimate: 15–20 engineer-days.

P2 items (4.13–4.17) belong on the tech-debt backlog with quarterly review — none are urgent but each will become urgent if ignored for a year.

---

## 7. Open Questions for the Next Architecture Sync

A few things this audit could not determine from the code alone and which need product or eng input before the ADRs above can be finalised.

The audit could not confirm whether the production deployment actually runs with `ENCRYPTION_DISABLED=1` or whether that's a dev-only flag — needs a check against the deployed env config before ADR-001 is decided. The audit also could not locate the destination for `useAnalytics` events (4.17) — this is a precondition for the GDPR review. And the desktop runtime audit was limited to the first 100 LOC of `electron/main.js`; a full read is needed before ADR-002 can be sized accurately.

---

*Generated via the engineering:architecture skill. Companion artifacts: this file plus four ADRs (001–004) to be split into individual files under `docs/adr/` once decisions are made.*
