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
| **NFR-1.2** | Product Backlog Item | High-Volume Toggl CSV Import Optimization & Filterable Preview Table | Performance & Scale | 2 - High | Free | Done |
| **FR-5.1** | Product Backlog Item | Same-Day Log Grouping & Expandable Accordion | Timer & Log Ergonomics | 2 - High | Free | Done |
| **FR-5.2** | Product Backlog Item | Direct Click-to-Edit Time Range, Overlapping Logs & Live Start Adjustment | Timer & Log Ergonomics | 2 - High | Free | Done |
| **FR-5.3** | Product Backlog Item | Destructive Action Confirmation & Project Tag Renaming | Catalog & Safety | 2 - High | Free | Done |
| **FR-5.4** | Product Backlog Item | Dashboard Multi-Dimension Slicing, 2-Level Grouping & Time Granularity | Analytics Dashboard | 2 - High | Free | Done |
| **FR-5.5** | Product Backlog Item | Dedicated Multi-Select Filter Inputs with "Select All" | Analytics Dashboard | 3 - Medium | Free | Done |
| **UX-1.1** | Product Backlog Item | User-Friendly Copy & Base Typography Scaling | Copy & Accessibility | 3 - Medium | Free | Done |
| **UX-1.2** | Product Backlog Item | Orbital Design System Evolution: Musk-Tech Aesthetics, Landing/Auth Redesign & Platform-Wide Consistency | UI Polish & Brand | 3 - Medium | Free | Done |
| **UX-2.1** | Product Backlog Item | Brand Logo Tracking, Typography Unification, Favicon & Dynamic Tab Title (`AB#72`) | UI Polish & Brand | 2 - High | Free | Done |
| **UX-2.2** | Product Backlog Item | Landing Page Kinetic Experience & Site-Wide Orbital Motion (`AB#73`) | UI Polish & Motion | 2 - High | Free | Done |
| **UX-2.3** | Product Backlog Item | Collapsible Orbital Sidebar Navigation & Settings-Only Theme/Language (`AB#74`) | Navigation & Minimalism | 2 - High | Free | Done |
| **UX-2.4** | Product Backlog Item | Minimalist Borderless Command Timer Bar & Tracker Feed Noise Reduction (`AB#75`) | Timer & Feed Minimalism | 2 - High | Free | In Progress |

### 3.2 Phase 10 — Keyboard Velocity, Auth, Profile & Feedback (`Next`)

Focused on zero-friction activity capture, customizable keyboard ergonomics, seamless multi-provider auth, user profile insights, and closed-loop user feedback.

| ID | Work Item Type | Title | Area | Priority | Plan | Status |
|---|---|---|---|---|---|---|
| **FR-6.1** | Product Backlog Item | Instant-Start Activity on `N` & Discard Empty Timer on Cancel/Stop | Timer & Log Ergonomics | 2 - High | Free | Done |
| **FR-6.2** | Product Backlog Item | Retroactive AI Auto-Fill on Historical TimeLogs | AI & Recall | 3 - Medium | Free | Next |
| **FR-6.3** | Product Backlog Item | VS Code-Style Customizable Keyboard Shortcuts & Resume Last Activity | Keyboard & Shortcuts | 2 - High | Free | Done |
| **FR-6.4** | Product Backlog Item | Multi-Provider Authentication Linking (Google OAuth & Email/Password) | Authentication & Security | 2 - High | Free | Done |
| **FR-6.5** | Product Backlog Item | Password Reset Flow with Email Confirmation | Authentication & Security | 2 - High | Free | Next |
| **FR-6.6** | Product Backlog Item | User Profile Management & Time-Tracking Activity Heatmap | Profile & Telemetry | 3 - Medium | Free | Done |
| **FR-6.7** | Product Backlog Item | In-App Feedback Submission & My Feedback Management | Feedback & Community | 2 - High | Free | Next |

### 3.3 Post-POC, Pro Plan & Vision (`Later` / Engineering `Next`)

