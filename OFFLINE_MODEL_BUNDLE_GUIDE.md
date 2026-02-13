# StudyPilot Offline Model Bundle Guide

This is the quickest reliable way to bundle offline AI models into the desktop app.

## 1) Keep source models in one place

Use a local folder (default):

`~/StudyPilot-model-store`

Put these files there:

- `qwen2.5-1.5b-instruct-q4_k_m.gguf`
- `qwen2.5-3b-instruct-q4_k_m.gguf`
- `qwen2.5-7b-instruct-q4_k_m.gguf`

You can also use another folder by setting:

`STUDYPILOT_MODEL_STORE=/absolute/path/to/models`

## 2) Pick installer profile

- `npm run models:prepare:laptop`
  - Bundles `mini` model only (smallest installer).
- `npm run models:prepare:balanced`
  - Bundles `mini + 3B` (good default for most users).
- `npm run models:prepare:pc`
  - Bundles `mini + 3B + 7B` (largest installer, best quality range).

These commands stage files into:

`/Users/armankhan/Documents/studypilot-full-code/electron/runtime/models`

## 3) Build installer

- Fast path (recommended):
  - `npm run electron:build:mac:balanced`
- Or explicit:
  - `npm run electron:build:mac`

Output:

`/Users/armankhan/Documents/studypilot-full-code/dist-electron`

## 4) What users get in app

- StudyPilot auto-detects device profile (laptop/pc).
- It recommends the best bundled model.
- Users can switch model in **Settings → AI Models**.
- If a recommended model is missing, StudyPilot falls back to a bundled one.

## 5) If something fails

- Run a dry-run check:
  - `node scripts/prepare-model-bundle.js --target=balanced --dry-run`
- Missing file errors mean filenames or source path do not match.
- In app, use **Settings → AI Models → Check Runtime Status**.
