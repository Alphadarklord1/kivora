# Design System — Kivora

## Product Context
- **What this is:** Desktop-first AI study workspace for students with offline AI models, file organization, and AI-powered study tools
- **Who it's for:** Students doing serious academic work — long study sessions, comprehension over flashiness, focus over distraction
- **Space/industry:** Educational productivity tools (Notion, Obsidian, Anki)
- **Project type:** Desktop app (Electron) with web companion — productivity tool, data-dense, multiple tools/views (workspace, coach, math)

## Aesthetic Direction
- **Direction:** Focused Scholar — Warm minimalism for long study sessions
- **Decoration level:** Intentional — subtle texture/grain in backgrounds for warmth without distraction
- **Mood:** Serious but supportive. Not corporate-sterile (like enterprise tools), not playful (like consumer edtech), not austere (like Anki's dated UI). The Goldilocks zone: students doing real work deserve a tool that respects their intelligence and supports deep focus.
- **Reference sites:**
  - Notion (avoid: too playful, productivity theater)
  - Obsidian (reference: dark mode execution, serious tone)
  - Anki (avoid: austere aesthetic, but respect: function-first philosophy)

## Typography
- **Display/Hero:** Instrument Serif — Adds warmth and personality without feeling old-fashioned. Used for page headings, section titles, creating hierarchy. Signals "serious but supportive."
- **Body:** DM Sans — Proven readability for long study sessions. Geometric enough to feel modern, humanist enough to reduce fatigue. Better than Inter/Roboto (overused, can feel cold).
- **UI/Labels:** DM Sans (same as body for consistency)
- **Data/Tables:** JetBrains Mono — Clear tabular nums, excellent for study stats, quiz scores, file lists, code blocks
- **Code:** JetBrains Mono
- **Loading:** Google Fonts or Bunny Fonts (privacy-friendly alternative)
  - `https://fonts.bunny.net/css?family=dm-sans:400,500,700|instrument-serif:400,600|jetbrains-mono:400,500`
- **Scale:**
  - Hero/H1: 48px (Instrument Serif, weight 600)
  - H2: 32px (Instrument Serif, weight 600)
  - H3: 24px (Instrument Serif, weight 400)
  - Body: 16px (DM Sans, weight 400, line-height 1.6)
  - Small/UI labels: 14px (DM Sans, weight 500)
  - Tiny/Meta: 12px (DM Sans, weight 400)
  - Code/Data: 14px (JetBrains Mono, weight 400)

## Color
- **Approach:** Restrained — 1 accent + neutrals. Color is rare and meaningful. When you see blue, it means "act here."
- **Primary/Accent:** #4a90e2 — Calm blue, not aggressive. Good for focus, reduces anxiety during study sessions. Avoid purple (AI slop cliché), avoid bright green (too aggressive).
- **Secondary:** Not needed — restrained palette keeps one accent only
- **Neutrals (Dark mode — default for desktop):**
  - Base background: #1a1a1a (warm dark gray, NOT pure black #000000)
  - Surface: #2a2a2a
  - Surface hover: #333333
  - Primary text: #e8e6e3 (warm off-white, NOT pure white #ffffff)
  - Secondary text: #b8b6b3
  - Muted text: #888686
  - Border: #404040
- **Neutrals (Light mode — web companion):**
  - Base background: #fafafa
  - Surface: #ffffff
  - Surface hover: #f5f5f5
  - Primary text: #1a1a1a
  - Secondary text: #666666
  - Muted text: #999999
  - Border: #e0e0e0
- **Semantic:**
  - Success: #22c55e (green)
  - Warning: #f59e0b (amber)
  - Error: #ef4444 (red)
  - Info: #4a90e2 (same as accent)
- **Dark mode strategy:** Default for desktop app. Redesign surfaces with warm dark grays (#1a1a1a base, #2a2a2a surface) to reduce eye strain during 4-hour study sessions. Pure black (#000) creates too much contrast and causes fatigue — dark mode research confirms warm grays are better for extended use.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — not compact (too cramped for long sessions), not spacious (wastes screen real estate for data-dense tool)
- **Scale:**
  - 2xs: 4px
  - xs: 8px
  - sm: 12px
  - md: 16px (base unit for most components)
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px

## Layout
- **Approach:** Grid-disciplined — strict columns, predictable alignment. Data-dense tool needs structure, not creative asymmetry.
- **Grid:**
  - Desktop: Sidebar (240px fixed) + Main (fluid)
  - Tablet: Collapsible sidebar
  - Mobile: Single column, hamburger nav
- **Max content width:** No global max — desktop app uses full window. Text-heavy sections (like generated summaries) should self-limit to ~800px for readability.
- **Border radius:**
  - sm: 4px (inputs, small cards, file items)
  - md: 8px (buttons, modals, panels)
  - lg: 12px (major sections, workspace panels)
  - full: 9999px (avatars, pills, badges)

## Motion
- **Approach:** Minimal-functional — only transitions that aid comprehension. No animations for the sake of "delight" — students want speed and clarity.
- **Easing:**
  - Enter: ease-out (0.2s) — elements appear quickly
  - Exit: ease-in (0.15s) — elements disappear slightly faster
  - Move: ease-in-out (0.25s) — position changes feel smooth
- **Duration:**
  - Micro: 50-100ms (hover states, toggles)
  - Short: 150-200ms (dropdowns, tooltips, most UI)
  - Medium: 250ms (modals, panels)
  - Long: 400ms (page transitions — use sparingly)

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-25 | Initial design system created | Created by /design-consultation based on product context (students, long study sessions, offline-first desktop app) and competitive research (Notion, Obsidian, Anki). Focused Scholar aesthetic chosen to differentiate: warmer than Obsidian's intensity, more serious than Notion's playfulness, more polished than Anki's austerity. |
| 2026-04-25 | Warm dark grays (#1a1a1a) over pure black | Dark mode research shows pure black creates too much eye strain during extended use. Warm dark grays reduce fatigue for 4-hour study sessions. |
| 2026-04-25 | DM Sans over Inter/Roboto | Inter and Roboto are overused (convergence trap for AI design tools). DM Sans has humanist proportions that improve readability during long reading sessions. |
| 2026-04-25 | Restrained color (single accent) | Students need focus, not distraction. Color is rare and meaningful — when you see blue, it means "act here." Avoids purple (AI slop pattern) and bright green (too aggressive). |
| 2026-04-25 | Intentional decoration (subtle texture) | Prevents sterile enterprise software feel. Adds visual warmth without distraction. Students doing hard work deserve a supportive tool, not an austere one. |
