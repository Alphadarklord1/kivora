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

`electron/runtime/models`

## 3) Build installer

- Fast path (recommended):
  - `npm run electron:build:mac:balanced`
- Or explicit:
  - `npm run electron:build:mac`

Output:

`dist-electron`

## 4) What users get in app

- On first launch, users see a model chooser wizard (installer-like flow in app).
- StudyPilot auto-detects device profile (laptop/pc).
- Mini works immediately offline.
- Balanced/Pro can be installed later from **Settings → AI Models**.
- If a selected model is missing, StudyPilot falls back safely.

## 5) Release checklist for optional downloads

For hybrid bundle mode (Mini bundled, bigger models optional):

1. Build and publish app installer.
2. Upload optional GGUF files as release assets:
   - `qwen2.5-3b-instruct-q4_k_m.gguf`
   - `qwen2.5-7b-instruct-q4_k_m.gguf`
3. Generate release-grade manifest:
   - `npm run models:manifest:generate -- --tag=vX.Y.Z --repo=Alphadarklord1/studypilot --models-dir=<path-to-gguf-files>`
4. Validate manifest:
   - `npm run models:manifest:validate -- --manifest=electron/runtime/model-manifest.json --repo=Alphadarklord1/studypilot`
5. Verify release naming consistency:
   - `npm run release:verify -- --tag=vX.Y.Z --assets='StudyPilot-X.Y.Z-arm64.dmg,StudyPilot-X.Y.Z-arm64-mac.zip,model-manifest.json'`
6. Upload matching `model-manifest.json` to the same release tag.
7. Ensure manifest `sha256` and `sizeBytes` match uploaded assets.
8. Smoke test on clean machine: install app, open wizard/settings, install Balanced model.

CI also enforces these checks in `.github/workflows/beta-ci.yml` and `.github/workflows/model-manifest.yml`.

## 6) If something fails

- Run a dry-run check:
  - `node scripts/prepare-model-bundle.js --target=balanced --dry-run`
- Missing file errors mean filenames or source path do not match.
- In app, use **Settings → AI Models → Check Runtime Status**.
