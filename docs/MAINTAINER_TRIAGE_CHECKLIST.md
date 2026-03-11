# Maintainer Triage Checklist

Use this when a new issue or error report arrives.

## 1. Classify it

- is it a crash, auth issue, data issue, UI issue, AI/tool issue, or release issue?
- add the right labels
- place it in the project and set:
  - `Stage`
  - `Priority`
  - `Surface`
  - `Runtime`
  - `Release Target` if known

## 2. Reproduce it

- confirm the exact page or API route
- confirm guest vs signed-in mode
- confirm desktop vs web
- collect screenshot, response body, or console error

If it cannot be reproduced, request one concrete missing detail instead of guessing.

## 3. Decide severity

- `P0 Critical`: crash, auth break, data loss, broken core route
- `P1 High`: core beta flow degraded
- `P2 Normal`: important but not blocking
- `P3 Low`: polish, copy, low-risk improvement

## 4. Decide scope

- if the report is broad, split it into focused tasks
- if the feature is incomplete and unstable, prefer hiding/deferring over exposing it
- if it changes auth, release, or runtime behavior, require a maintainer review

## 5. Close the loop

- move the project card to the right stage
- link the PR back to the issue
- verify the fix in the runtime the user reported
- close only after the fix is merged or the issue is intentionally declined