| ID | Work Item Type | Title | Area | Priority | Plan | Status |
|---|---|---|---|---|---|---|
| **FR-V1** | Product Backlog Item | Azure DevOps Work Item Sync (`CompletedWork`) (`AB#31`) | Integrations | 2 - High | Pro (Early Access) | Done |
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
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `csv; toggl; performance; table; phase-9`
- **Description:** Tune memory allocation, SHA-256 hashing, reactive store updates, and Firestore `writeBatch` ingestion so multi-year Toggl Track CSVs with thousands of rows import without blocking the main UI thread. Upgrade the preview table for large datasets with pagination, per-column filtering, and row import status badges.
- **Acceptance Criteria:**
  - [x] Preview parsing and batch Firestore commits (`writeBatch`) handle 3,000+ CSV rows smoothly without freezing the browser tab or starving UI rendering.
  - [x] Replace the static preview table with a paginated data table component (evaluating specialized table primitives) that supports per-column filtering.
  - [x] Every preview row displays a clear status badge distinguishing already-existing records (`Imported`) from new records (`Pending` / `Ready to Import`).

#### [FR-5.1] Same-Day Log Grouping & Expandable Accordion
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Log Ergonomics`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `tracker; grouping; accordion; ux; phase-9`
- **Description:** Reduce visual clutter in the daily tracker feed by automatically collapsing multiple `TimeLog` records created on the same day with identical metadata into a single expandable summary row.
- **Acceptance Criteria:**
  - [x] Within each day bucket (`dateKey`), entries sharing identical `(normalizedDescription, projectId, taskId, tagIds)` automatically group into one summary row.
  - [x] The grouped header row displays the entry count badge and total summed duration (`HH:MM:SS` in JetBrains Mono `tabular-nums`).
  - [x] Clicking the row / chevron expands an accordion revealing all individual `TimeLog` executions for inspection, inline time editing, or deletion.

#### [FR-5.2] Direct Click-to-Edit Time Range, Toggl-Style Activity Inline Editing, Overlapping Logs & Live Start Adjustment
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Log Ergonomics`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `timer; inline-edit; multiselect; billable; ergonomics; phase-9`
- **Description:** Eliminate extra clicks when adjusting tracked activities. Enable Toggl Track-style inline editing across every `TimeLog` property (`Start Time` / `Stop Time`, `Description`, `Project` / `Task`, searchable `Tag` multiselect, and hover-reveal `Billable` toggle) on both individual rows and collapsed same-day summary groups, replace raw browser checkboxes and inline tag walls across forms with `reka-ui` Orbital components ([ADR-0009](../adr/0009-headless-ui-primitives-reka-ui.md)), allow overlapping manual entries, and allow adjusting `startTimeUTC` on a live running timer.
- **Acceptance Criteria:**
  - [x] Dedicated `"Edit"` action buttons are removed from `TimeLog` rows; every `TimeLog` property (`Date`, `Start Time` / `Stop Time`, `Description`, `Project` / `Task`, `Tags`, and `Billable`) is directly editable inline on individual rows and bulk-editable on collapsed same-day grouped summary rows, with the `Date` field inside the Time Range popover supporting both normal keyboard date typing and an interactive calendar picker.
  - [x] Hovering over a non-billable log reveals the `$` billable icon for 1-click toggling, and all billable toggles across Klox (`CommandTimerBar`, Manual Time Log form, Catalog project defaults, and Tracker rows) use a polished Orbital switch/icon component instead of raw `<input type="checkbox">` controls.
  - [x] Both creating (`CommandTimerBar` & Manual Time Log form) and editing a `TimeLog` render Project-Scoped Tags inside a collision-aware searchable multiselect popover (with `"Select all"` / `"Clear"` and a hover-reveal `Tag` icon on untagged rows) rather than dumping all tags directly into the form.
  - [x] Clicking the elapsed clock or start timestamp while an `ActiveTimer` is running allows backdating/adjusting `startTimeUTC` (e.g., *"started 15 minutes ago"*), immediately recalculating elapsed seconds.
  - [x] Manual `TimeLog` creation permits entries whose `[startTime, endTime]` interval overlaps existing historical records without blocking validation.

