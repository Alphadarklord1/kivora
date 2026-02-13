# Desktop AI Runtime Assets

StudyPilot desktop mode expects bundled runtime assets in this directory:

- `models/qwen2.5-1.5b-instruct-q4_k_m.gguf` (Mini, laptop-friendly)
- `models/qwen2.5-3b-instruct-q4_k_m.gguf` (Balanced default)
- `models/qwen2.5-7b-instruct-q4_k_m.gguf` (Pro, desktop-class)
- `bin/darwin-arm64/studypilot-ai`
- `bin/win32-x64/studypilot-ai.exe`

These files are packaged into Electron `extraResources` as:

- `resources/models/*`
- `resources/bin/*`

The Electron installer bundles every model file present under `electron/runtime/models`.
If only one model is included, StudyPilot auto-falls back to that model.

## Recommended bundle flow

1. Put GGUF files in a local model store (default: `~/StudyPilot-model-store`).
2. Stage a bundle profile:
   - `npm run models:prepare:laptop`
   - `npm run models:prepare:balanced`
   - `npm run models:prepare:pc`
3. Build desktop installer:
   - `npm run electron:build:mac`
   - or shortcut commands:
     - `npm run electron:build:mac:laptop`
     - `npm run electron:build:mac:balanced`
     - `npm run electron:build:mac:pc`

`mock-ai-runtime.js` is development-only and is used when a native runtime binary is not present.
