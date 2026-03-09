# GitHub Setup Guide

This is the maintainer checklist for turning the repository into a workable team repo.

## 1. Branch protection

On `main`, enable:

- require pull request before merging
- require at least 1 approval
- dismiss stale approvals when new commits are pushed
- require status checks to pass
- block force pushes

## 2. Required status checks

Require the checks from:

- `.github/workflows/beta-ci.yml`
- `.github/workflows/model-manifest.yml` when release/model work is involved

## 3. Labels

Create these labels:

- `bug`
- `error-report`
- `enhancement`
- `task`
- `design`
- `localization`
- `release`
- `security`
- `desktop`
- `web`
- `auth`
- `ai`
- `planner`
- `analytics`

## 4. Projects

Recommended columns:

- `Backlog`
- `Ready`
- `In Progress`
- `Review`
- `Blocked`
- `Done`

Recommended custom fields:

- priority
- surface
- runtime
- release target

See `docs/GITHUB_PROJECTS.md` for exact label-to-column rules.

## 5. Discussions

If enabled, create categories for:

- ideas
- Q&A
- announcements
- design review

Keep bugs and implementation tasks in Issues, not Discussions.

## 6. CODEOWNERS

Keep `CODEOWNERS` aligned with the actual ownership model. If more maintainers join, update it directly in-repo.

## 7. Release discipline

Use the `Release checklist` issue template for each release candidate.

Before tagging:

- tests pass
- build passes
- release assets match version/tag
- docs are updated if env vars or release flow changed
