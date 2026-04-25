# Kivora 1.0 Release QA Checklist

Run this checklist before publishing or promoting a 1.0 release.

## Core reliability

- [ ] Fresh launch works without account sign-in (`AUTH_REQUIRED` unset).
- [ ] Folder create/edit/delete works on first run in guest mode.
- [ ] Planner create/update/delete works with and without `DATABASE_URL` (DB-backed or local fallback).
- [ ] `/analytics` opens without `Failed to load analytics`.
- [ ] Analytics fallback banner appears only when fallback payload is returned.

## Auth contract

- [ ] `AUTH_REQUIRED=1` forces authenticated access to protected APIs.
- [ ] `AUTH_REQUIRED=0` (or unset) allows guest usage for dashboard core flows.
- [ ] Unauthorized API responses return `{ errorCode, reason, requestId }`.
- [ ] Google sign-in works on web with:
  - [ ] `GOOGLE_CLIENT_ID`
  - [ ] `GOOGLE_CLIENT_SECRET`
  - [ ] `AUTH_SECRET`
  - [ ] redirect URI `https://study-alpha-three.vercel.app/api/auth/callback/google`
- [ ] Desktop OAuth still works on `127.0.0.1:3893` or shows a clear disabled reason.

## Appearance + themes

- [ ] Settings → Appearance shows `Light`, `Blue Mode`, `Black Mode`, `System`.
- [ ] Legacy persisted `dark` is mapped to `blue`.
- [ ] Loaders, toasts, cards, and charts render consistently in all themes.

## Encryption disabled mode

- [ ] No encryption password prompts are shown.
- [ ] Security tab clearly states encryption is temporarily disabled.
- [ ] Vault status does not present lock/unlock dead-end actions.

## AI behavior

- [ ] Web path uses cloud when available and falls back to offline output on failure.
- [ ] Desktop local runtime fallback behavior remains functional.
- [ ] Policy-blocked prompts show refusal path (no fallback generation).
- [ ] Mini model is bundled in the desktop build and works without extra downloads.
- [ ] Optional Balanced installs from the published GitHub release asset and Pro installs from its external manifest URL.

## Arabic + RTL

- [ ] Active dashboard surfaces render correctly in Arabic.
- [ ] RTL layout has no clipping in sidebar, cards, dialogs, and tool controls.
- [ ] Date/number formatting follows Arabic locale where expected.
- [ ] Auth pages and analytics exports contain no high-visibility English leftovers.

## Release gates

- [ ] `npm run build`
- [ ] `npm run test:release`
- [ ] `npm run models:prepare:laptop`
- [ ] `node scripts/verify-desktop-bundle.js --platform=mac`
- [ ] `npm run models:manifest:validate -- --manifest=electron/runtime/model-manifest.json --repo=Alphadarklord1/kivora`
- [ ] `npm run release:models:publish -- --tag=vX.Y.Z --repo=Alphadarklord1/kivora --models-dir=~/Kivora-model-store`
- [ ] `npm run release:verify -- --tag=vX.Y.Z --assets='<comma-separated asset names>'`
- [ ] `release-ci` and `model-manifest` GitHub workflows are green.
- [ ] Branch changes are merged from `codex/...` into `main` before deploying or tagging a release.
- [ ] Desktop assets attached to the release use the Kivora names:
  - [ ] `Kivora-<version>-arm64.dmg`
  - [ ] `Kivora-<version>-arm64-mac.zip`
  - [ ] `Kivora-Setup-<version>.exe`
  - [ ] `Kivora-<version>.exe`
- [ ] Published release includes:
  - [ ] `model-manifest.json`
  - [ ] `SHA256SUMS.txt`
  - [ ] `qwen2.5-1.5b-instruct-q4_k_m.gguf`
  - [ ] `qwen2.5-3b-instruct-q4_k_m.gguf`
  - [ ] Pro model URL in `model-manifest.json` resolves and verifies in-app
- [ ] Vercel is deployed from the expected commit on `main`.
