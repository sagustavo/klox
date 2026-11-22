# Klox Product Backlog

Living Product Backlog for **Klox (`klox.dev`)**. Source of truth for domain model and architectural rules: [GEMINI.md](../../GEMINI.md).

This document is structured for **Azure DevOps (Scrum)** synchronization via MCP. Every open item below includes normalized metadata, a clear problem/value description, and testable acceptance criteria.

---

## Status & Azure DevOps MCP Mapping

| Klox Status | Azure DevOps `System.State` | Meaning |
|---|---|---|
| `Done` | `Done` | Implemented and verified in the codebase |
| `In Progress` | `Committed` | Currently being implemented in the active sprint |
| `Next` | `Approved` | Scheduled for upcoming delivery (Phase 9 Stabilization & Phase 10 Enhancements) |
| `Later` | `New` | Post-POC roadmap, Pro tier features, and long-term vision |
| `Won't` | `Removed` | Explicitly rejected / out of scope |

### Field Mapping for Azure DevOps MCP Ingestion

| Markdown Card Field | Azure DevOps Field | Format Notes |
|---|---|---|
| `[ID] Title` | `System.Title` | Keep ID prefix for traceability (e.g., `[FR-6.3] VS Code-Style Customizable Keyboard Shortcuts & Resume Last Activity`) |
| `Work Item Type` | `System.WorkItemType` | `Product Backlog Item` or `Bug` |
| `Area / Category` | `System.AreaPath` / Custom Area | Sub-area under `Klox` |
| `Phase` | `System.IterationPath` | Maps to Sprint / Phase (e.g., `Klox\Phase 9`, `Klox\Phase 10`, `Klox\Future`) |
| `Status (ADO State)` | `System.State` | Uses mapping table above |
| `Priority` | `Microsoft.VSTS.Common.Priority` | `1` (Critical), `2` (High), `3` (Medium), `4` (Low) |
| `Plan Tier` | Tag / Custom Context | `Free`, `Pro`, `Free + Pro`, or `Internal` |
| `Tags` | `System.Tags` | Semicolon-delimited (`tag-a; tag-b`) |
| `Description` | `System.Description` | Overview, business value, and technical context |
| `Acceptance Criteria` | `Microsoft.VSTS.Common.AcceptanceCriteria` | Checklist items |

---

## 1. Completed Scope — POC Foundation (Phases 1–8) [`Done`]

| ID | Work Item Type | Title / Requirement | Phase | Status | References |
|---|---|---|---|---|---|
| **FR-0.1** | Product Backlog Item | Firebase Auth (Email/Password + Google OAuth) & strict `users/{uid}` tenant isolation | 2 | Done | GEMINI.md §3.1 |
| **FR-0.2** | Product Backlog Item | Keyboard-first Command Timer Bar (`N`, `S`, `Esc`, `?`, `Tab` cycle), resilient `startTimeUTC` elapsed math, single active timer, manual log CRUD | 4 | Done | GEMINI.md §3.2 |
| **FR-0.3** | Product Backlog Item | Catalog: `Projects` (hex color, `isBillableDefault`), project-scoped `Tags` (domain invariant), foundational `Tasks`, `systemKey: 'unassigned'` | 3 | Done | GEMINI.md §2 |
| **FR-0.4** | Product Backlog Item | Two-tier hybrid search & AI auto-fill: Tier 1 `Fuse.js` Top-10 recall + Tier 2 Gemini structured JSON (`⌘I` / `Ctrl+I`) with server-side tag/project validation | 4 | Done | GEMINI.md §3.3 |
| **FR-0.5** | Product Backlog Item | Analytical Dashboard: reactive filter bar, Pizza chart, Daily stacked bar chart, Tag-grouped breakdown table | 5 | Done | GEMINI.md §3.4 |
| **FR-0.6** | Product Backlog Item | Bi-directional Toggl Track CSV import (dry-run, auto-resolve entities, deterministic hash IDs) & UTF-8 BOM export | 6 | Done | GEMINI.md §3.5 |
| **FR-1** | Product Backlog Item | Landing page: prerendered showcase (`/`, `/pt-br`), open sign-up, self-playing Command Bar hero demo, feature grid, ADO sync teaser, pricing placeholder, FAQ, SEO/OG | 1 → 8 | Done | GEMINI.md §3.6 |
| **FR-2** | Product Backlog Item | Onboarding: `/app/welcome` setup wizard (regional prefs → Work/Personal/Both profile → create project / import Toggl / start empty — **never fake sample data**), interactive keyboard tutorial (with touch variant), getting-started checklist, `?` help & replay sheet | 2–4 → 7 | Done | GEMINI.md §3.7 |
| **FR-3** | Product Backlog Item | Internationalization: `en` and `pt-BR` at launch; locale-agnostic setup; `UserPreferences` (timezone, week start, date format, 12/24h); timezone-aware `dateKey` + per-log `timeZone` snapshot; `useFormat()` via `Intl.*`; timers always `HH:MM:SS` in Latin digits | 1 → 7 | Done | GEMINI.md §3.8 |
| **FR-4.1** | Product Backlog Item | Hierarchical Tasks (`Task` → `Subtask` → `Sub-subtask`): up to 3 hierarchy levels (`parentTaskId`, `depth: 0 \| 1 \| 2`) strictly scoped within the same `Project`, with cascade delete and rolled-up tracked hours | 3 → 4 | Done | ADR-0007, GEMINI.md §2 |
| **FR-4.2** | Product Backlog Item | Task Markdown Descriptions: optional `description` field with XSS-safe basic Markdown rendering (`**bold**`, `*italic*`, `` `code` ``, lists, links, `- [ ]` checklists, headings) | 3 → 4 | Done | ADR-0007, GEMINI.md §2 |
| **FR-4.3** | Product Backlog Item | Task-Driven Timer & TimeLog Execution: start a live `ActiveTimer` (`[▶ Start]`) or log time directly from any Task, Subtask, or Sub-subtask (auto-binding `projectId`, `taskId`, hierarchical `description`, and `isBillable`), plus Task selector in Command Timer Bar | 4 | Done | ADR-0007, GEMINI.md §3.2 |

