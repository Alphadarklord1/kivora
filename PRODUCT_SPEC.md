# Kivora Product Specification

## 1. Overview

Kivora is an offline-first AI study workspace for students. It helps users organize study material, generate study outputs from their own files, solve technical problems, plan study time, and track progress in one product.

Desktop is the primary experience. Web is a supported companion surface for browser access and sync.

## 2. Product Goal

Help students turn raw course material into usable learning output and a clear study plan with minimal friction.

## 3. Target Users

- University students
- High school students in exam-heavy subjects
- Tutors and instructors
- Self-learners working from PDFs, notes, slides, and problem sets

## 4. Core Value Proposition

- Organize study content in one place
- Generate summaries, notes, quizzes, and rephrased text from user material
- Support technical study workflows, especially math-heavy work
- Plan and track study progress
- Work offline on desktop using local open-source AI models

## 5. Supported Platforms

- Desktop app
  - macOS
  - Windows
- Web app
  - supported companion surface
- Mobile browser
  - limited support compared with desktop

## 6. Product Principles

- Offline-first on desktop
- Guest-first usage by default
- AI should stay scoped to study-related tasks
- User files and outputs are the center of the workflow
- The app should degrade gracefully when DB or cloud services are unavailable

## 7. Product Areas

### 7.1 Workspace

Purpose:
- Central hub for files, folders, and AI actions

Capabilities:
- View folders and subtopics
- Upload and process files
- Select tools and generate outputs
- Save results to library
- Switch between file-focused and tool-focused workflows

Supported input:
- PDF
- Word documents
- Images
- Plain text

Behavior requirements:
- Must support guest mode
- Must remain usable in no-DB mode with local fallback where applicable

### 7.2 Folder System

Purpose:
- Organize content by subject, course, chapter, or topic

Capabilities:
- Create folders
- Create subtopics
- Expand/collapse hierarchy
- Delete and edit nodes
- Use local fallback persistence when DB is unavailable

### 7.3 AI Study Tools

Purpose:
- Convert content into study-ready outputs

Current tools:
- Summarize
- Rephrase
- Notes
- Quiz
- MCQ
- Flashcards / SRS
- Assignment support
- Planner-oriented study suggestions

Behavior requirements:
- Prefer local open-source model on desktop
- Use cloud only as fallback where configured
- Use deterministic offline logic only as last fallback
- Block out-of-scope prompts where policy requires it

### 7.4 Math Module

Purpose:
- Support technical and engineering study workflows

Capabilities:
- Solve math problems
- Use structured math input
- Graph equations
- Provide MATLAB-style workspace behavior
- Return explanations and math-oriented outputs

Current input layer:
- MathLive

Target improvements:
- Better symbolic support
- Better integrals, limits, matrices, and step-by-step solving

### 7.5 Planner

Purpose:
- Turn study goals into scheduled activity

Capabilities:
- Calendar-style planning
- Outlook-style day/week/month navigation
- Focus/timer integration
- Plan generation from analytics or AI suggestions
- Local fallback storage if DB is unavailable

### 7.6 Analytics

Purpose:
- Show progress, weak areas, and usage patterns

Capabilities:
- Quiz stats
- Study activity and streaks
- Plan completion stats
- Weak-area identification
- Suggested next actions

Behavior requirements:
- Must not hard-fail in empty-state
- Must return fallback analytics cleanly in no-DB scenarios

### 7.7 Library

Purpose:
- Store generated study outputs for later reuse

Capabilities:
- Save summaries, notes, quizzes, rephrased content, and similar artifacts
- Reopen and review prior outputs
- Search and reuse saved items

### 7.8 Sharing

Purpose:
- Share outputs and study resources with others

Capabilities:
- Share generated items or study resources
- Support collaboration direction for future expansion

### 7.9 Settings / Account / Security

Purpose:
- Central system control area

Capabilities:
- Account management
- Appearance/theme
- Language
- AI runtime/provider status
- Security controls
- 2FA
- Reporting/support links

Design rules:
- Account click should route to `Settings > Account`
- Encryption belongs in `Settings > Security`
- Sidebar should not expose heavy system controls loudly

### 7.10 Offline AI Runtime

Purpose:
- Provide local study AI on desktop

