# Changelog

## 1.1.0 - 2026-02-11

- Switched Kivora to desktop-first mode with production web gating.
- Added guest/local default behavior so desktop use does not require sign-in.
- Added bundled desktop AI runtime integration hooks for:
  - `Qwen2.5-3B-Instruct` (`Q4_K_M`)
  - runtime health checks
  - model info and generation IPC contracts
- Refactored AI provider flow to `desktop-local | openai | offline`.
- Added cloud fallback toggle for desktop AI failures.
- Added centralized study-only AI policy guardrails with EN/AR detection.
- Enforced policy server-side in LLM and math routes with structured `422` responses.
- Added workspace policy refusal UX with localized supported-task suggestions.
- Added AI scope + runtime/model status surfaces in Settings.
- Added packaging config for model/runtime asset inclusion.
- Added policy unit tests and lint/type/test cleanup.
