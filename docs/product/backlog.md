# Klox Product Backlog

Living backlog for **Klox (`klox.dev`)**. Source of truth for context and domain rules: [GEMINI.md](../../GEMINI.md).

**Status values:** `Done` · `In Progress` · `POC` (scheduled in Phases 1–8) · `Next` (POC stabilization & scale — Phase 9 / Sprint 3) · `Later` (vision) · `Won't` (explicitly out of scope).

---

## POC Scope (Phases 1–8)

| ID | Requirement | Phase | Status | Notes |
|---|---|---|---|---|
| FR-0.1 | Firebase Auth (Email/Password + Google OAuth) & strict `users/{uid}` tenant isolation | 2 | Done | GEMINI.md §3.1 |
| FR-0.2 | Keyboard-first Command Timer Bar (`N`, `S`, `Esc`, `?`, `Tab` cycle), resilient `startTimeUTC` elapsed math, single active timer, manual log CRUD | 4 | Done | GEMINI.md §3.2 |
| FR-0.3 | Catalog: `Projects` (hex color, `isBillableDefault`), project-scoped `Tags` (domain invariant), foundational `Tasks`, `systemKey: 'unassigned'` | 3 | Done | GEMINI.md §2 |
| FR-0.4 | Two-tier hybrid search & AI auto-fill: Tier 1 `Fuse.js` Top-10 recall + Tier 2 Gemini structured JSON (`⌘I` / `Ctrl+I`) with server-side tag/project validation | 4 | Done | GEMINI.md §3.3 |
| FR-0.5 | Analytical Dashboard: reactive filter bar, Pizza chart, Daily stacked bar chart, Tag-grouped breakdown table | 5 | Done | GEMINI.md §3.4 |
| FR-0.6 | Bi-directional Toggl Track CSV import (dry-run, auto-resolve entities, deterministic hash IDs) & UTF-8 BOM export | 6 | Done | GEMINI.md §3.5 |
| **FR-1** | **Landing page:** prerendered showcase (`/`, `/pt-br`), open sign-up, self-playing Command Bar hero demo, feature grid, ADO sync teaser, pricing placeholder, FAQ, SEO/OG | 1 (minimal) → 8 (full) | Done | GEMINI.md §3.6 |
| **FR-2** | **Onboarding:** `/app/welcome` setup wizard (regional prefs → Work/Personal/Both profile → create project / import Toggl / start empty — **never fake sample data**), interactive keyboard tutorial (with touch variant), getting-started checklist, `?` help & replay sheet | seams 2–4 → 7 | Done | GEMINI.md §3.7 |
| **FR-3** | **Internationalization:** `en` and `pt-BR` at launch; locale-agnostic setup; `UserPreferences` (timezone, week start, date format, 12/24h); timezone-aware `dateKey` + per-log `timeZone` snapshot; `useFormat()` via `Intl.*`; timers always `HH:MM:SS` in Latin digits | 1 → 7 | Done | GEMINI.md §3.8 |
| **FR-4.1** | **Hierarchical Tasks (`Task` → `Subtask` → `Sub-subtask`):** tasks support up to 3 hierarchy levels (`parentTaskId`, `depth: 0 \| 1 \| 2`) strictly scoped within the same `Project`, with cascade delete and rolled-up tracked hours | 3 → 4 | Done | ADR-0007, GEMINI.md §2 |
| **FR-4.2** | **Task Markdown Descriptions:** tasks support an optional `description` field with XSS-safe basic Markdown rendering (`**bold**`, `*italic*`, `` `code` ``, lists, links, `- [ ]` checklists, headings) | 3 → 4 | Done | ADR-0007, GEMINI.md §2 |
| **FR-4.3** | **Task-Driven Timer & TimeLog Execution:** start a live `ActiveTimer` (`[▶ Start]`) or log time directly from any Task, Subtask, or Sub-subtask (auto-binding `projectId`, `taskId`, hierarchical `description`, and `isBillable`), plus Task selector in Command Timer Bar | 4 | Done | ADR-0007, GEMINI.md §3.2 |

---

## POC Stabilization, Scale & UX Polish (Phase 9 / Sprint 3)