Target stack:
- `llama.cpp`
- GGUF models
- Bundled Mini model
- Optional Balanced and Pro models

Model strategy:
- Mini bundled with app
- Balanced/Pro downloadable later
- Local open-source models are the preferred desktop path

## 8. Primary User Flows

### 8.1 Study Generation Flow

1. User uploads or selects a file
2. Workspace extracts text
3. User selects a tool
4. AI generates output
5. Output can be copied, saved, or reused

### 8.2 Planning Flow

1. User creates or generates a study plan
2. Plan appears in Planner
3. User runs study sessions
4. Progress feeds Analytics

### 8.3 Math Flow

1. User enters a problem via math input
2. Solver/graphing/MATLAB tools process it
3. User reviews result
4. Output can be saved or reused

### 8.4 Analytics Coaching Flow

1. Study activity accumulates
2. Analytics identifies weak areas
3. System suggests next actions
4. User sends suggestion into Planner or tools

## 9. AI Architecture

Desktop:
- local open-source model first
- optional cloud fallback
- deterministic offline fallback last

Web:
- cloud first where configured
- deterministic fallback when cloud is unavailable

Policy:
- study-focused behavior
- out-of-scope prompts can be blocked

## 10. File Processing Architecture

Current and planned open-source stack:
- `pdf.js` for PDF handling
- `mammoth.js` for Word extraction
- OCR candidates for scanned documents:
  - `Tesseract.js`
  - `Scribe.js`

Arabic requirements:
- Arabic Word documents must be readable
- Arabic text must be rephrasable and summarizable
- Arabic UI must be supported on active product surfaces

## 11. Authentication

Supported modes:
- Guest mode
- Email/password
- Google login
- GitHub login
- Optional 2FA

Requirements:
- New users must be able to use core flows without account creation
- Authenticated users should gain persistent multi-device behavior

## 12. Data and Persistence

Primary persistence:
- PostgreSQL / Neon-backed database when configured

Fallback persistence:
- Local browser or local app storage in fallback-safe mode

Requirements:
- Reads should degrade gracefully
- Writes should use local fallback where reasonable
- User-critical flows should not hard crash in no-DB fallback mode

## 13. Themes and Language

Themes:
- Light
- Blue Mode
- Black Mode
- System

Languages:
- English
- Arabic

Requirements:
- Active surfaces must support Arabic and RTL correctly
- Technical terms may remain English where appropriate

## 14. Error Handling

Requirements:
- Structured API errors where practical
- Graceful empty states
- No silent hard failures for core user flows
- In-app issue reporting paths available

## 15. Team and Maintenance

GitHub collaboration support includes:
- Issue templates
- PR template
- Contributing guide
- CODEOWNERS
- Project board
- Milestones
- Support and security docs

Goal:
- Enable a small team to maintain and improve Kivora in a disciplined way

## 16. Non-Goals

- Not a general-purpose chatbot
- Not a broad social productivity app
- Not a full LMS replacement
- Not production-grade enterprise security/compliance yet

## 17. Current Gaps

- Stronger local model integration everywhere promised
- Better symbolic math engine support
- Better OCR and scanned-document handling
- More consistent design language across all dashboard surfaces
- Final Arabic and RTL completion
- Stronger planner interactions
- Cleaner release flow for desktop artifacts and model assets
- Better DB-backed persistence in deployed environments

## 18. Public 1.0 Definition

Kivora is public 1.0-ready when:
- Guest users can use core flows without sign-in
- Folders, files, planner, and analytics work without crashing
- AI tools produce useful output in desktop local mode
- Desktop builds ship with bundled Mini model
- Settings/account/security behavior is coherent
- Web companion works with graceful fallbacks
- Release process is repeatable

## 19. Release Criteria

Before a public release:
- `npm run build` passes
- `npm run test:release` passes
- desktop packaging succeeds
- model manifest and checksums validate
- guest mode works
- login flows work when configured
- planner, analytics, workspace, Scholar Hub, Math, and library are smoke-tested

## 20. Future Directions

- Better local-model quality and routing
- Advanced symbolic math via dedicated engine integration
- Stronger collaboration and shared study workflows
- Richer OCR and multilingual document handling
- More polished calendar/planner interactions
