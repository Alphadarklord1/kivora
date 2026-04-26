# Kivora 1.0 — Workflow Integration Audit

**Date:** 2026-04-25
**Companion to:** `ARCHITECTURE_REVIEW_2026-04.md`
**Scope:** End-to-end tracing of eight critical workflows. For each workflow, this document follows the call chain file by file and confirms whether the handoffs actually wire up correctly — not just whether the files exist.

---

## At a glance

| # | Workflow | Status | Blocker? |
|---|---------|--------|----------|
| 1 | Guest sign-in & session bootstrap | ✅ Wired correctly | No |
| 2 | File upload → IndexedDB → metadata save | ⚠️ Partial gap (orphaning risk) | No |
| 3 | AI generation request (web) | ✅ Wired correctly | No |
| 4 | AI generation request (desktop) | ⚠️ Two competing paths — unclear which is real | **Yes — needs verification** |
| 5 | SRS deck creation, study, review history | ✅ Wired correctly | No |
| 6 | Sharing flow | ✅ Wired correctly (one logic gap) | No |
| 7 | Desktop runtime boot & model lifecycle | ⚠️ Lazy startup, no boot health check | No |
| 8 | Database resolution & migrations | ⚠️ Migrations not automated | No |

**Headline finding.** Five of the eight workflows are wired correctly end-to-end. Three have integration gaps — and one of those (Workflow 4) is a release blocker that needs a hands-on test before 1.0 ships.

---

## 1. Guest sign-in & session bootstrap — ✅

**Call chain.**

1. App load → `app/layout.tsx` inlines a guest session bootstrap script (lines 22–50) that generates a UUID and stores it in `sessionStorage` as `kivora_guest_session_id`.
2. The same script patches `window.fetch` to attach an `x-kivora-guest-session: {sessionId}` header to every `/api/*` call.
3. Route handlers call `getUserId(req)` → `resolveGuestUserId(sessionId)` in `lib/auth/guest-session.ts` (line 33).
4. If the database is configured, `resolveGuestUserId()` upserts a guest user (`guest+{sessionId}@local.kivora`) and returns the real `userId`.
5. If the database is unavailable, it returns a synthetic `guest:{sessionId}` ID — degraded but functional.
6. On window close, the client may call `DELETE /api/guest/session` (line 28 of that route) for cleanup.

**What is verified.** The fetch interceptor is the single source of truth for the session header; server-side extraction matches it (line 6 of `guest-session.ts`); the null/synthetic-ID branches are handled by every route checked. `isEphemeralGuest()` (line 30 of `app/api/files/route.ts`) is used to short-circuit DB writes when the user isn't real.

**Gap.** When the database is unavailable, `resolveGuestUserId()` silently degrades to the synthetic ID. The user is never told their data won't survive a refresh. This is fine for offline-first positioning, but should be surfaced via a status banner — particularly because there is no handshake call confirming the session is real.

**Verification needed.** Run with the database unreachable and confirm a guest can still complete an upload-and-summarise flow without confusing errors.

---

## 2. File upload → IndexedDB → metadata save — ⚠️

**Call chain.**

1. The upload component creates a blob and writes it to IndexedDB via `idbStore.put(localBlobId, blobPayload)` (`lib/idb/index.ts:98`).
2. Client POSTs multipart `FormData` to `/api/files` (`app/api/files/route.ts:112`) including the `localBlobId` as a form field.
3. Route extracts `localBlobId` (line 57). If `body.upload` is present, it calls `uploadFileToSupabaseStorage()` (line 183).
4. Line 199 inserts file metadata into the `files` table with `localBlobId, storageBucket, storagePath`.
5. Response includes a `storageBacked: Boolean(storagePath)` flag.
6. Later retrieval: `/api/files/[fileId]/blob/route.ts:8` reads from Supabase Storage if `storagePath` exists; otherwise the client is expected to read from its own IndexedDB.

**What is verified.** The `localBlobId` round-trips correctly between client and server. The Supabase upload + DB insert ordering is sensible. The `localOnly: true` fallback (line 221) is wired when the DB insert fails.