Driven by real-world high-volume testing (importing thousands of historical Toggl Track records from User #001) and usability review.

| ID | Category | Requirement | Phase | Status | Notes |
|---|---|---|---|---|---|
| **NFR-1.1** | **Performance & Scale** | **7-Day Windowed Tracker Feed Pagination:** Paginate the main tracker view so each page renders strictly **7 distinct days** of `TimeLog` history, preventing DOM bloat and browser crashes on accounts with thousands of imported records | 9 | Next | Main Tracker View |
| **NFR-1.2** | **Performance & Scale** | **High-Volume Toggl CSV Import Optimization:** Tune batch ingestion and reactive store updates during massive CSV imports, and add a paginated, per-column filterable preview table (evaluating specialized table primitives) with an explicit `Imported` / `Pending` status badge per record | 9 | Next | GEMINI.md §3.5 |
| **FR-5.1** | **Timer & Log Ergonomics** | **Same-Day Log Grouping & Expandable Accordion:** Automatically group `TimeLog` entries recorded on the same `dateKey` that share identical `(normalizedDescription, projectId, taskId, tagIds)` into a single summary row with total duration, expandable to inspect individual log entries | 9 | Next | Main Tracker View |
| **FR-5.2** | **Timer & Log Ergonomics** | **Direct Click-to-Edit Time Range & Live Start Adjustment:** Replace explicit "Edit" action buttons on `TimeLog` rows with direct click-on-time inline inputs (`startTime` and `endTime`), allow manual `TimeLog` entries with overlapping time ranges, and allow backdating/adjusting `startTimeUTC` while an `ActiveTimer` is currently running | 9 | Next | GEMINI.md §3.2 |
| **FR-5.3** | **Catalog & Safety** | **Destructive Action Confirmation & Tag Renaming:** Require a confirmation modal before any destructive deletion (`TimeLog`, `Project`, `ProjectTag`, `Task`), and support editing/renaming existing `ProjectTag` entities | 9 | Next | GEMINI.md §2 |
| **FR-5.4** | **Analytics Dashboard** | **Multi-Dimension Slicing, 2-Level Grouping & Time Granularity:** Allow slicing both Pizza and Histogram charts by `Project`, `Task`, `Tag`, or `Description`; support 2-level hierarchical grouping in the breakdown table (e.g., `Project → Tag`, `Tag → Description`); add histogram time-bucket controls (`Day`, `Week`, `Month`, `Quarter`, `Year`); paginate the underlying logs table | 9 | Next | GEMINI.md §3.4 |
| **FR-5.5** | **Analytics Dashboard** | **Dedicated Multi-Select Filter Inputs with "Select All":** Provide 4 independent multi-select filter inputs (`Project`, `Task`, `Tag`, and `Log Description`), each supporting a `"Select all"` toggle for currently visible options | 9 | Next | GEMINI.md §3.4 |
| **UX-1.1** | **Copy & Accessibility** | **User-Friendly Copy & Base Typography Scaling:** Increase base font sizes so the UI is comfortable at `100%` browser zoom (without requiring `110%` scaling), and replace developer/architectural jargon (`Gemini`, `DDD`, `UTF-8 BOM`, `SHA-256`) in user-facing UI and landing copy with clear, general-audience language | 9 | Next | App & Landing UI |
| **UX-1.2** | **UI Polish & Brand** | **Landing Page Visual Redesign, Colored Google OAuth & Support Channel:** Precede landing page development with a dedicated UI/UX design study to soften excessive black/sharp geometry, improve whitespace and visual effects; render the official multi-color Google `"G"` icon on `/login`; expose `contact@klox.dev` on the landing page and inside the `?` Help / Shortcuts sheet for bug reports and feedback | 9 | Next | GEMINI.md §3.6 |

---

## Detailed Acceptance Criteria for Phase 9 Improvements

### 1. Data Safety & Catalog Management (`FR-5.3`)
* **Confirmation Dialogs:** Deleting any `TimeLog`, `Project`, `ProjectTag`, or `Task` (including cascade subtasks) must trigger a standardized confirmation modal/popover (keyboard-accessible via `Enter` to confirm / `Esc` to cancel) before committing the deletion.
* **Editable Project Tags:** Users must be able to rename an existing `ProjectTag` inline or via dialog, updating both the catalog tag and propagating or preserving historical snapshots consistently.

### 2. Main Tracker Feed, Grouping & Inline Timing (`NFR-1.1`, `FR-5.1`, `FR-5.2`)
* **7-Day Pagination (`NFR-1.1`):** Never mount the entire historical `TimeLog` collection into the DOM at once. Paginate the main tracker feed into chunks of **7 calendar days (`dateKey`) per page**.
* **Same-Day Log Aggregation (`FR-5.1`):** Within each day bucket, consecutive or multiple entries sharing the same `description`, `projectId`, `taskId`, and `tagIds` must collapse into a single grouped row showing the entry count badge and summed duration (`HH:MM:SS`), with a chevron to expand and inspect/edit individual executions.
* **Frictionless Time Editing (`FR-5.2`):**
  * **Live Timer Adjustment:** While `ActiveTimer` is running, clicking the elapsed time or start indicator allows adjusting `startTimeUTC` (e.g., *"started 15 minutes ago"*), immediately recalculating elapsed seconds.
  * **Direct Click-to-Edit on Logs:** Remove dedicated `"Edit"` buttons on log timings; clicking directly on a log's time/duration reveals inline `Start Time` and `Stop Time` inputs, recalculating `durationSeconds` on save.
  * **Overlapping Manual Logs:** Remove or relax any validation blocking manual `TimeLog` creation when its `[startTime, endTime]` interval overlaps an existing log.

### 3. Analytical Dashboard Upgrade (`FR-5.4`, `FR-5.5`)
* **Universal 4-Dimension Slicing:** Both the Pizza (Donut) Chart and the Histogram (Stacked Bar) Chart must support slicing/stacking by any of the 4 core dimensions: `Project`, `Task`, `Tag`, or `Description`.
* **Histogram Temporal Granularity:** Add a time-bucket selector to the Histogram chart supporting `Day`, `Week`, `Month`, `Quarter`, and `Year` aggregations.
* **Two-Level Table Grouping & Pagination:** The dashboard breakdown table must support selecting a **Primary Group** and a **Secondary Subgroup** across `Project`, `Task`, `Tag`, or `Description` (e.g., `Project → Tag` or `Tag → Description`), paired with pagination to handle thousands of matching records smoothly.
* **Four Dedicated Multi-Select Filters:** Replace combined/single-input filters with 4 distinct multi-select inputs (`Project`, `Task`, `Tag`, `Log Description`), each offering a `"Select all"` action that selects all options currently matching the dropdown search.

### 4. High-Volume CSV Studio (`NFR-1.2`)
* **Batch Import Performance:** Optimize memory allocation, hashing, and Firestore batch commits (`writeBatch`) so importing multi-year Toggl Track CSVs with thousands of rows does not freeze the main UI thread.
* **Paginated & Filterable Preview Table:** Adopt a robust data-table component (or virtualized/paginated table) in the CSV Studio preview supporting pagination, per-column filtering, and a clear status indicator flag (`Imported` vs. `New / Ready to Import`) on every row.

### 5. UX, Typography, Copy & Landing Redesign (`UX-1.1`, `UX-1.2`)
* **Typography Comfort at 100% Scale:** Bump base font sizes (`rem` / Tailwind text tokens) and spacing across the workspace so text and telemetry controls read comfortably at `100%` display scaling.
* **De-Jargonize User-Facing Copy:** Strip internal engineering terminology (`Gemini`, `Domain-Driven Design / DDD`, `SHA-256`, `UTF-8 BOM`) from UI labels, tooltips, onboarding, and marketing copy so Klox feels welcoming to any general user (keep architectural terminology strictly inside `README.md`, `GEMINI.md`, and `docs/adr/`).
* **Landing Page UI/UX Refresh:** Benchmark top modern SaaS landing pages and produce a UI/UX design exploration before coding; reduce visual density, soften excessive monochrome `#050505` contrast and sharp corners, and introduce subtle visual depth/effects.
* **Auth & Support Polish:** Use the official full-color Google `"G"` SVG on the `/login` Google OAuth button, and display `contact@klox.dev` on the landing page footer/FAQ as well as inside the in-app `?` Help / Shortcuts modal.

---

## Post-POC & Vision

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-V1 | **Azure DevOps Work Item sync:** link `Task` to Work Item, human-in-the-loop approval to push `CompletedWork`, create Work Items for unplanned tasks | Later | `Task` fields and event seams exist in POC |
| FR-V2 | **Personal Mastery goals:** `targetHours` progress tracking for studies, workouts, reading | Later | `Task.targetHours` already modeled |
| FR-V3 | **Pro plan billing** | Later | Landing page shows a non-interactive placeholder in POC |
| BL-1 | Automated test expansion: Playwright e2e suite, Firestore rules emulator suite, i18n CI check script, pseudo-locale generator | Next | Deferred from POC to keep token spend low (ADR-0006) |
| BL-2 | "What's new" tours triggered by bumping `onboarding.version` | Later | `version` field already on `OnboardingState` |
| BL-3 | Privacy-respecting onboarding funnel / product analytics via domain events | Later | — |
| BL-4 | Additional locales (`es` Spanish, community locales) + translation management service (Crowdin / Lokalise) | Later | Architecture supports adding a locale via one JSON file + one config entry |
| BL-5 | Batch tool to recalculate historical `dateKey` values after a user changes timezone | Later | — |
| BL-6 | Optional batch to propagate a project rename across historical `projectNameSnapshot` values | Later | — |