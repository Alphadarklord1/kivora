# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

StudyPilot is a study workspace web application built with Next.js 14 (App Router), Neon PostgreSQL, and NextAuth.js. It helps students organize study materials, generate quizzes/summaries from uploaded files (PDF, Word, PowerPoint), and manage content with cloud-synced metadata.

## Commands

```bash
# Development
npm run dev

# Build
npm run build

# Database migrations
npx drizzle-kit push    # Push schema to Neon
npx drizzle-kit studio  # Open Drizzle Studio GUI
```

## Architecture

**Stack:**
- Next.js 14 with App Router
- Neon PostgreSQL via Drizzle ORM
- NextAuth.js v5 (beta) for authentication
- IndexedDB for local file blob storage
- JSZip for Word/PowerPoint text extraction
- PDF.js for PDF text extraction

**Layout (single-page app):**
- Left sidebar: Folder tree with subfolders, file upload, files list
- Right main panel: Workspace/Tools/Library tabs with tool tabs (Assignment, Summarize, MCQ, Quiz, Pop Quiz, Notes, Library)

**Key directories:**
- `app/(dashboard)/workspace/` - Main unified workspace page
- `components/folders/FolderPanel.tsx` - Folder sidebar with file upload
- `components/workspace/WorkspacePanel.tsx` - Workspace with tools and library
- `lib/db/schema.ts` - Database schema (Drizzle)
- `lib/offline/generate.ts` - Offline content generation
- `lib/pdf/extract.ts` - Text extraction from PDF/Word/PowerPoint
- `lib/idb/index.ts` - IndexedDB wrapper for file blobs

**Data flow:**
- Metadata (folders, files info, library items) syncs to Neon PostgreSQL
- File blobs (PDFs, Word, PowerPoint) stored in browser IndexedDB
- Text extraction happens client-side from IndexedDB blobs
- Generated content can be saved to Library (database) or Folder (as file)

**Database tables:**
- `users`, `accounts`, `sessions` - NextAuth.js
- `userSettings` - Theme, font size, density
- `folders` - Top-level folders
- `topics` - Subfolders within folders
- `files` - File metadata with `localBlobId` referencing IndexedDB
- `libraryItems` - Saved generated content
- `shares` - Sharing configuration

**File upload workflow:**
1. User selects file (PDF/Word/PowerPoint)
2. File blob stored in IndexedDB with unique ID
3. File metadata saved to Neon with `localBlobId` reference
4. When using tools, text extracted from IndexedDB blob
5. Generated content can be saved to Library or as a file in folder

**Environment variables (`.env.local`):**
```
DATABASE_URL=postgresql://...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret
```