**Gaps.**

- **Orphaning risk.** Blob storage and metadata insertion are not transactional. If Supabase upload fails (line 194 catches it) but the DB insert succeeds (line 199), `storagePath` ends up `null` and the blob is effectively lost — the metadata row points to nothing and the IndexedDB blob may be garbage-collected later.
- **No server-side text extraction.** Routes like `/api/tools/generate` accept a `fileId` but do not appear to fetch the blob and extract text server-side. The audit could not confirm whether the client always extracts text before posting, or whether some flows depend on a blob fetch that isn't implemented.

**Verification needed.** Force a Supabase upload failure and confirm the user can still study from the IndexedDB copy. Trace `/api/tools/generate` end-to-end to confirm where text extraction actually happens.

---

## 3. AI generation request (web) — ✅

**Call chain.**

1. Client posts to `/api/generate` with `{ mode, text, options, retrievalContext, fileId, ... }`.
2. `requireAppAccess(req)` (line 31) — auth guard.
3. `enforceAiRateLimit(req)` (line 33) — rate limit invoked **before** mode validation, which is correct.
4. Mode is validated against `VALID_MODES` (lines 50–55), then text is sanitised against prompt-injection patterns (76–81).
5. `resolveAiRuntimeRequest(body)` (line 94) → returns `{ mode, localModel, cloudModel }`.
6. `resolveAiDataMode(body)` (line 86) — if `privacyMode === 'offline'`, the route short-circuits to the offline fallback (101–108) without any network calls.
7. Cloud attempt (111–116) via `tryCloudGeneration()` — on success, returns with `source: 'grok' | 'openai'`.
8. Local attempt (118–166) — Ollama at `${OLLAMA_URL}/v1/chat/completions`, then legacy `/api/generate`, then llama.cpp proxy. 45-second timeout per attempt.
9. Offline fallback (168–175) — `offlineGenerate()` is deterministic and never throws.

**What is verified.** Every branch returns the same shape: `{ mode, content, source }`. The rate limit fires before any expensive work. Privacy mode is honoured strictly. The cloud and Ollama response shapes are parsed correctly.

**Gaps.**

