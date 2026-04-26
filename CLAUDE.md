# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kivora 1.0 is a desktop-first AI study workspace with offline AI models, supporting Mac and Windows. The web companion provides optional cloud sync. Guest mode is enabled by default.

**Three-pillar product surface:**
- `/workspace` - Files, AI tools, notes, quizzes, review sets
- `/coach` - Scholar Hub source study and writing support
- `/math` - Solver, graphing, formulas, technical workflows

**Supported routes:**
`/workspace`, `/coach`, `/math`, `/library`, `/planner`, `/analytics`, `/sharing`, `/settings`, `/login`, `/register`

## Commands

```bash
# Development
npm install
npm run dev                           # Web dev server (localhost:3000)
npm run electron:dev                  # Desktop app with web server

# Database
npm run db:start                      # Start local Postgres in Docker
npm run db:push                       # Push schema to database
npm run db:studio                     # Open Drizzle Studio GUI
npm run db:stop                       # Stop local Postgres
npm run db:down                       # Remove local Postgres container

# Build
npm run build                         # Production web build
npm run test:release                  # Run all release tests

# Desktop builds
npm run models:prepare:laptop         # Stage Mini model (required for Mac)
npm run electron:build:mac            # Build Mac desktop app (arm64)
npm run electron:build:win            # Build Windows desktop app
npm run electron:build:mac:laptop     # Prepare + build Mac installer

# Model management
npm run models:manifest:generate      # Generate model-manifest.json
npm run models:checksums:generate     # Generate SHA256SUMS.txt
npm run release:models:publish        # Upload models to GitHub release
npm run release:verify                # Verify release consistency

# Tests
npm run test                          # Run unit tests
npm run test:e2e                      # Run Playwright E2E tests
npm run test:policy                   # Run AI policy tests
```

## Architecture

**Stack:**
- Next.js 16 with App Router
- PostgreSQL via Drizzle ORM (Supabase preferred, generic Postgres supported)
- NextAuth.js v5 for authentication (guest mode by default)
- Electron for desktop runtime
- IndexedDB for local file blob storage (client-side)
- llama.cpp runtime for offline AI models (qwen2.5 1.5B/3B/7B)
- PDF.js, JSZip, Mammoth for text extraction

**Desktop AI runtime:**
- Binary location: `electron/runtime/bin/{platform-arch}/llama-server` (or `llama-server.exe` on Windows)
- Model selection: Mini (1.5B), Balanced (3B), Pro (7B)
- Bundled models: `electron/runtime/models/*.gguf` (staged via `npm run models:prepare:*`)
- User-downloaded models: `{userData}/models/*.gguf`
- Desktop IPC handlers in `electron/main.js` manage runtime lifecycle
- Protocol: OpenAI-compatible `/v1/chat/completions` endpoint
- System prompt enforces academic study scope and JSON output

**Data storage strategy:**
- **Metadata** (folders, files, library items, users): PostgreSQL (synced)
- **File blobs** (PDFs, Word, PowerPoint): IndexedDB (local-only, referenced via `localBlobId`)
- **Text extraction**: Client-side from IndexedDB blobs
- **Client-side encryption**: Fields like `name`, `content` encrypted before database sync (currently disabled via `ENCRYPTION_DISABLED=1`)

**Database resolution order:**
1. `SUPABASE_DATABASE_URL`
2. `DATABASE_URL`
3. `DIRECT_URL`
4. `POSTGRES_URL`
5. `POSTGRES_PRISMA_URL`

**Key database tables:**
- `users`, `accounts`, `sessions`, `verificationTokens` - NextAuth.js
- `userSettings` - Theme, font size, density
- `folders` - Top-level folders
- `topics` - Subfolders within folders
- `files` - File metadata with `localBlobId` (IndexedDB reference), `storageProvider`, `storagePath` (optional cloud)
- `libraryItems` - Saved generated content
- `shares` - Sharing configuration
- `srsDecks`, `studySessions`, `srsPreferences`, `srsReviewHistory` - Spaced repetition system
- `studyPlans`, `calendarEvents` - Study planning
- `quizAttempts` - Quiz history
- `ragFileIndexes` - RAG embeddings for file search

**File upload workflow:**
1. User uploads file (PDF/Word/PowerPoint)
2. Blob stored in IndexedDB with unique ID (`localBlobId`)
3. File metadata saved to database (optionally encrypted)
4. When using tools, text extracted client-side from IndexedDB
5. Generated content saved to Library (database) or Folder (as file)

**AI generation flow:**
1. Desktop mode: IPC to `electron/main.js` → llama.cpp runtime
2. Web mode: API route → cloud provider (OpenAI, Grok) or offline fallback
3. Offline fallback: `lib/offline/generate.ts` (deterministic, no AI)
4. Rate limiting: `lib/api/ai-rate-limit.ts` (web only)

**Environment variables (`.env.local`):**
```bash
# Database (required)
SUPABASE_DATABASE_URL=postgresql://...      # Preferred
# or DATABASE_URL=postgresql://...

# Auth (required in production)
AUTH_SECRET=...                             # Required for production sign-in
AUTH_GUEST_MODE=1                           # Enable guest access (default)
AUTH_REQUIRED=0                             # Disable auth requirement (default)

# Desktop
KIVORA_DESKTOP_AUTH_PORT=3893               # Fixed OAuth callback port
KIVORA_DESKTOP_ONLY=0                       # Desktop-only mode flag

# AI providers (optional)
GROK_API_KEY=...
GROK_MODEL_DEFAULT=grok-3-fast
OPENAI_API_KEY=...
OPENAI_MODEL_DEFAULT=gpt-4o-mini

# Google OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Feature flags
ENCRYPTION_DISABLED=1                       # Disable client-side encryption
```

**Google OAuth redirect URIs:**
- `https://study-alpha-three.vercel.app/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`
- `http://127.0.0.1:3893/api/auth/callback/google` (desktop)

## Important Patterns

**Desktop vs Web runtime guards:**
- Check `process.env.KIVORA_DESKTOP_ONLY` to conditionally enable/disable features
- Desktop app runs Next.js production server on `127.0.0.1:{port}` (see `electron/main.js`)
- Desktop OAuth: Falls back to guest mode if port 3893 is unavailable

**Model bundle workflow (desktop releases):**
1. Store models in `~/Kivora-model-store` (or set `KIVORA_MODEL_STORE`)
2. Run `npm run models:prepare:laptop` (Mac required) or `models:prepare:balanced`
3. Build with `npm run electron:build:mac`
4. Publish release with `npm run release:models:publish`
5. See `OFFLINE_MODEL_BUNDLE_GUIDE.md` for full flow

**Release checklist:**
1. `npm run test:release`
2. `npm run build`
3. `npm run models:prepare:laptop`
4. `npm run electron:build:mac`
5. Publish desktop artifacts
6. `npm run release:models:publish` (generates manifest + checksums + uploads)
7. `npm run release:verify` before announcing

**Authentication:**
- NextAuth.js v5 with database sessions
- Guest mode enabled by default unless `AUTH_REQUIRED=1`
- If `AUTH_SECRET` missing: guest access remains, sign-in disabled
- Desktop OAuth disabled if port 3893 unavailable (falls back to guest mode)

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.