#### [FR-5.3] Destructive Action Confirmation & Project Tag Renaming
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Catalog & Safety`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `catalog; tags; safety; modal; phase-9`
- **Description:** Protect users against accidental data loss with standardized confirmation dialogs on every delete action, and allow renaming existing `ProjectTag` items in the catalog while resolving tags by `tagId` on display, aggregation, and export ([ADR-0010](../adr/0010-tag-id-references-without-snapshots.md)).
- **Acceptance Criteria:**
  - [x] Deleting any `TimeLog`, `Project`, `ProjectTag`, or `Task` (including cascading subtasks/sub-subtasks) opens a standardized confirmation dialog/popover before committing deletion.
  - [x] Confirmation dialogs are keyboard-accessible (`Enter` confirms, `Esc` cancels, focus returns cleanly).
  - [x] Users can edit/rename any existing `ProjectTag` inline in the catalog, updating only the catalog entity while historical `TimeLog` entries reference `tagIds` and resolve live tag names on display, analytics aggregation, and Toggl CSV export without `tagNamesSnapshot` mutations ([ADR-0010](../adr/0010-tag-id-references-without-snapshots.md)).

#### [FR-5.4] Dashboard Multi-Dimension Slicing, 2-Level Grouping & Time Granularity
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Analytics Dashboard`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `analytics; dashboard; charts; pagination; phase-9`
- **Description:** Unlock full 4-dimension parity across both dashboard visualizations, add temporal bucketing to the histogram, and support 2-level hierarchical grouping with pagination in the breakdown table.
- **Acceptance Criteria:**
  - [x] Both the Pizza (Donut) Chart and the Histogram (Stacked Bar) Chart support slicing/stacking by all 4 dimensions: `Project`, `Task`, `Tag`, and `Description`.
  - [x] The Histogram chart provides a temporal granularity selector supporting `Day`, `Week`, `Month`, `Quarter`, and `Year` buckets respecting `UserPreferences.timeZone` and `weekStartsOn`.
  - [x] The Dashboard breakdown table supports selecting a **Primary Group** and **Secondary Subgroup** across `Project`, `Task`, `Tag`, and `Description` (e.g., `Project → Tag` or `Tag → Description`).
  - [x] The underlying filtered `TimeLog` table is paginated to render thousands of matching records smoothly.

#### [FR-5.5] Dedicated Multi-Select Filter Inputs with "Select All"
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Analytics Dashboard`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `analytics; filters; multi-select; phase-9`
- **Description:** Replace combined filter inputs on the Analytics Dashboard with four independent, searchable multi-select filter controls for precise slice-and-dice exploration.
- **Acceptance Criteria:**
  - [x] Dashboard filter bar exposes 4 distinct multi-select dropdown inputs: `Project`, `Task`, `Tag`, and `Log Description`.
  - [x] Each multi-select dropdown supports live search filtering within options plus a `"Select all"` action that toggles all options currently matching the search query.
  - [x] Changing any filter immediately updates the Pizza chart, Histogram chart, and Breakdown table in unison.

#### [UX-1.1] User-Friendly Copy & Base Typography Scaling
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Copy & Accessibility`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `ux; typography; copywriting; i18n; phase-9`
- **Description:** Make Klox comfortable to read at standard `100%` desktop browser zoom and approachable for any end user by removing internal engineering jargon from user-facing UI and marketing copy (`en` and `pt-BR`).
- **Acceptance Criteria:**
  - [x] Adjust base typography scale and spacing tokens so all text, tables, and telemetry controls read comfortably at `100%` display zoom (zero `text-[9px]`/`text-[10px]`/`text-[11px]` utility classes in `.vue` files verified via audit; live 100%-zoom visual review recommended).
  - [x] Remove developer/architectural jargon (`Gemini`, `Domain-Driven Design / DDD`, `SHA-256`, `UTF-8 BOM`, `Nitro`, `Phase 2 Seam`) from UI labels, tooltips, onboarding, and landing copy, replacing them with clear, benefit-driven language in both `en` and `pt-BR`.
  - [x] Architectural and internal engineering terminology remains documented exclusively in `README.md`, `GEMINI.md`, and `docs/adr/`.