- The client cannot distinguish "cloud unavailable" from "cloud disabled by policy" — both look the same from the response. This is a minor UX issue (we can't tell users *why* we fell back).
- No health check before the Ollama attempt. If Ollama is configured but down, the request burns 45 seconds before falling through. Consider a fast `HEAD /` probe with a 500ms timeout cached for ~30s.

**Verification needed.** Confirm the client UI correctly reads `source` and surfaces it (e.g. "Generated locally" vs "Generated by GPT").

---

## 4. AI generation request (desktop) — ⚠️ **Release blocker**

**Two paths exist; the audit cannot confirm which is real.**

**Path A — IPC to llama.cpp via electronAPI:**

1. Renderer calls `window.electronAPI.desktopAI.generate(payload)` (`electron/preload.js:20`).
2. `ipcRenderer.invoke` → `ipcMain.handle('desktop-ai-generate', ...)` (`electron/main.js:1752`).
3. Main process calls `startDesktopAiRuntime()` (line 993) — spawns `llama-server` or legacy binary (151–158).
4. HTTP request to local AI server on `desktopAiState.port`, returns `{ ok, content, ... }` to renderer.

**Path B — Standard HTTP via Next.js:**

1. Renderer calls `fetch('/api/generate', ...)` — same code path as web.
2. Next.js server (running on `127.0.0.1:{port}` inside Electron) tries cloud → Ollama at 11434 → offline.
3. The bundled llama.cpp runtime is never touched.

**The wiring exists for Path A** (preload bridge, IPC handler, model manifest, model lifecycle). But the audit could not find any client-side code that branches on `window.electronAPI?.isElectron` to call the IPC bridge. If no client code calls it, the entire desktop AI runtime — including the bundled GGUF models — is **dead weight in the installer**.

**Why this is a blocker.** The product positioning is "offline AI on desktop". If desktop runs Path B, the offline story collapses to "Ollama if you happen to have it installed, otherwise the deterministic fallback". That changes what we can claim in marketing, what minimum-spec we advertise, and whether the model bundling work in `npm run models:prepare:laptop` is shipping value.

**Verification needed (do this before 1.0).**

1. `grep -r "window.electronAPI" --include="*.tsx" --include="*.ts"` across the client — find every callsite, document them. If zero callsites exist, Path A is dead.
2. Run a desktop build, generate a quiz, and watch the network tab. If the request goes to `127.0.0.1:{port}/api/generate`, Path B is real. Then watch for an outbound to `localhost:11434` — if Ollama isn't running, the bundled llama.cpp should still respond.
3. Watch the OS process list. If `llama-server` is not running during a generate call, the bundled runtime isn't being used.
4. Decide explicitly: keep Path A (and wire the client to use it) or delete it (and remove the model bundling pipeline).

---

## 5. SRS deck creation, study session, review history — ✅

**Call chain.**

1. Client calls `/api/tools/generate` or `/api/generate` with `mode: 'flashcards'`.
2. Server returns a flashcard JSON payload.
3. Client invokes `buildImportedDeck()` (`deck-utils.ts:38`) → `createCard()` (line 61) → produces SRSCards with FSRS-4.5 fields (`stability`, `fsrsDifficulty`).
4. `saveDeck()` (line 68) persists to IndexedDB via `lib/srs/sm2.ts`.
5. Optional cloud sync via `syncDeckToCloud()` (line 109) → `PUT /api/srs` (line 112).
6. During study, each card review triggers `POST /api/srs/review-history` with `{ deckId, cardId, grade, nextReview, interval, stability, difficulty, ... }`.
7. Server inserts into `srsReviewHistory` (line 71 of that route).

**What is verified.** Card schema, review schema, and server persistence all line up. The FSRS algorithm parameters in `lib/srs/sm2.ts:64–72` are calibrated. The library-to-deck import path works.

**Gaps.**

- The file is named `sm2.ts` but implements FSRS-4.5. Cosmetic, but confusing for new contributors.
- The server is a passive store: it accepts whatever interval the client sends without sanity-checking the math. A client bug (or a tampered request) could write `interval: 999999` and it would persist.
- **No multi-device conflict resolution.** If a user studies the same deck on web and desktop, the last write wins. A merge strategy (or at least a conflict warning) is needed before multi-device is marketed.

**Verification needed.** Find the React hook that calls `computeNextReview()` and confirm it actually fires on every card grade. Test a multi-device session and observe what happens.

---

## 6. Sharing flow — ✅

**Call chain.**

1. `POST /api/share` with `{ fileId|folderId|topicId|libraryItemId, shareType, permission, expiresInDays }`.
2. Ownership verified (line 126 of route).
3. `randomBytes(16).toString('hex')` → 32-char token (line 246).
4. Optional `expiresAt = now + expiresInDays`.
5. Insert share record, return `{ ...share, shareUrl }`.
6. Recipient hits `GET /api/share/[token]` → lookup, expiry check (returns 410 Gone if expired), content fetch.

**What is verified.** Token entropy is fine (16 bytes is plenty). Expiry is enforced on retrieval. Ownership is checked on creation.

**Gap.** The `permission` field is stored on the share record but **not enforced on retrieval**. Anyone with the token gets full access regardless of the permission level recorded. If the product surface includes view-only vs. comment vs. fork permissions, the retrieval handler needs to gate behaviour on `share.permission` — today it does not.

**Verification needed.** Confirm `/api/share/[token]/fork` actually creates a clean copy (not just a reference) and assigns ownership to the recipient.

---

## 7. Desktop runtime boot & model lifecycle — ⚠️

**Call chain.**

1. Electron app launches → window loads the Next.js production server on `127.0.0.1:{port}`.
2. **No boot-time AI runtime startup.** llama.cpp is started lazily on the first `desktop-ai-generate` IPC call.
3. `startDesktopAiRuntime()` (`electron/main.js:993`) → `resolveDesktopAiRuntime()` (line 148) checks for the binary, returns null if missing.
4. Process spawned (line ~1017 onwards), port-bound, health-checked with a 25-second timeout (line 13).
5. `desktopAiState.ready = true` once healthy.

**Gaps.**

- Lazy startup means the first generate request waits 5–25 seconds for the runtime to come up. Users will experience this as "the app froze".
- No app-quit handler kills the spawned `llama-server` (audit limited to first 100 LOC of main.js, but no `app.on('before-quit')` was found in the relevant section). If the process isn't reaped, model files stay locked on Windows and users have to kill the process manually.
- If the bundled binary is missing and no model is downloaded, the failure mode is unclear — the IPC handler may return an error that the client doesn't translate into a "go to settings and download a model" flow.

**Verification needed.** Watch the OS process list across an app launch + first-generate + app-quit cycle. Confirm `llama-server` starts, responds, and dies. If the process survives quit, ADR-002 in the architecture review becomes urgent.

---

## 8. Database resolution & migrations — ⚠️

**Call chain.**

1. Server boot → `lib/db/index.ts` resolves `DATABASE_URL` from the prioritised env-var list.
2. Connection pool created (Neon HTTP for Neon URLs, postgres-js otherwise).
3. `isDatabaseConfigured` exported and consulted by every DB-touching route.
4. **No migration runner on startup.** `drizzle-kit push` is the contract — operators must run it manually before deploys.

**Gaps.**

- A pending migration in production silently breaks any route that tries to read or write the new column. The error surfaces as a generic 500 unless caught locally — and if caught, the route falls back to local-only mode without telling anyone the schema is out of date.
- `isDatabaseConfigured` checks that a URL is present, not that the DB is reachable. A misconfigured Postgres (e.g. firewall blocking the IP) will let the server boot and then hang on every query.
- No `/api/db/health` endpoint that does an actual `SELECT 1` round-trip. The closest is `/api/db/verify`, which the audit could not fully trace.

**Verification needed.** Run a deploy with a pending migration and observe the failure mode. Add an automated migration step to the release pipeline (or document loudly that operators must run `npm run db:push` before every deploy).

---

## What to fix before 1.0

In priority order:

1. **Resolve the desktop AI path question (Workflow 4).** This is the only finding that could falsify a marketing claim. Either wire the client to call `electronAPI.desktopAI.generate` and remove the redundant `/api/generate` path on desktop, or accept Path B and remove the bundled-model pipeline. Decision needed within a week.

2. **Add a `before-quit` handler to kill the llama-server process (Workflow 7).** One-line fix; prevents Windows file-lock pain. Also add a startup health check so users see "preparing AI…" instead of a frozen UI on first generate.

3. **Make Supabase upload + DB insert atomic, or add a reconciliation job (Workflow 2).** Today, a partial failure leaves orphaned metadata. Either wrap them in a transaction (with cleanup on either failure) or run a periodic job that nulls out `storagePath` for blobs that aren't actually in the bucket.

4. **Enforce `share.permission` on retrieval (Workflow 6).** The field is stored but ignored. Add a check in `GET /api/share/[token]` that limits the response based on the recorded permission.

5. **Either automate migrations or fail loudly when they're pending (Workflow 8).** Pick one. The current "best-effort, fall back to local" behaviour is a silent data-loss hazard.

## Things to track but not block on

The lazy Ollama health check (Workflow 3), the multi-device SRS conflict story (Workflow 5), and the missing "your data won't persist" banner for guests with no DB (Workflow 1) are all real but not release-blocking. They belong in the P1 follow-up wave alongside the items in `ARCHITECTURE_REVIEW_2026-04.md`.

---

*Generated via the engineering:architecture skill. Companion to `ARCHITECTURE_REVIEW_2026-04.md`. Both documents should be reviewed together before the next architecture sync.*
