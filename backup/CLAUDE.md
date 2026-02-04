# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StudyPilot is an offline-first study workspace web application built with vanilla JavaScript (no build tools or frameworks). It helps students organize study materials, generate quizzes/summaries from content, and manage files locally using browser storage.

## Running the Application

Open `index.html` directly in a browser, or serve via any static file server:
```bash
python3 -m http.server 8000
# or
npx serve .
```

## Architecture

**Single-page app with three files:**
- `index.html` - Entry point, loads PDF.js from `./vendor/pdfjs/` and app.js
- `app.js` - All application logic (~2200 lines), dynamically renders UI via `renderAppShell()`
- `styles.css` - CSS with design tokens, light/dark theme support, density variants

**Key patterns:**
- UI is rendered entirely by JavaScript into `#app` div (no static HTML beyond the shell)
- State persisted in localStorage (folders, files metadata, library items, settings) and IndexedDB (uploaded file blobs)
- No external API calls - all content generation (summaries, MCQs, quizzes) runs offline using text extraction and keyword analysis

**Data storage keys:**
- `studypilot_folders_v2` - Folder/subfolder hierarchy
- `studypilot_files_v1` - File metadata (references blobs in IndexedDB)
- `studypilot_library` - Saved generated content (summaries, quizzes, etc.)
- `studypilot_settings_v1` - User preferences (theme, font size, density)
- `studypilot_recent_v1` - Recently accessed files
- IndexedDB `studypilot_blobs_v1` - Original uploaded file blobs (PDF/Word/PPT)

**Main components in app.js:**
- `renderAppShell()` - Builds the entire UI dynamically
- `offlineGenerate(mode, text)` - Generates content for each tool mode (assignment, summarize, mcq, quiz, pop, notes)
- `extractTextFromPDF(file)` - PDF text extraction using PDF.js
- Folder/Topic CRUD functions - `loadFolders()`, `saveFolders()`, `addTopic()`, `deleteFolder()`, etc.
- File management - `loadFiles()`, `saveFiles()`, `saveContentAsFile()`, `idbPut()`, `idbGet()`
- App modes - Workspace/Tools/Library controlled by `setAppMode()`

**PDF.js dependency:**
Requires local PDF.js files at `./vendor/pdfjs/pdf.min.js` and `./vendor/pdfjs/pdf.worker.min.js`. Falls back to CDN if missing, but CDN may be blocked by ad blockers.
