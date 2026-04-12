Kivora is a desktop-first AI study workspace built for stable offline Mac use, with a supported web beta companion, guest-by-default access, and optional cloud fallback.

The final product is built around three pillars:

- `/workspace` for files, AI tools, notes, quizzes, and review sets
- `/coach` for Scholar Hub source study and writing support
- `/math` for solver, graphing, formulas, and technical workflows

## Product Status

- Desktop app is the primary supported runtime.
- Web remains available as a supported beta companion.
- Guest mode is enabled by default unless `AUTH_REQUIRED=1`.
- Encryption password flows are intentionally disabled for the current 1.0 cycle.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Main entry points:

- Web dev: `http://localhost:3000`
- Desktop shell: `npm run electron:dev`

## Database Setup

Kivora now supports both:

- Supabase Postgres as the preferred hosted database
- generic PostgreSQL / Neon where needed
- local PostgreSQL for development on your machine

Fast local setup:

```bash
npm run db:start
npm run db:push
```

Default local database URL:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kivora
```

Preferred hosted setup:

```bash
SUPABASE_DATABASE_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres?sslmode=require
```

Useful commands:

```bash
npm run db:start
npm run db:stop
npm run db:down
npm run db:push
npm run db:studio
```

Notes:

- `docker-compose.yml` provides a local Postgres 16 instance
- `drizzle-kit push` applies the current schema directly
- Kivora resolves the database URL in this order:
  - `SUPABASE_DATABASE_URL`
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `POSTGRES_URL`
  - `POSTGRES_PRISMA_URL`
- for Supabase, prefer setting `SUPABASE_DATABASE_URL` so the whole app and Drizzle use the same source of truth
- for fuller Supabase integration, also set:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_STORAGE_BUCKET`

## Runtime Environment

Core app/runtime:

```bash
AUTH_SECRET=...
AUTH_GUEST_MODE=1
AUTH_REQUIRED=0
KIVORA_DESKTOP_AUTH_PORT=3893
OPENAI_API_KEY=...
OPENAI_MODEL_DEFAULT=gpt-4o-mini
KIVORA_DESKTOP_ONLY=0
ENCRYPTION_DISABLED=1
```

Security note:

- In production, set `AUTH_SECRET` (or `NEXTAUTH_SECRET`). If it is missing, Kivora now keeps guest access available but disables sign-in until the secret is configured.

Optional Google OAuth:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

## Offline Model Bundles

Use this guide for bundled local AI models and installer profiles:

- `OFFLINE_MODEL_BUNDLE_GUIDE.md`

Quick commands:

```bash
npm run models:prepare:laptop
npm run electron:build:mac
npm run release:models:publish -- --tag=vX.Y.Z --repo=Alphadarklord1/kivora --models-dir=~/Kivora-model-store
```

## Google Login Setup (Web + Desktop)

Set these environment variables:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...
AUTH_GUEST_MODE=1
AUTH_REQUIRED=0
KIVORA_DESKTOP_AUTH_PORT=3893
```

Google OAuth redirect URIs:

- `https://kivora-app.vercel.app/api/auth/callback/google`
- `http://localhost:3000/api/auth/callback/google`
- `http://127.0.0.1:3893/api/auth/callback/google`

Desktop note:

- The desktop app uses a fixed localhost callback port (`3893` by default).
- If that port is busy, Kivora falls back to guest-safe mode and disables OAuth for that run.

## Core Build and Test Flow

```bash
npm run test:beta
npm run build
```

## 1.0 Product Surface

- Primary pillars:
- `/workspace`
- `/coach`
- `/math`

- Supported secondary tools:
- `/library`
- `/planner`
- `/analytics`
- `/sharing`
- `/settings`
- `/login`
- `/register`

Compatibility redirects still exist for older links such as `/tools`, `/study`, `/decks`, `/models`, `/report`, and `/downloads`.

Standalone audio navigation and Office-to-PDF visual conversion are intentionally cut from the 1.0 surface until their dependencies are stable.

## Release Flow

1. Run `npm run test:beta`
2. Run `npm run build`
3. Stage bundled Mini with `npm run models:prepare:laptop`
4. Build desktop artifacts
5. Publish desktop release assets
6. Generate `model-manifest.json` from the real release model files so every optional model has a real `sha256` and `sizeBytes`
7. Generate `SHA256SUMS.txt` from those same files
8. Upload the matching optional model assets, `model-manifest.json`, and `SHA256SUMS.txt` to the same GitHub release tag
9. Run release consistency validation before announcing the tag

Do not ship the scaffolded fallback manifest as if it were release metadata. Optional installs are only trustworthy once the manifest, checksums, and GitHub release assets all match.

Detailed runtime/model docs:

- `OFFLINE_MODEL_BUNDLE_GUIDE.md`
- `electron/runtime/README.md`
- `docs/OPEN_SOURCE_REPLACEMENTS.md`

## Team Collaboration

If you want other people to edit or build with you:

- Read `CONTRIBUTING.md`
- Open bugs and feature work through GitHub Issues
- Use pull requests for all code changes
- Follow `SECURITY.md` for private vulnerability reports

Repository collaboration files:

- `CONTRIBUTING.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/ISSUE_TEMPLATE/`
- `CODEOWNERS`
- `CODE_OF_CONDUCT.md`
- `SUPPORT.md`
- `docs/TEAM_WORKFLOW.md`
- `docs/GITHUB_SETUP.md`
- `docs/GITHUB_PROJECTS.md`
- `docs/MAINTAINER_TRIAGE_CHECKLIST.md`
- `ROADMAP.md`
