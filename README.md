Kivora is a desktop-primary AI study workspace with a supported web beta, guest-by-default access, offline-first generation, and optional cloud fallback.

## Product Status

- Desktop app is the primary supported runtime.
- Web remains available as a beta prototype.
- Guest mode is enabled by default unless `AUTH_REQUIRED=1`.
- Encryption password flows are intentionally disabled for the current beta.

## Local Development

```bash
npm install
npm run dev
```

Main entry points:

- Web dev: `http://localhost:3000`
- Desktop shell: `npm run electron:dev`

## Runtime Environment

Core app/runtime:

```bash
AUTH_SECRET=...
AUTH_GUEST_MODE=1
AUTH_REQUIRED=0
STUDYPILOT_DESKTOP_AUTH_PORT=3893
OPENAI_API_KEY=...
OPENAI_MODEL_DEFAULT=gpt-4o-mini
STUDYPILOT_DESKTOP_ONLY=0
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
npm run models:prepare:balanced
npm run electron:build:mac:balanced
npm run release:models:publish -- --tag=vX.Y.Z --repo=Alphadarklord1/studypilot --models-dir=~/Kivora-model-store
```

## Google Login Setup (Web + Desktop)

Set these environment variables:

```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=...
AUTH_GUEST_MODE=1
AUTH_REQUIRED=0
STUDYPILOT_DESKTOP_AUTH_PORT=3893
```

Google OAuth redirect URIs:

- `https://study-alpha-three.vercel.app/api/auth/callback/google`
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

## Supported Stable-Beta Surfaces

- `/workspace`
- `/tools`
- `/planner`
- `/library`
- `/analytics`
- `/sharing`
- `/settings`
- `/login`
- `/register`
- `/downloads`

Standalone audio navigation and Office-to-PDF visual conversion are intentionally cut from the beta surface until their dependencies are stable.

## Release Flow

1. Run `npm run test:beta`
2. Run `npm run build`
3. Build desktop artifacts
4. Publish desktop release assets
5. Publish optional model assets with `model-manifest.json` and `SHA256SUMS.txt`
6. Run release consistency validation before announcing the tag

Detailed runtime/model docs:

- `OFFLINE_MODEL_BUNDLE_GUIDE.md`
- `electron/runtime/README.md`

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
