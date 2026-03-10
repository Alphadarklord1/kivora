# Open-Source Replacement Plan

This document maps Kivora's current custom or weak internal pieces to stronger open-source building blocks.

The goal is not to replace everything. The goal is to replace the parts that are currently limiting product quality or maintainability.

## 1. Offline AI runtime

### Current

- custom desktop runtime binary name:
  - `studypilot-ai`
  - `studypilot-ai.exe`
- integration points:
  - `electron/main.js`
  - `electron/preload.js`
  - `types/electron.d.ts`
- development fallback:
  - `electron/runtime/mock-ai-runtime.js`

### Replace with

- `llama.cpp`
  - repo: `https://github.com/ggml-org/llama.cpp`
  - use `llama-server` or `llama-cli` as the actual inference engine

### Why

- mature GGUF support
- strong Apple Silicon support
- strong Windows/Linux support
- standard backend for local Qwen models
- removes the need for a custom opaque runtime binary

### Migration target

- keep the existing Electron IPC contract
- replace the spawned runtime process in `electron/main.js`
- point model execution to `llama.cpp` binaries under:
  - `electron/runtime/bin/darwin-arm64/`
  - `electron/runtime/bin/win32-x64/`

### Keep

- model manifest flow
- optional model install manager
- Kivora study-only guardrails

## 2. Deterministic offline text generation

### Current

- `lib/offline/generate.ts`

### Replace with

- keep as emergency fallback only
- do not treat deterministic templates as the primary offline intelligence path

### Why

- current deterministic output is too weak for a serious offline product
- once `llama.cpp` is wired in, the fallback should only cover:
  - runtime unavailable
  - malformed local response
  - ultra-low-resource fallback mode

## 3. Math expression engine

### Current

- custom parsing / partial offline solving:
  - `lib/math/offline-solver.ts`
  - `components/tools/MathSolver.tsx`

### Replace or augment with

- `mathjs`
  - repo: `https://github.com/josdejong/mathjs`
- `nerdamer`
  - repo: `https://github.com/jiggzson/nerdamer`

### Why

- stronger symbolic and numeric handling
- less custom parser maintenance
- better reliability for integrals, limits, simplification, and algebra

### Recommendation

- use `mathjs` for numeric evaluation and expression parsing
- use `nerdamer` for symbolic cases where it helps
- keep Kivora-specific UI, workflows, and result formatting

## 4. Math input / keyboard UX

### Current

- custom math keyboard inside:
  - `components/tools/MathSolver.tsx`

### Replace or augment with

- `MathLive`
  - repo: `https://github.com/arnog/mathlive`

### Why

- proper math-field editing
- cursor-aware fraction/root/superscript/subscript input
- better visibility of structured expressions

### Recommendation

- keep the current plain-text path for simple users
- add `MathLive` as the structured input mode

## 5. PDF and document extraction

### Current

- custom extraction:
  - `lib/pdf/extract`

### Replace or augment with

- `pdf.js`
  - repo: `https://github.com/mozilla/pdf.js`
- optional desktop-side converters only if stable enough

### Why

- more reliable parsing and rendering pipeline
- clearer separation between preview and extraction

### Recommendation

- use `pdf.js` for preview/render consistency
- keep Office conversion disabled unless a stable native chain is adopted

## 6. Speech / listen mode

### Current

- browser `speechSynthesis`

### Replace or augment with

- keep browser TTS for now
- optionally evaluate offline TTS later with a dedicated open-source engine

### Why

- this is not the current product bottleneck
- do not expand scope before offline AI and math are improved

## 7. OCR / visual analysis

### Current

- app visual analysis routes and file/image handling

### Replace or augment with

- `Tesseract.js`
  - repo: `https://github.com/naptha/tesseract.js`

### Why

- better offline OCR path for image-based academic material

### Recommendation

- use only if OCR quality is the actual bottleneck
- do not mix OCR replacement with the local LLM runtime migration

## Recommended first implementation slice

Do these in order:

1. Replace `studypilot-ai` runtime with `llama.cpp`
2. Downgrade `lib/offline/generate.ts` to fallback-only behavior
3. Add `MathLive` to the math input surface
4. Add `mathjs` for stronger expression parsing/evaluation

## Current status

The first runtime slice is now in place:

- Electron now prefers `llama-server` under `electron/runtime/bin/<platform>/`
- legacy `studypilot-ai` binaries are still accepted as a fallback
- local dev still falls back to `mock-ai-runtime.js`
- the renderer `desktopAI` IPC contract is unchanged

## What should stay custom

Do not replace these:

- Kivora Electron IPC contract
- Kivora model selection UX
- Kivora study-only policy engine
- Kivora planner/workspace/product logic
- release manifest/checksum workflow

## Files most directly affected by the runtime replacement

- `electron/main.js`
- `electron/preload.js`
- `types/electron.d.ts`
- `lib/ai/client.ts`
- `app/(dashboard)/settings/page.tsx`
- `components/workspace/WorkspacePanel.tsx`
- `app/(dashboard)/tools/page.tsx`
- `electron/runtime/README.md`

## Practical decision

If only one change is made next, it should be this:

- replace the current custom desktop AI runtime layer with `llama.cpp`

That is the highest-value improvement.
