# Desktop AI Runtime Assets

StudyPilot desktop mode expects bundled runtime assets in this directory:

- `models/qwen2.5-3b-instruct-q4_k_m.gguf`
- `bin/darwin-arm64/studypilot-ai`
- `bin/win32-x64/studypilot-ai.exe`

These files are packaged into Electron `extraResources` as:

- `resources/models/*`
- `resources/bin/*`

`mock-ai-runtime.js` is development-only and is used when a native runtime binary is not present.