#### [UX-1.2] Orbital Design System Evolution: Musk-Tech Aesthetics, Landing/Auth Redesign & Platform-Wide Consistency
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `UI Polish & Brand`
- **Phase:** `9`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `auth; design-system; landing; lovable; musk-tech; phase-9; spacex; starlink; support; ui-design`
- **Description:** Establish an overarching **Orbital "Musk-Tech" Design System** (documented in [ADR-0008](../adr/0008-orbital-musk-tech-design-system.md)) across Klox, inspired by SpaceX, Starlink, xAI (Grok), and orbital flight telemetry. While the landing page and authentication UI are the first components being updated using the Lovable benchmark sample, the design system defines the single source of truth for the entire platform to guarantee visual and typographic consistency across in-app tracker feeds, command bars, dashboards, catalog tables, and modals.
  - **Live Design Reference:** [Lovable Preview](https://id-preview--8692f9e9-340a-582f-ae00-1ede0103105e.lovable.app/?__lovable_receipt=mat_42jhw6tz9k91s8qve1jw7pfxc0#top)
  - **Two-Stage Rollout Strategy:**
    1. **Stage 1 (Sprint 3 / Phase 9 Foundation):** Implement core design tokens in `tailwind.config.ts` and `app/assets/css/tokens.css` (pure void canvas `#000000` / `#FAFAFA`, atmospheric blue signal `#3B82F6` / `#2563EB`, subtle hairline borders `rgba(255,255,255,0.08)`, and wide display typography). Redesign Landing Page (`/`, `/pt-br`) with atmospheric orbit hero (`klox-orbit.jpg`), live ticking mission clock (`T+ HH:MM:SS.ms`), 4 advantage instrument panels, and Free/Pro pricing grid. Redesign `/login` with centered `AuthPanel`, signal line, official Google `"G"` SVG button, and `contact@klox.dev` support channels.
    2. **Stage 2 (In-App Workspaces Alignment):** Extend orbital design tokens to `app/layouts/app.vue`, Command Timer Bar, and sticky mobile dock. Style Analytics Dashboard cards and 2-level grouping breakdown tables with telemetry panels. Standardize all confirmation dialogs, catalog forms, and keycap badges (`[N]`, `[S]`, `[Tab]`, `[?]`).
- **Acceptance Criteria:**
  - [x] Implement atmospheric orbit hero with earth horizon background, live ticking mission clock (`T+ HH:MM:SS.ms`), and telemetry statistics strip.
  - [x] Build the 4 interactive advantage instrument panels (Keyboard-First velocity sequence, Two-Tier Recall with scanline, Telemetry Donut/Bars, and Toggl CSV import/export preview).
  - [x] Render Free vs Pro pricing cards with feature comparisons and clean CTA links (`Start tracking free → /login?mode=signup`).
  - [x] Update `/login` with clean centered `AuthPanel`, official multi-color Google `"G"` button, and seamless mode toggle between Sign In and Sign Up.
  - [x] Prominently surface `contact@klox.dev` in the footer, FAQ, auth panel, and in-app help sheet.
  - [x] Align in-app layout and telemetry design tokens so future sprint components follow the exact same visual hierarchy and palette.
  - [x] Route all user-facing copy through `$t()` in `en` and `pt-BR`, preserving hybrid prerendering (`fetchpriority="high"` and zero Firebase SDK on prerendered routes verified via `pnpm build`; Lighthouse mobile ≥ 95 pending live Chromium audit).

#### [UX-2.1] Brand Logo Tracking, Typography Unification, Favicon & Dynamic Tab Title (`AB#72`)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `UI Polish & Brand`
- **Phase:** `Sprint 4 / Phase 10`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `branding; design-system; favicon; phase-10; tab-title; typography; ux`
- **Acceptance Criteria:**
  - [x] Move `.display-wide`, `.tabular-telemetry`, and `.label-eyebrow` into `@layer components` in `app/assets/css/tokens.css` so Tailwind `tracking-*` utilities override `.display-wide` properly; widen `KloxLogo` (`0.42em` orbital / `0.32em` reticle) with baseline dot alignment and compact `K▪` rail variant.
  - [x] Restrict `JetBrains Mono` strictly to `KeycapBadge` and technical code/CSV blocks; render UI text, dates, timers, and durations in `Geist` (`tabular-nums`) and titles/KPI totals in `Michroma`.
  - [x] Register `/images/klox-favicon.png` (`icon` and `apple-touch-icon`) in `nuxt.config.ts`.
  - [x] Add `formatDynamicTabTitle` / `formatIdleTabTitle` (`app/domain/duration.ts`) + `useDynamicTabTitle` (`app/composables/useDynamicTabTitle.ts`) wired into `app/layouts/app.vue` with unit tests in `tests/unit/domain.spec.ts`.

#### [UX-2.2] Landing Page Kinetic Experience & Site-Wide Orbital Motion (`AB#73`)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `UI Polish & Motion`
- **Phase:** `Sprint 4 / Phase 10`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `animations; landing; motion; phase-10; scroll-reveal; telemetry; ux`
- **Acceptance Criteria:**
  - [x] Add zero-CLS `BrandTypewriterHeadline.vue` with `sr-only` static `<h1>` and `prefers-reduced-motion` / `paused` static fallback.
  - [x] Implement bi-directional scroll entry & exit reveals (`useScrollReveal.ts` + `tokens.css`) using native CSS Scroll-Driven Animations (`animation-timeline: view()`) and a feature-detected `IntersectionObserver` fallback.
  - [x] Upgrade `TelemetryVisual.vue` with interactive project chips, total hours readout, and infinite choreographed filter loop, plus sequential pipeline animation on `CsvVisual.vue` (`:paused`-aware).
  - [x] Add compositor-only `orbital-page` transitions, trigger-anchored `reka-ui` popover/dialog animations, smooth `reka-ui` + native `::details-content` accordions, and tactile button press states.

#### [UX-2.3] Collapsible Orbital Sidebar Navigation & Settings-Only Theme/Language (`AB#74`)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Navigation & Minimalism`
- **Phase:** `Sprint 4 / Phase 10`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `minimalism; mobile; navigation; phase-10; settings; sidebar; ux`
- **Acceptance Criteria:**
  - [x] Desktop (`>= 768px`) displays a 3-state collapsible sidebar (`Expanded 240px`, `Collapsed Rail 64px` with `reka-ui` tooltips, `Hidden 0px` with floating reopen button), persisted in `localStorage` (`klox_sidebar_state`) and toggled via `Cmd/Ctrl + \`.
  - [x] Mobile (`< 768px`) renders a single-row `48px` top header with drawer trigger, centered `KloxLogo`, and Help (`?`) trigger opening an accessible modal slide-over `reka-ui` `Dialog` drawer cleanly above the mobile timer dock.
  - [x] Theme switching (`Dark` / `Light` / `System`) lives exclusively in `/app/settings` and is removed from all app, landing, and auth headers.
  - [x] In-app language selection lives exclusively in `/app/settings`; Landing (`/`, `/pt-br`) and Auth (`/login`) retain a minimal `Globe` locale switcher; Sign Out renders as an icon-only control with `aria-label` and tooltip.

#### [UX-2.4] Minimalist Borderless Command Timer Bar & Tracker Feed Noise Reduction (`AB#75`)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Feed Minimalism`
- **Phase:** `Sprint 4 / Phase 10`
- **Status (ADO State):** `In Progress` (`Committed`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `command-bar; icons; minimalism; phase-10; toggl-ergonomics; tracker-feed; ux`
- **Acceptance Criteria:**
  - [ ] `CommandTimerBar` renders as a borderless single-row desktop strip (and compact 2-row mobile dock) with no `TRACKING LIVE` header, no redundant shortcut badges, and no `[✨ AI Auto-Fill]` button (`⌘I`/`Ctrl+I` runs with sweeping top `.signal-line` scan feedback and `SpotlightTour` Step 4 targets `timer-description`).
  - [ ] Description input, `ProjectTaskPopover` (`variant="command"`), icon-triggered `TagMultiSelect` (`variant="command-icon"`), icon-only `BillableToggle`, modernized `BrandTimerDigits`, and icon-only `Play`/`Square` trigger render cleanly without heavy form borders.
  - [ ] Manual Entry toggle is icon-only (`Plus`); day headers omit `"Subtotal: "` and reveal entry count subtly only on desktop hover/focus (omitted on mobile).
  - [ ] Continue (`Play`) and Delete (`Trash2`) row actions use the unified `.row-action-ghost` hover/focus/touch reveal pattern matching `BillableToggle` and `TagMultiSelect`.
  - [ ] Tags never auto-prepend `#` across feed rows, pickers, analytics charts/tables, catalog confirmations, CSV import previews, landing visuals, or unit tests.

---

### 4.3 Phase 10 — Keyboard Velocity, Auth, Profile & Feedback

#### [FR-6.1] Instant-Start Activity on `N` & Discard Empty Timer on Cancel/Stop
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Timer & Log Ergonomics`
- **Phase:** `10`
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `keyboard; timer; velocity; phase-10`
- **Description:** Reduce time-to-track to a single keystroke. Pressing `N` (when not editing an input) must immediately start a live timer and focus the description box so users start counting the exact second an activity begins, with zero penalty if they cancel an empty timer. ([ADR-0011](../adr/0011-customizable-keyboard-shortcuts-and-instant-timer.md))
- **Acceptance Criteria:**
  - [x] Pressing `N` (from non-editable global mode) focuses the Command Timer Bar description input AND immediately starts `ActiveTimer` (`startTimeUTC = now`) without requiring the user to click `Start` or press `Enter` first. (If a timer is already running, Single Active Timer invariant commits the previous timer first.)
  - [x] Only the `Description` field is required to track an activity (`Project`, `Task`, and `Tags` remain optional and default cleanly to unassigned / blank).
  - [x] Pressing `Esc` after typing a description blurs the description input / closes popovers while keeping the newly started timer running.
  - [x] If an `ActiveTimer` is currently running with **empty `description` AND no non-default `projectId` selected** (`system_unassigned` / blank), pressing `Esc` or `S` stops and **discards** the timer cleanly without persisting an empty `TimeLog` to Firestore or `localStorage`.

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
- **Status (ADO State):** `Done` (`Done`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `keyboard; shortcuts; customization; resume-activity; settings; phase-10`
- **Description:** Provide a VS Code-inspired Keyboard Shortcuts editor in Settings allowing power users to inspect, search, customize, and reset every global shortcut in Klox, including a dedicated **`Resume Last Logged Activity`** command so users can restart their most recent activity with one keystroke. ([ADR-0011](../adr/0011-customizable-keyboard-shortcuts-and-instant-timer.md))
- **Acceptance Criteria:**
  - [x] Add a searchable Keyboard Shortcuts settings panel (modeled after VS Code's keybindings table) listing every Klox command ID, description, current keybinding pill, edit trigger, conflict warning badge, and reset button.
  - [x] Interactive keystroke recorder captures single keys (`N`, `S`, `R`, etc.) and modifier combos (`Cmd/Ctrl+I`, `Shift+P`, etc.) when rebinding a command.
  - [x] Conflict detection warns the user (or prevents silent shadowing) if a keybinding collides with another Klox command, with a one-click **"Reset to Default"** per command and **"Reset All Shortcuts"**.
  - [x] Custom keymap overrides persist per user in `UserPreferences` (Firestore + `localStorage`) and are respected dynamically by global keyboard listeners (preserving the editable-element focus guard for single-key shortcuts) and reflected live in UI keycap badges and the `?` Help sheet.
  - [x] Implement the **`Resume Last Logged Activity`** command (with default + customizable shortcut): finds the user's most recent `TimeLog`, populates `(description, projectId, taskId, tagIds, isBillable)`, and immediately starts a new `ActiveTimer` (committing any currently running timer first).
  - [x] Also expose a quick UI button/action in the recent logs list / Command Timer Bar to trigger `Resume Last Logged Activity` or re-run any historical log.

#### [FR-6.4] Multi-Provider Authentication Linking (Google OAuth & Email/Password)
- **Work Item Type:** `Product Backlog Item` (`AB#27`)
- **Area / Category:** `Authentication & Security`
- **Phase:** `10`
- **Status (ADO State):** `Done` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `auth; google-oauth; account-linking; firebase; phase-10`
- **Description:** Remove the single-provider lock-in during sign-in/sign-up. A user must be able to authenticate with **either Google OAuth OR Email/Password** at any time for the same account—whether they originally registered via Google or via Email/Password. ([ADR-0013](../adr/0013-multi-provider-auth-linking.md))
- **Acceptance Criteria:**
  - [x] Account Settings displays connected sign-in methods (`Google`, `Email/Password`) for the current `uid`.
  - [x] A user who originally signed up with Google OAuth can set/link an Email/Password credential (`linkWithCredential` / `EmailAuthProvider`) inside Account Settings without creating a duplicate account.
  - [x] A user who originally signed up with Email/Password can link their Google OAuth account (`linkWithPopup` / `GoogleAuthProvider`) under the exact same Firebase `uid` and `users/{uid}` Firestore tree.
  - [x] When a user attempts to sign in at `/login` with Google for an email previously created with Password (or vice versa), handle `auth/account-exists-with-different-credential` cleanly and guide seamless credential verification & linking rather than failing cryptically.
  - [x] Once both methods are linked, signing in via Google or Email/Password works interchangeably at any time and accesses the same user data.

#### [FR-6.5] Password Reset Flow with Email Confirmation
- **Work Item Type:** `Product Backlog Item` (`AB#28`)
- **Area / Category:** `Authentication & Security`
- **Phase:** `10`
- **Status (ADO State):** `Done` (`Approved`)
- **Priority:** `2 - High`
- **Plan Tier:** `Free`
- **Tags:** `auth; password-reset; email; phase-10`
- **Description:** Enable self-service password recovery for Email/Password users via Firebase Auth email confirmation links localized in `en` and `pt-BR`. ([ADR-0014](../adr/0014-password-reset-flow.md))
- **Acceptance Criteria:**
  - [x] Add a `"Forgot password?"` link/view on `/login` allowing users to submit their email address and trigger Firebase `sendPasswordResetEmail`.
  - [x] Follow Firebase Auth `languageCode` (`en` / `pt-BR`) so confirmation reset emails match the user's selected locale.
  - [x] Display non-enumerating confirmation feedback (confirming the reset instructions were sent without leaking whether an email is registered).
  - [x] Completing the email confirmation link resets the password cleanly and allows immediate sign-in on `/login`.

#### [FR-6.6] User Profile Management & Time-Tracking Activity Heatmap
- **Work Item Type:** `Product Backlog Item` (`AB#29`)
- **Area / Category:** `Profile & Telemetry`
- **Phase:** `10`
- **Status (ADO State):** `Done` (`Approved`)
- **Priority:** `3 - Medium`
- **Plan Tier:** `Free`
- **Tags:** `analytics; avatar; heatmap; phase-10; profile`
- **Description:** Introduce a dedicated User Profile page (`/app/profile`, accessible from the sidebar account card) where users manage `displayName`, unique `username`, and profile picture (synced from Google OAuth when available), inspect a visual year-at-a-glance Time-Tracking Activity Heatmap, and safely wipe all workspace data (projects, tags, tasks, time entries, active timer) after an automatic lossless backup CSV download.
- **Acceptance Criteria:**
  - [x] Users can edit and persist their `displayName` across Firebase Auth profile and Firestore `users/{uid}`.
  - [x] Users can claim and update a globally unique `username` backed by atomic Firestore transactions (`usernames/{username}`) and anti-enumeration security rules.
  - [x] Users can upload or update a custom profile picture (validated size/type, resized client-side, stored safely and displayed in the sidebar/profile card).
  - [x] Accounts authenticated via Google OAuth automatically default to their Google `photoURL` unless the user uploads a custom avatar override.
  - [x] Render a GitHub-style daily contribution heatmap showing total tracked duration per `dateKey` (in `UserPreferences.timeZone`) with color intensity buckets and hover/focus/tap tooltips showing exact date and `HH:MM:SS` tracked.
  - [x] Users can wipe all tags, projects, tasks, and activities behind a typed confirmation modal (`DELETE` / `APAGAR`) that automatically downloads a lossless re-importable backup CSV before deleting any data.

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

#### [FR-V1] Azure DevOps Work Item Sync (`CompletedWork`) (`AB#31`)
- **Work Item Type:** `Product Backlog Item`
- **Area / Category:** `Integrations`
- **Phase:** `Sprint 4 / FR-V1`
- **Status (ADO State):** `Done` (`Committed` in ADO)
- **Priority:** `2 - High`
- **Plan Tier:** `Pro (Early Access)`
- **Tags:** `azure-devops; sync; human-in-the-loop; pro; tasks; projects`
- **Description:** Deliver Klox's flagship engineering integration ([ADR-0015](../adr/0015-azure-devops-completed-work-sync-and-tasks-workspace.md)): split Catalog into dedicated **Tasks** (`/app/tasks` with sibling drag-and-drop prioritization) and **Projects** (`/app/projects`), unify UI terminology around **Activity / Activities**, enable Toggl-style inline Project & Tag creation, store encrypted ADO PAT credentials strictly on the server, fetch strictly `(Id, Title, CompletedWork)` from ADO, and push **only** `Microsoft.VSTS.Scheduling.CompletedWork` (or create minimal unplanned ADO Work Items) after Human-in-the-Loop approval.
- **Acceptance Criteria:**
  - [x] Encrypted PAT connection to Azure DevOps organization and project stored strictly server-side in `users/{uid}/secrets/azureDevOps` with SSRF allowlist and Entra-ready schema (`authType`).
  - [x] Dedicated `/app/tasks` and `/app/projects` pages (redirecting `/app/catalog`), sibling drag-and-drop & `Alt+ArrowUp/Down` task priority ordering (`sortOrder`), Toggl-style inline Project & Tag creation, and unified Activity copy across `en` and `pt-BR`.
  - [x] Two-way read-only Work Item linking fetching strictly `Title` and `CompletedWork` via search by `#ID` or title plus manual linking/unlinking.
  - [x] Human-in-the-Loop review modal calculating incremental unsynced hours per Activity (with nearest-ancestor Task roll-up), warning gracefully if a Work Item Type lacks `CompletedWork`, and updating **only** `Microsoft.VSTS.Scheduling.CompletedWork`.
  - [x] Option to create a new minimal ADO Work Item (`Title` + optional initial `CompletedWork`) directly from an unplanned Klox `Task` and link its resulting ID.

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