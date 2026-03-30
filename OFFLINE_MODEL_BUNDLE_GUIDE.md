# Kivora 1.0 Offline Model Bundle Guide

This is the reliable 1.0 path for bundling offline AI models into the desktop app.

## 1) Keep source models in one place

Use a local folder (default):

`~/Kivora-model-store`

Put these files there:

- `qwen2.5-1.5b-instruct-q4_k_m.gguf`
- `qwen2.5-3b-instruct-q4_k_m.gguf`
- `qwen2.5-7b-instruct-q4_k_m.gguf`

You can also use another folder by setting:

`STUDYPILOT_MODEL_STORE=/absolute/path/to/models`

## 2) Pick installer profile

- `npm run models:prepare:laptop`
  - Bundles `mini` model only and is the required Mac 1.0 profile.
- `npm run models:prepare:balanced`
  - Bundles `mini + 3B` (good default for most users).
- `npm run models:prepare:pc`
  - Bundles `mini + 3B + 7B` (largest installer, best quality range).

These commands stage files into:

`electron/runtime/models`

## 3) Build installer

- Fast path for 1.0 (recommended):
  - `npm run models:prepare:laptop`
  - `npm run electron:build:mac`
- Or explicit:
  - `npm run electron:build:mac:laptop`

Output:

`dist-electron`

## 4) What users get in app

- On first launch, users see a model chooser wizard (installer-like flow in app).
- Kivora auto-detects device profile (laptop/pc).
- Mini works immediately offline only when it has been bundled before packaging.
- Balanced/Pro can be installed later from **Settings → AI Models**.
- If a selected model is missing, Kivora falls back safely.

## 5) Release checklist for optional downloads

For the 1.0 desktop release story (Mini bundled, bigger models optional):

1. Build and publish app installer.
2. Publish model assets + manifest + checksums in one command:
   - `npm run release:models:publish -- --tag=vX.Y.Z --repo=Alphadarklord1/kivora --models-dir=~/Kivora-model-store`
3. Required release assets after publish:
   - `qwen2.5-1.5b-instruct-q4_k_m.gguf`
   - `qwen2.5-3b-instruct-q4_k_m.gguf`
   - `qwen2.5-7b-instruct-q4_k_m.gguf`
   - `model-manifest.json`
   - `SHA256SUMS.txt`
4. Generate/validate manually (optional, if you do not use the publish command):
   - `npm run models:manifest:generate -- --tag=vX.Y.Z --repo=Alphadarklord1/kivora --models-dir=<path-to-gguf-files>`
   - `npm run models:manifest:validate -- --manifest=electron/runtime/model-manifest.json --repo=Alphadarklord1/kivora`
   - `npm run models:checksums:generate -- --models-dir=<path-to-gguf-files> --out=electron/runtime/SHA256SUMS.txt`
   - `npm run models:checksums:validate -- --checksums=electron/runtime/SHA256SUMS.txt --manifest=electron/runtime/model-manifest.json --models-dir=<path-to-gguf-files>`
5. Verify release naming consistency (includes required model assets/checksum files):
   - `npm run release:verify -- --tag=vX.Y.Z --assets='<comma-separated release asset list>'`
6. Smoke test on clean machine: install app, confirm bundled Mini is detected offline, then optionally install Balanced model.

CI also enforces these checks in `.github/workflows/beta-ci.yml` and `.github/workflows/model-manifest.yml`.

Notes:

- `electron/runtime/model-manifest.json` stays tracked as the fallback manifest used by the desktop app.
- `electron/runtime/SHA256SUMS.txt` is a generated release artifact and is intentionally ignored in normal development commits.

## 6) Direct download URLs template

Replace `vX.Y.Z` with your release tag:

- Releases page: `https://github.com/Alphadarklord1/kivora/releases/tag/vX.Y.Z`
- Manifest: `https://github.com/Alphadarklord1/kivora/releases/download/vX.Y.Z/model-manifest.json`
- Checksums: `https://github.com/Alphadarklord1/kivora/releases/download/vX.Y.Z/SHA256SUMS.txt`
- Mini model: `https://github.com/Alphadarklord1/kivora/releases/download/vX.Y.Z/qwen2.5-1.5b-instruct-q4_k_m.gguf`
- Balanced model: `https://github.com/Alphadarklord1/kivora/releases/download/vX.Y.Z/qwen2.5-3b-instruct-q4_k_m.gguf`
- Pro model: `https://github.com/Alphadarklord1/kivora/releases/download/vX.Y.Z/qwen2.5-7b-instruct-q4_k_m.gguf`

## 7) If something fails

- Run a dry-run check:
  - `node scripts/prepare-model-bundle.js --target=balanced --dry-run`
- Missing file errors mean filenames or source path do not match.
- In app, use **Settings → AI Models → Check Runtime Status**.