---

## 2. Active Bugs

| ID | Title | Area | Priority | Phase | Status | Tags |
|---|---|---|---|---|---|---|
| **BUG-1** | AI Auto-Fill Throwing "Session Expired" Error | AI & Auth | 1 - Critical | 9 | Next | `bug; ai-autofill; auth; phase-9` |
| **BUG-2** | Production Back-End Not Working on `klox.dev` | Infrastructure & Deployment | 1 - Critical | 9 | Next | `bug; backend; infra; nitro; hosting; phase-9` |

---

## 3. Open Product Backlog — Master Index

### 3.1 Phase 9 / Sprint 3 — Stabilization, Scale & UX Polish (`Next`)

Driven by real-world high-volume testing (importing thousands of historical Toggl Track records from User #001) and usability review.

| ID | Work Item Type | Title | Area | Priority | Plan | Status |
|---|---|---|---|---|---|---|
| **NFR-1.1** | Product Backlog Item | 7-Day Windowed Tracker Feed Pagination | Performance & Scale | 2 - High | Free | Next |
| **NFR-1.2** | Product Backlog Item | High-Volume Toggl CSV Import Optimization & Filterable Preview Table | Performance & Scale | 2 - High | Free | Next |
| **FR-5.1** | Product Backlog Item | Same-Day Log Grouping & Expandable Accordion | Timer & Log Ergonomics | 2 - High | Free | Next |
| **FR-5.2** | Product Backlog Item | Direct Click-to-Edit Time Range, Overlapping Logs & Live Start Adjustment | Timer & Log Ergonomics | 2 - High | Free | Next |
| **FR-5.3** | Product Backlog Item | Destructive Action Confirmation & Project Tag Renaming | Catalog & Safety | 2 - High | Free | Next |
| **FR-5.4** | Product Backlog Item | Dashboard Multi-Dimension Slicing, 2-Level Grouping & Time Granularity | Analytics Dashboard | 2 - High | Free | Next |
| **FR-5.5** | Product Backlog Item | Dedicated Multi-Select Filter Inputs with "Select All" | Analytics Dashboard | 3 - Medium | Free | Next |
| **UX-1.1** | Product Backlog Item | User-Friendly Copy & Base Typography Scaling | Copy & Accessibility | 3 - Medium | Free | Next |
| **UX-1.2** | Product Backlog Item | Orbital Design System Evolution: Musk-Tech Aesthetics, Landing/Auth Redesign & Platform-Wide Consistency | UI Polish & Brand | 3 - Medium | Free | Next |

### 3.2 Phase 10 — Keyboard Velocity, Auth, Profile & Feedback (`Next`)

Focused on zero-friction activity capture, customizable keyboard ergonomics, seamless multi-provider auth, user profile insights, and closed-loop user feedback.

| ID | Work Item Type | Title | Area | Priority | Plan | Status |
|---|---|---|---|---|---|---|
| **FR-6.1** | Product Backlog Item | Instant-Start Activity on `N` & Discard Empty Timer on Cancel/Stop | Timer & Log Ergonomics | 2 - High | Free | Next |
| **FR-6.2** | Product Backlog Item | Retroactive AI Auto-Fill on Historical TimeLogs | AI & Recall | 3 - Medium | Free | Next |
| **FR-6.3** | Product Backlog Item | VS Code-Style Customizable Keyboard Shortcuts & Resume Last Activity | Keyboard & Shortcuts | 2 - High | Free | Next |
| **FR-6.4** | Product Backlog Item | Multi-Provider Authentication Linking (Google OAuth & Email/Password) | Authentication & Security | 2 - High | Free | Next |
| **FR-6.5** | Product Backlog Item | Password Reset Flow with Email Confirmation | Authentication & Security | 2 - High | Free | Next |
| **FR-6.6** | Product Backlog Item | User Profile Management & Time-Tracking Activity Heatmap | Profile & Telemetry | 3 - Medium | Free | Next |
| **FR-6.7** | Product Backlog Item | In-App Feedback Submission & My Feedback Management | Feedback & Community | 2 - High | Free | Next |

### 3.3 Post-POC, Pro Plan & Vision (`Later` / Engineering `Next`)

| ID | Work Item Type | Title | Area | Priority | Plan | Status |
|---|---|---|---|---|---|---|
| **FR-V1** | Product Backlog Item | Azure DevOps Work Item Sync (`CompletedWork`) | Integrations | 2 - High | Pro | Later |
| **FR-V2** | Product Backlog Item | Personal Mastery Goals (`targetHours` Progress Tracking) | Execution & Goals | 3 - Medium | Pro | Later |
| **FR-V3** | Product Backlog Item | Pro Plan Billing & Subscription Management | Monetization | 2 - High | Pro | Later |
| **FR-V4** | Product Backlog Item | Pause & Resume Activity with Distraction Telemetry & Shortcuts | Timer & Telemetry | 2 - High | Pro | Later |
| **FR-V5** | Product Backlog Item | Pomodoro Focus Mode | Timer & Focus | 4 - Low | Pro | Later |
| **FR-V6** | Product Backlog Item | Public Feedback Portal with Voting, Status Tracking, Comments & Pro Prioritization | Feedback & Community | 3 - Medium | Free + Pro | Later |
| **BL-1** | Product Backlog Item | Automated Test Expansion (Playwright E2E, Firestore Rules Emulator, i18n CI Check) | Engineering & QA | 3 - Medium | Internal | Next |
| **BL-2** | Product Backlog Item | "What's New" Tours Triggered by `onboarding.version` | Onboarding | 4 - Low | Free | Later |
| **BL-3** | Product Backlog Item | Privacy-Respecting Onboarding Funnel & Product Analytics | Analytics | 4 - Low | Internal | Later |
| **BL-4** | Product Backlog Item | Additional Locales (`es` Spanish & Community Locales) + TMS | Internationalization | 4 - Low | Free | Later |
| **BL-5** | Product Backlog Item | Batch Tool to Recalculate Historical `dateKey` on Timezone Change | Data & Timezone | 4 - Low | Free | Later |
| **BL-6** | Product Backlog Item | Optional Batch Propagation of Project Rename to `projectNameSnapshot` | Catalog & Data | 4 - Low | Free | Later |

---

## 4. Detailed Work Item Specifications (Azure DevOps MCP Import Cards)

### 4.1 Bugs

#### [BUG-1] AI Auto-Fill Throwing "Session Expired" Error
- **Work Item Type:** `Bug`
- **Area / Category:** `AI & Auth`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `1 - Critical`
- **Plan Tier:** `Free`
- **Tags:** `bug; ai-autofill; auth; phase-9`
- **Description:**
  - **Observed:** Triggering AI Auto-Fill (`⌘I` / `Ctrl+I` or button click) returns an `AUTH_INVALID` ("Session expired") error even while the user is actively signed in.
  - **Expected:** Authenticated users must obtain a valid/fresh Firebase ID token seamlessly, and `/api/ai/autofill` must authenticate the request and return predicted `projectId`, `tagIds`, and `isBillable` cleanly (with demo mode also handled safely).
  - **Context:** Likely caused by stale/expired cached ID tokens (`getIdToken()` without forced refresh), header stripping/casing, or `firebase-admin` configuration mismatch in the Nitro server route.
- **Acceptance Criteria:**
  - [ ] Reproduce and document the root cause across both local dev and production environments.
  - [ ] Refresh Firebase ID tokens automatically (`getIdToken(true)`) on missing/expired token errors or `401` retry before surfacing `AUTH_INVALID`.
  - [ ] Verify `/api/ai/autofill` succeeds end-to-end for both Email/Password and Google OAuth authenticated sessions as well as Local Demo Mode.
  - [ ] Document verification steps and ensure graceful error messaging when the user is genuinely signed out.

#### [BUG-2] Production Back-End Not Working on `klox.dev`
- **Work Item Type:** `Bug`
- **Area / Category:** `Infrastructure & Deployment`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `1 - Critical`
- **Plan Tier:** `Free`
- **Tags:** `bug; backend; infra; nitro; hosting; phase-9`
- **Description:**
  - **Observed:** Server-side Nuxt Nitro routes (such as `/api/ai/autofill`) are not functioning on the live production site `https://klox.dev`.
  - **Expected:** Hybrid SSR/prerendered marketing routes (`/`, `/pt-br`), client SPA routes (`/app/**`), and Nitro API endpoints (`/api/**`) must execute reliably in production on `klox.dev`.
  - **Context:** Requires verifying Firebase App Hosting runtime logs, Nitro server preset output, secret bindings (`NUXT_GEMINI_API_KEY`, Firebase Admin credentials), and Hostinger DNS/hosting routing rules (ensuring traffic hits App Hosting Cloud Run rather than static-only hosting).
- **Acceptance Criteria:**
  - [ ] Identify deployment/runtime root cause preventing Nitro server routes from responding on `https://klox.dev`.
  - [ ] Restore production Nitro runtime routing and verify runtime environment variables and secret bindings in `apphosting.yaml` / Firebase console.
  - [ ] Verify `/api/ai/autofill` and server routes respond cleanly with expected status codes on `https://klox.dev`.
  - [ ] Document the production deployment and environment verification checklist.

---

### 4.2 Phase 9 — Stabilization, Scale & UX Polish

#### [NFR-1.1] 7-Day Windowed Tracker Feed Pagination
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Performance & Scale`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `performance; pagination; tracker; phase-9`
- **Description:** Never mount the entire historical `TimeLog` collection into the DOM at once. Paginate the main tracker feed into discrete **7-day calendar windows** so accounts with thousands of imported Toggl Track records remain fast and responsive without DOM bloat or browser crashes.
- **Acceptance Criteria:**
  - [ ] Each page in the main tracker view renders strictly **7 distinct calendar days (`dateKey`)** computed in the user's preferred timezone (`UserPreferences.timeZone`).
  - [ ] Previous / Next window pagination controls allow navigating across the full chronological history without rendering off-page logs in the DOM.
  - [ ] Tested with 3,000+ imported `TimeLog` records with smooth scroll and instant interaction latency.

#### [NFR-1.2] High-Volume Toggl CSV Import Optimization & Filterable Preview Table
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Performance & Scale`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `csv; toggl; performance; table; phase-9`
- **Description:** Tune memory allocation, SHA-256 hashing, reactive store updates, and Firestore `writeBatch` ingestion so multi-year Toggl Track CSVs with thousands of rows import without blocking the main UI thread. Upgrade the preview table for large datasets with pagination, per-column filtering, and row import status badges.
- **Acceptance Criteria:**
  - [ ] Preview parsing and batch Firestore commits (`writeBatch`) handle 3,000+ CSV rows smoothly without freezing the browser tab or starving UI rendering.
  - [ ] Replace the static preview table with a paginated data table component (evaluating specialized table primitives) that supports per-column filtering.
  - [ ] Every preview row displays a clear status badge distinguishing already-existing records (`Imported`) from new records (`Pending` / `Ready to Import`).

#### [FR-5.1] Same-Day Log Grouping & Expandable Accordion
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Log Ergonomics`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `tracker; grouping; accordion; ux; phase-9`
- **Description:** Reduce visual clutter in the daily tracker feed by automatically collapsing multiple `TimeLog` records created on the same day with identical metadata into a single expandable summary row.
- **Acceptance Criteria:**
  - [ ] Within each day bucket (`dateKey`), entries sharing identical `(normalizedDescription, projectId, taskId, tagIds)` automatically group into one summary row.
  - [ ] The grouped header row displays the entry count badge and total summed duration (`HH:MM:SS` in JetBrains Mono `tabular-nums`).
  - [ ] Clicking the row / chevron expands an accordion revealing all individual `TimeLog` executions for inspection, inline time editing, or deletion.

#### [FR-5.2] Direct Click-to-Edit Time Range, Overlapping Logs & Live Start Adjustment
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Log Ergonomics`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `timer; inline-edit; ergonomics; phase-9`
- **Description:** Eliminate extra clicks when adjusting tracked times. Remove dedicated `"Edit"` buttons from log rows in favor of direct click-on-time inline editing, allow overlapping manual entries, and allow adjusting `startTimeUTC` on a live running timer.
- **Acceptance Criteria:**
  - [ ] Dedicated `"Edit"` action buttons are removed from `TimeLog` rows; clicking directly on a log's start/end time or duration opens inline `Start Time` and `Stop Time` inputs that recalculate `durationSeconds` on save.
  - [ ] Clicking the elapsed clock or start timestamp while an `ActiveTimer` is running allows backdating/adjusting `startTimeUTC` (e.g., *"started 15 minutes ago"*), immediately recalculating elapsed seconds.
  - [ ] Manual `TimeLog` creation permits entries whose `[startTime, endTime]` interval overlaps existing historical records without blocking validation.

#### [FR-5.3] Destructive Action Confirmation & Project Tag Renaming
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Catalog & Safety`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `catalog; tags; safety; modal; phase-9`
- **Description:** Protect users against accidental data loss with standardized confirmation dialogs on every delete action, and allow renaming existing `ProjectTag` items in the catalog.
- **Acceptance Criteria:**
  - [ ] Deleting any `TimeLog`, `Project`, `ProjectTag`, or `Task` (including cascading subtasks/sub-subtasks) opens a standardized confirmation dialog/popover before committing deletion.
  - [ ] Confirmation dialogs are keyboard-accessible (`Enter` confirms, `Esc` cancels, focus returns cleanly).
  - [ ] Users can edit/rename any existing `ProjectTag` inline or via dialog, updating the catalog entity and handling historical `tagNamesSnapshot` display/consistency cleanly.

#### [FR-5.4] Dashboard Multi-Dimension Slicing, 2-Level Grouping & Time Granularity
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Analytics Dashboard`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `analytics; dashboard; charts; pagination; phase-9`
- **Description:** Unlock full 4-dimension parity across both dashboard visualizations, add temporal bucketing to the histogram, and support 2-level hierarchical grouping with pagination in the breakdown table.
- **Acceptance Criteria:**
  - [ ] Both the Pizza (Donut) Chart and the Histogram (Stacked Bar) Chart support slicing/stacking by all 4 dimensions: `Project`, `Task`, `Tag`, and `Description`.
  - [ ] The Histogram chart provides a temporal granularity selector supporting `Day`, `Week`, `Month`, `Quarter`, and `Year` buckets respecting `UserPreferences.timeZone` and `weekStartsOn`.
  - [ ] The Dashboard breakdown table supports selecting a **Primary Group** and **Secondary Subgroup** across `Project`, `Task`, `Tag`, and `Description` (e.g., `Project → Tag` or `Tag → Description`).
  - [ ] The underlying filtered `TimeLog` table is paginated to render thousands of matching records smoothly.

#### [FR-5.5] Dedicated Multi-Select Filter Inputs with "Select All"
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Analytics Dashboard`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `analytics; filters; multi-select; phase-9`
- **Description:** Replace combined filter inputs on the Analytics Dashboard with four independent, searchable multi-select filter controls for precise slice-and-dice exploration.
- **Acceptance Criteria:**
  - [ ] Dashboard filter bar exposes 4 distinct multi-select dropdown inputs: `Project`, `Task`, `Tag`, and `Log Description`.
  - [ ] Each multi-select dropdown supports live search filtering within options plus a `"Select all"` action that toggles all options currently matching the search query.
  - [ ] Changing any filter immediately updates the Pizza chart, Histogram chart, and Breakdown table in unison.

#### [UX-1.1] User-Friendly Copy & Base Typography Scaling
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Copy & Accessibility`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `ux; typography; copywriting; i18n; phase-9`
- **Description:** Make Klox comfortable to read at standard `100%` desktop browser zoom and approachable for any end user by removing internal engineering jargon from user-facing UI and marketing copy (`en` and `pt-BR`).
- **Acceptance Criteria:**
  - [ ] Adjust base typography scale and spacing tokens so all text, tables, and telemetry controls read comfortably at `100%` display zoom (without requiring `110%` scaling).
  - [ ] Remove developer/architectural jargon (`Gemini`, `Domain-Driven Design / DDD`, `SHA-256`, `UTF-8 BOM`, `Nitro`, `Phase 2 Seam`) from UI labels, tooltips, onboarding, and landing copy, replacing them with clear, benefit-driven language in both `en` and `pt-BR`.
  - [ ] Architectural and internal engineering terminology remains documented exclusively in `README.md`, `GEMINI.md`, and `docs/adr/`.

#### [UX-1.2] Orbital Design System Evolution: Musk-Tech Aesthetics, Landing/Auth Redesign & Platform-Wide Consistency
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `UI Polish & Brand`
- **Phase:** `9`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `auth; design-system; landing; lovable; musk-tech; phase-9; spacex; starlink; support; ui-design`
- **Description:** Establish an overarching **Orbital "Musk-Tech" Design System** (documented in [ADR-0008](../adr/0008-orbital-musk-tech-design-system.md)) across Klox, inspired by SpaceX, Starlink, xAI (Grok), and orbital flight telemetry. While the landing page and authentication UI are the first components being updated using the Lovable benchmark sample, the design system defines the single source of truth for the entire platform to guarantee visual and typographic consistency across in-app tracker feeds, command bars, dashboards, catalog tables, and modals.
  - **Live Design Reference:** [Lovable Preview](https://id-preview--8692f9e9-340a-582f-ae00-1ede0103105e.lovable.app/?__lovable_receipt=mat_42jhw6tz9k91s8qve1jw7pfxc0#top)
  - **Two-Stage Rollout Strategy:**
    1. **Stage 1 (Sprint 3 / Phase 9 Foundation):** Implement core design tokens in `tailwind.config.ts` and `app/assets/css/tokens.css` (pure void canvas `#000000` / `#FAFAFA`, atmospheric blue signal `#3B82F6` / `#2563EB`, subtle hairline borders `rgba(255,255,255,0.08)`, and wide display typography). Redesign Landing Page (`/`, `/pt-br`) with atmospheric orbit hero (`klox-orbit.jpg`), live ticking mission clock (`T+ HH:MM:SS.ms`), 4 advantage instrument panels, and Free/Pro pricing grid. Redesign `/login` with centered `AuthPanel`, signal line, official Google `"G"` SVG button, and `contact@klox.dev` support channels.
    2. **Stage 2 (In-App Workspaces Alignment):** Extend orbital design tokens to `app/layouts/app.vue`, Command Timer Bar, and sticky mobile dock. Style Analytics Dashboard cards and 2-level grouping breakdown tables with telemetry panels. Standardize all confirmation dialogs, catalog forms, and keycap badges (`[N]`, `[S]`, `[Tab]`, `[?]`).
- **Acceptance Criteria:**
  - [ ] Implement atmospheric orbit hero with earth horizon background, live ticking mission clock (`T+ HH:MM:SS.ms`), and telemetry statistics strip.
  - [ ] Build the 4 interactive advantage instrument panels (Keyboard-First velocity sequence, Two-Tier Recall with scanline, Telemetry Donut/Bars, and Toggl CSV idempotent import).
  - [ ] Render Free vs Pro pricing cards with feature comparisons and clean CTA links (`Start Free → /login?mode=signup`).
  - [ ] Update `/login` with clean centered `AuthPanel`, official multi-color Google `"G"` button, and seamless mode toggle between Sign In and Sign Up.
  - [ ] Prominently surface `contact@klox.dev` in the footer, FAQ, and auth help.
  - [ ] Align in-app layout and telemetry design tokens so future sprint components follow the exact same visual hierarchy and palette.
  - [ ] Route all user-facing copy through `$t()` in `en` and `pt-BR`, preserving hybrid prerendering and Lighthouse performance ≥ 95.

---

### 4.3 Phase 10 — Keyboard Velocity, Auth, Profile & Feedback

#### [FR-6.1] Instant-Start Activity on `N` & Discard Empty Timer on Cancel/Stop
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Log Ergonomics`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `keyboard; timer; velocity; phase-10`
- **Description:** Reduce time-to-track to a single keystroke. Pressing `N` (when not editing an input) must immediately start a live timer and focus the description box so users start counting the exact second an activity begins, with zero penalty if they cancel an empty timer.
- **Acceptance Criteria:**
  - [ ] Pressing `N` (from non-editable global mode) focuses the Command Timer Bar description input AND immediately starts `ActiveTimer` (`startTimeUTC = now`) without requiring the user to click `Start` or press `Enter` first. (If a timer is already running, Single Active Timer invariant commits the previous timer first.)
  - [ ] Only the `Description` field is required to track an activity (`Project`, `Task`, and `Tags` remain optional and default cleanly to unassigned / blank).
  - [ ] Pressing `Esc` after typing a description blurs the description input / closes popovers while keeping the newly started timer running.
  - [ ] If an `ActiveTimer` is currently running with **empty `description` AND no non-default `projectId` selected** (`system_unassigned` / blank), pressing `Esc` or `S` stops and **discards** the timer cleanly without persisting an empty `TimeLog` to Firestore or `localStorage`.

#### [FR-6.2] Retroactive AI Auto-Fill on Historical TimeLogs
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `AI & Recall`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `ai-autofill; timelog; classification; phase-10`
- **Description:** Because fast capture (`FR-6.1`) lets users record activities with only a `Description`, users should be able to invoke AI Auto-Fill retroactively on persisted historical `TimeLog` entries to classify their `Project`, project-scoped `Tags`, and `Billable` flag later.
- **Acceptance Criteria:**
  - [ ] Historical `TimeLog` rows in the tracker feed that have a description and missing categorization (e.g., unassigned project / no tags) expose a `[✨ AI Auto-Fill]` action button.
  - [ ] Invoking retroactive AI Auto-Fill calls `/api/ai/autofill` with the log's description and current catalog, updates the persisted `TimeLog` in Firestore and `localStorage` with the validated `projectId`, `tagIds`, `isBillable`, and refreshed snapshots (`projectNameSnapshot`, `projectColorSnapshot`, `tagNamesSnapshot`), and updates the UI immediately.
  - [ ] Users can also inspect/adjust the predicted fields before or after saving.

#### [FR-6.3] VS Code-Style Customizable Keyboard Shortcuts & Resume Last Activity
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Keyboard & Shortcuts`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `keyboard; shortcuts; customization; resume-activity; settings; phase-10`
- **Description:** Provide a VS Code-inspired Keyboard Shortcuts editor in Settings allowing power users to inspect, search, customize, and reset every global shortcut in Klox, including a dedicated **`Resume Last Logged Activity`** command so users can restart their most recent activity with one keystroke.
- **Acceptance Criteria:**
  - [ ] Add a searchable Keyboard Shortcuts settings panel (modeled after VS Code's keybindings table) listing every Klox command ID, description, current keybinding pill, edit trigger, conflict warning badge, and reset button.
  - [ ] Interactive keystroke recorder captures single keys (`N`, `S`, `R`, etc.) and modifier combos (`Cmd/Ctrl+I`, `Shift+P`, etc.) when rebinding a command.
  - [ ] Conflict detection warns the user (or prevents silent shadowing) if a keybinding collides with another Klox command, with a one-click **"Reset to Default"** per command and **"Reset All Shortcuts"**.
  - [ ] Custom keymap overrides persist per user in `UserPreferences` (Firestore + `localStorage`) and are respected dynamically by global keyboard listeners (preserving the editable-element focus guard for single-key shortcuts) and reflected live in UI keycap badges and the `?` Help sheet.
  - [ ] Implement the **`Resume Last Logged Activity`** command (with default + customizable shortcut): finds the user's most recent `TimeLog`, populates `(description, projectId, taskId, tagIds, isBillable)`, and immediately starts a new `ActiveTimer` (committing any currently running timer first).
  - [ ] Also expose a quick UI button/action in the recent logs list / Command Timer Bar to trigger `Resume Last Logged Activity` or re-run any historical log.

#### [FR-6.4] Multi-Provider Authentication Linking (Google OAuth & Email/Password)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Authentication & Security`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `auth; google-oauth; account-linking; firebase; phase-10`
- **Description:** Remove the single-provider lock-in during sign-in/sign-up. A user must be able to authenticate with **either Google OAuth OR Email/Password** at any time for the same account—whether they originally registered via Google or via Email/Password.
- **Acceptance Criteria:**
  - [ ] Account Settings displays connected sign-in methods (`Google`, `Email/Password`) for the current `uid`.
  - [ ] A user who originally signed up with Google OAuth can set/link an Email/Password credential (`linkWithCredential` / `EmailAuthProvider`) inside Account Settings without creating a duplicate account.
  - [ ] A user who originally signed up with Email/Password can link their Google OAuth account (`linkWithPopup` / `GoogleAuthProvider`) under the exact same Firebase `uid` and `users/{uid}` Firestore tree.
  - [ ] When a user attempts to sign in at `/login` with Google for an email previously created with Password (or vice versa), handle `auth/account-exists-with-different-credential` cleanly and guide seamless credential verification & linking rather than failing cryptically.
  - [ ] Once both methods are linked, signing in via Google or Email/Password works interchangeably at any time and accesses the same user data.

#### [FR-6.5] Password Reset Flow with Email Confirmation
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Authentication & Security`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `auth; password-reset; email; phase-10`
- **Description:** Enable self-service password recovery for Email/Password users via Firebase Auth email confirmation links localized in `en` and `pt-BR`.
- **Acceptance Criteria:**
  - [ ] Add a `"Forgot password?"` link/view on `/login` allowing users to submit their email address and trigger Firebase `sendPasswordResetEmail`.
  - [ ] Follow Firebase Auth `languageCode` (`en` / `pt-BR`) so confirmation reset emails match the user's selected locale.
  - [ ] Display non-enumerating confirmation feedback (confirming the reset instructions were sent without leaking whether an email is registered).
  - [ ] Completing the email confirmation link resets the password cleanly and allows immediate sign-in on `/login`.

#### [FR-6.6] User Profile Management & Time-Tracking Activity Heatmap
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Profile & Telemetry`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `profile; avatar; heatmap; analytics; phase-10`
- **Description:** Introduce a User Profile page/section where users manage their identity (Display Name and Profile Picture, automatically synced from Google OAuth when available) and inspect a visual year-at-a-glance Time-Tracking Activity Heatmap.
- **Acceptance Criteria:**
  - [ ] Users can edit and persist their `displayName` across Firebase Auth profile and Firestore `users/{uid}`.
  - [ ] Users can upload or update a custom profile picture (validated size/type, stored safely and displayed in the app header/profile card).
  - [ ] Accounts authenticated via Google OAuth automatically default to their Google `photoURL` unless the user uploads a custom avatar override.
  - [ ] Render a GitHub-style daily contribution heatmap showing total tracked duration per `dateKey` (in `UserPreferences.timeZone`) with color intensity buckets and hover tooltips showing exact date and `HH:MM:SS` tracked.

#### [FR-6.7] In-App Feedback Submission & My Feedback Management
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Feedback & Community`
- **Phase:** `10`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `feedback; firestore; email; modal; phase-10`
- **Description:** Build an in-app Feedback feature accessible from the workspace header and `?` Help sheet. Users can submit categorized feedback (persisted in Firestore with auto-captured diagnostic context), receive an automatic email dispatch to `contact@klox.dev` on initial submission, and revisit their feedback history to edit or delete entries. Designed with an extensible schema to evolve into a public voting portal (`FR-V6`).
- **Acceptance Criteria:**
  - [ ] Expose a `[Feedback]` trigger button in the authenticated app navigation and inside the `?` Help / Command Sheet.
  - [ ] Feedback modal captures **Category** (`Bug`, `Feature Request`, `General`) and **Message** (with optional title/summary), and automatically attaches non-sensitive context metadata (`route`, `locale`, `appVersion`, `isDemoMode`).
  - [ ] Submitted feedback persists to Firestore (strictly owner-scoped in `firestore.rules` with validation bounds, and `localStorage` fallback in Demo Mode) including an `emailSentAt` / `initialNotified` marker.
  - [ ] Users can view a **"My Feedback"** list inside the feedback modal/page to **edit** the category/message or **delete** their previously submitted items.
  - [ ] A Nitro server endpoint forwards the feedback notification email to `contact@klox.dev` **only when a feedback item is first created**; subsequent edits update Firestore without re-sending duplicate emails.

---

### 4.4 Post-POC, Pro Plan & Vision

#### [FR-V1] Azure DevOps Work Item Sync (`CompletedWork`)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Integrations`
- **Phase:** `Future (Phase 2 Vision)`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `2 - High`
- **Plan Tier:** `Pro`
- **Tags:** `azure-devops; sync; human-in-the-loop; ai; pro`
- **Description:** Deliver Klox's flagship engineering integration: link Klox `Task` / `Subtask` entities to Azure DevOps Work Items, review AI-consolidated accumulated hours with Human-in-the-Loop approval, and push updates to `Microsoft.VSTS.Scheduling.CompletedWork` (or create new ADO Work Items for unplanned tasks).
- **Acceptance Criteria:**
  - [ ] OAuth / PAT connection setup to an Azure DevOps organization and project stored securely on the backend.
  - [ ] Two-way linking of `Task.externalWorkItemId` with live ADO Work Item search and title/state sync.
  - [ ] Human-in-the-Loop review modal calculating incremental hours from unsynced `TimeLog`s before writing `CompletedWork` to Azure DevOps.
  - [ ] Option to create a new Azure DevOps Work Item directly from an unplanned Klox `Task` and link its resulting ID.

#### [FR-V2] Personal Mastery Goals (`targetHours` Progress Tracking)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Execution & Goals`
- **Phase:** `Future (Phase 2 Vision)`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Pro`
- **Tags:** `goals; personal-mastery; telemetry; pro`
- **Description:** Turn `Task.targetHours` into an actionable Personal Mastery goal tracker for studies, workouts, reading, and deep-work cadences.
- **Acceptance Criteria:**
  - [ ] Display live progress bars (`completedWorkHours / targetHours`) rolled up across hierarchical Tasks, Subtasks, and Sub-subtasks.
  - [ ] Support weekly and monthly recurring target cadences with pacing indicators ("on track" vs. "behind target").

#### [FR-V3] Pro Plan Billing & Subscription Management
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Monetization`
- **Phase:** `Future (Phase 2 Vision)`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `2 - High`
- **Plan Tier:** `Pro`
- **Tags:** `billing; stripe; pro-plan; monetization`
- **Description:** Replace the landing page's non-interactive Pro tier placeholder with real subscription checkout, webhook state synchronization, and entitlement gating (`plan: 'free' | 'pro'`).
- **Acceptance Criteria:**
  - [ ] Checkout and customer billing portal integration (e.g., Stripe) supporting monthly/annual billing in BRL and USD.
  - [ ] Server-verified webhook updates user entitlement claims cleanly so Pro features (`FR-V1`, `FR-V4`, `FR-V5`, feedback boost `FR-V6`) unlock instantaneously.

#### [FR-V4] Pause & Resume Activity with Distraction Telemetry & Shortcuts
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Telemetry`
- **Phase:** `Future (Pro Plan)`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `2 - High`
- **Plan Tier:** `Pro`
- **Tags:** `pro; timer; pause-resume; distractions; shortcuts; analytics`
- **Description:** Pro-plan execution telemetry feature allowing users to pause and resume an active timer when interrupted—using either Command Timer Bar controls or customizable keyboard shortcuts—while measuring exactly how often and how long distractions occur.
- **Acceptance Criteria:**
  - [ ] Pro users can **Pause** a running `ActiveTimer` and **Resume** it later without splitting the underlying activity or losing prior elapsed active seconds.
  - [ ] Expose Pause and Resume actions via both the Command Timer Bar UI and customizable keyboard shortcuts integrated with `FR-6.3`.
  - [ ] Track each pause interval (`pausedAtUTC`, `resumedAtUTC`) on the active/persisted execution so total active duration excludes paused intervals while storing distraction metrics (`pauseCount`, `totalPausedSeconds`, `pauseIntervals[]`).
  - [ ] Analytics Dashboard displays pause/distraction metrics (total distraction count, total paused duration, focus efficiency ratio, and per-day/per-project distraction breakdown).
  - [ ] Non-Pro users see a clean Pro upgrade prompt if attempting to invoke Pro-gated pause/distraction telemetry.

#### [FR-V5] Pomodoro Focus Mode
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Focus`
- **Phase:** `Future (Pro Plan)`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `4 - Low`
- **Plan Tier:** `Pro`
- **Tags:** `pro; pomodoro; focus; timer`
- **Description:** Optional Pomodoro cadence overlay for Pro users to run structured focus sprints (e.g., 25m focus / 5m break) integrated directly with Klox `ActiveTimer` and distraction tracking.
- **Acceptance Criteria:**
  - [ ] Configurable focus duration, short break, and long break intervals in Settings/Command Bar.
  - [ ] Visual countdown ring/bar and optional subtle audio/browser notification at interval transitions while committing clean `TimeLog`s.

#### [FR-V6] Public Feedback Portal with Voting, Status Tracking, Comments & Pro Prioritization
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Feedback & Community`
- **Phase:** `Future`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free + Pro`
- **Tags:** `feedback; portal; voting; roadmap; pro-priority`
- **Description:** Evolve `FR-6.7` (In-App Feedback) into a public interactive Feedback & Feature Voting Portal where the community can browse feature requests, upvote, discuss in comments, follow status changes, and give **Pro members** higher ranking weight.
- **Acceptance Criteria:**
  - [ ] Public/authenticated feedback board displaying opt-in feature requests categorized by tag and status (`Under Review`, `Planned`, `In Progress`, `Shipped`).
  - [ ] Authenticated users can upvote/unvote items (one vote per user per item) and post/delete comments.
  - [ ] Feedback ranking algorithm applies a deterministic priority boost / weight for submissions and votes from **Pro plan** members.

#### [BL-1] Automated Test Expansion (Playwright E2E, Firestore Rules Emulator, i18n CI Check)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Engineering & QA`
- **Phase:** `Next (Post-POC QA)`
- **Status (ADO State):** `Next` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Internal`
- **Tags:** `testing; playwright; firestore-rules; ci; adr-0006`
- **Description:** Expand beyond the lean POC Vitest unit test baseline (`ADR-0006`) by adding end-to-end browser coverage, automated Firestore security rules verification, and i18n key parity checks in CI.
- **Acceptance Criteria:**
  - [ ] Playwright E2E suite covering landing prerender, demo mode command flow (`N` → `Tab` → `Enter` → `S`), catalog invariants, and Toggl CSV round-trip.
  - [ ] Firebase Firestore Emulator test suite verifying owner-only tenant isolation (`users/{uid}`) and schema validation in `firestore.rules`.
  - [ ] Automated CI check verifying `en.ts` and `pt-BR.ts` key parity and clean `pnpm typecheck && pnpm test && pnpm build`.

#### [BL-2] "What's New" Tours Triggered by `onboarding.version`
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Onboarding`
- **Phase:** `Future`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `4 - Low`
- **Plan Tier:** `Free`
- **Tags:** `onboarding; changelog; spotlight-tour`
- **Description:** Leverage the existing `OnboardingState.version` field to highlight major new features to returning users with concise, dismissible contextual spotlights upon version bumps.
- **Acceptance Criteria:**
  - [ ] Comparing `user.onboarding.version < CURRENT_APP_ONBOARDING_VERSION` surfaces a compact "What's New" modal or spotlight walkthrough without re-triggering the full first-time wizard.

#### [BL-3] Privacy-Respecting Onboarding Funnel & Product Analytics
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Analytics`
- **Phase:** `Future`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `4 - Low`
- **Plan Tier:** `Internal`
- **Tags:** `telemetry; domain-events; product-analytics`
- **Description:** Subscribe to Klox's typed `DomainEvent` bus (`ADR D10`) with an opt-in, privacy-respecting analytics adapter to measure onboarding completion and feature adoption without storing PII.
- **Acceptance Criteria:**
  - [ ] Aggregates anonymous funnel metrics (wizard completion, tour completion, AI Auto-Fill usage, CSV import completion) via `subscribeDomainEvents` with zero third-party ad trackers.

#### [BL-4] Additional Locales (`es` Spanish & Community Locales) + TMS
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Internationalization`
- **Phase:** `Future`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `4 - Low`
- **Plan Tier:** `Free`
- **Tags:** `i18n; locales; spanish`
- **Description:** Expand international reach beyond `en` and `pt-BR` starting with Spanish (`es`) and integrating a translation management workflow (e.g., Crowdin / Lokalise).
- **Acceptance Criteria:**
  - [ ] Add strongly-typed `i18n/locales/es.ts` implementing `LocaleMessages` and register `es` in `nuxt.config.ts` and `UserPreferences` locale selector with zero application code changes.

#### [BL-5] Batch Tool to Recalculate Historical `dateKey` on Timezone Change
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Data & Timezone`
- **Phase:** `Future`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `4 - Low`
- **Plan Tier:** `Free`
- **Tags:** `timezone; migration; timelogs`
- **Description:** Provide an optional migration utility in Settings allowing users who move across timezones to recalculate historical `TimeLog.dateKey` and `timeZone` fields retroactively.
- **Acceptance Criteria:**
  - [ ] Preview shows how many historical logs would shift calendar day under the new IANA timezone before executing batched Firestore updates (`writeBatch`).

#### [BL-6] Optional Batch Propagation of Project Rename to `projectNameSnapshot`
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Catalog & Data`
- **Phase:** `Future`
- **Status (ADO State):** `Later` (`New`)
- **Priority:** `4 - Low`
- **Plan Tier:** `Free`
- **Tags:** `catalog; projects; snapshots; migration`
- **Description:** When a user renames an existing `Project`, offer an optional background/batched operation to update historical `TimeLog.projectNameSnapshot` values across past records.
- **Acceptance Criteria:**
  - [ ] Project rename dialog includes an optional checkbox *"Also update project name on historical time logs"* powered by batched Firestore updates.