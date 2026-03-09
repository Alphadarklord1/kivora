# Contributing to Kivora

Kivora is a desktop-primary AI study workspace with a supported web beta. Contributions should protect the stable beta surface first.

## What to work on

Prioritize changes in these supported surfaces:

- `workspace`
- `tools`
- `planner`
- `library`
- `analytics`
- `sharing`
- `settings`
- `login`
- `register`
- `downloads`

Avoid expanding incomplete or intentionally cut beta surfaces unless the change explicitly restores them to a stable state.

## Ground rules

- Keep guest mode working unless the task explicitly changes auth behavior.
- Keep desktop as the primary supported runtime.
- Do not re-enable encryption-password flows during beta.
- Do not introduce breaking changes to the offline model manifest or release flow without updating docs and tests.
- Keep Arabic/RTL compatibility for user-facing UI changes.

## Local setup

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run test:beta
npm run build
```

## Branch and PR expectations

- Create one focused branch per change.
- Keep PRs small enough to review in one pass.
- Include before/after screenshots for visible UI changes.
- Call out any env var, OAuth, release, or packaging implications directly in the PR description.

## Code expectations

- Reuse the existing token/design system before adding one-off styles.
- Prefer shared helpers over duplicating route/runtime guard logic.
- Preserve compatibility for legacy guest/demo identities and settings keys when practical.
- If a feature is not production-ready, hide or disable it instead of leaving a broken path visible.

## Tests before opening a PR

Run:

```bash
npm run test:beta
npm run build
```

If your change touches releases or model downloads, also validate the manifest/checksum flow described in:

- `OFFLINE_MODEL_BUNDLE_GUIDE.md`
- `electron/runtime/README.md`

## Pull request checklist

- Scope is clear and limited
- Stable beta surfaces still work
- Guest mode still works if relevant
- English and Arabic UI are both considered if relevant
- Build and beta tests pass
- Docs updated if contributor workflow, env vars, or release flow changed
