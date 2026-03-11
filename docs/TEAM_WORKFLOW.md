# Team Workflow

## Recommended GitHub setup

1. Protect `main`
2. Require pull requests before merge
3. Require at least one review
4. Require CI checks
5. Use draft PRs for in-progress work

## Suggested issue lanes

- `bug`
- `error-report`
- `enhancement`
- `task`
- `release`
- `design`
- `localization`
- `security`

Use the issue templates in `.github/ISSUE_TEMPLATE/` instead of free-form issues whenever possible.

## Suggested working agreement

- Open an issue before large changes
- One focused PR per problem
- Attach screenshots for UI changes
- Mention web/desktop and EN/AR impact in the PR
- Update docs when changing env vars, auth, release flow, or contributor workflow

## Suggested release roles

- one maintainer owns tagging and release assets
- one reviewer verifies smoke checks
- one person verifies model assets and checksums

Use the `Release checklist` issue template for every public release.

## Beta triage order

1. crashes / broken routes
2. auth / data loss / sharing issues
3. planner / analytics / AI workflow regressions
4. localization / design inconsistencies
5. feature work

## Maintainer references

- `CONTRIBUTING.md`
- `SECURITY.md`
- `SUPPORT.md`
- `docs/GITHUB_SETUP.md`
- `docs/GITHUB_PROJECTS.md`
- `docs/MAINTAINER_TRIAGE_CHECKLIST.md`
- `ROADMAP.md`
