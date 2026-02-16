# StudyPilot Stable Beta QA Checklist

Run this checklist before creating a beta release tag.

## Core reliability

- [ ] Fresh launch works without account sign-in (`AUTH_REQUIRED` unset).
- [ ] Folder create/edit/delete works on first run in guest mode.
- [ ] `/analytics` opens without `Failed to load analytics`.
- [ ] Analytics fallback banner appears only when fallback payload is returned.

## Auth contract

- [ ] `AUTH_REQUIRED=1` forces authenticated access to protected APIs.
- [ ] `AUTH_REQUIRED=0` (or unset) allows guest usage for dashboard core flows.
- [ ] Unauthorized API responses return `{ errorCode, reason, requestId }`.

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

## Arabic + RTL

- [ ] Active dashboard surfaces render correctly in Arabic.
- [ ] RTL layout has no clipping in sidebar, cards, dialogs, and tool controls.
- [ ] Date/number formatting follows Arabic locale where expected.

## Release gates

- [ ] `npm run build`
- [ ] `npm run test:beta`
- [ ] `npm run models:manifest:validate -- --manifest=electron/runtime/model-manifest.json --repo=Alphadarklord1/studypilot`
- [ ] `npm run release:verify -- --tag=vX.Y.Z --assets='<comma-separated asset names>'`
- [ ] `beta-ci` and `model-manifest` GitHub workflows are green.
