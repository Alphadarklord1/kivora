# GitHub Projects Operating Rules

Use GitHub Projects for coordination, not as a second issue tracker.

## Suggested columns

- `Backlog`
- `Ready`
- `In Progress`
- `Review`
- `Blocked`
- `Done`

## Label to column rules

### Default placement

- new `bug`, `error-report`, `enhancement`, or `task` issues -> `Backlog`
- issue marked ready by a maintainer -> `Ready`
- issue assigned and actively worked -> `In Progress`
- PR open and linked to issue -> `Review`
- waiting on decision, env, dependency, or external asset -> `Blocked`
- merged and deployed or intentionally closed -> `Done`

### Priority rules

- crashes / broken routes go to the top of `Backlog`
- auth, data loss, or sharing bugs skip directly to `Ready`
- release blockers stay out of general backlog and should be tagged `release`

## Label usage

- `bug`: broken behavior with a reproducible path
- `error-report`: user-submitted runtime/reporting issue
- `enhancement`: product improvement with defined behavior
- `task`: scoped implementation work
- `design`: visual/system polish
- `localization`: Arabic/RTL or language coverage work
- `release`: versioning, packaging, assets, checksums
- `security`: private or sensitive handling required
- `desktop`: Electron/runtime/installer work
- `web`: browser/Vercel/web companion work
- `auth`: sign-in, guest mode, OAuth, sessions
- `ai`: generation, policy, runtime, model management
- `planner`: planner/calendar/timer
- `analytics`: metrics/insights/reporting

## Workflow rules

- one issue per distinct problem
- one PR per issue unless maintainers approve bundling
- link the PR to the issue
- if blocked, move the card instead of letting it rot in `In Progress`
- if scope expands, split follow-up work into new issues

## Review expectations

- UI changes require screenshots
- runtime/auth/release changes require rollout notes
- maintainers should reject unclear PRs rather than merge “almost right” work
