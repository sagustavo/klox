# MASTER CONTEXT HANDOFF: Klox (`klox.dev`) — AI-Native Time & Execution Management Platform

You are acting as my Principal Software & Solutions Architect and Lead Full-Stack Engineer. Use this document as the persistent source of truth for our project, **Klox (`klox.dev`)**.

Below is the complete context of everything we have already designed, decided, and validated. Read and internalize every section carefully.

---

## 1. PROJECT IDENTITY, FOUNDER CONTEXT & VISION

- **App Name & Domain:** **Klox** (`https://klox.dev` — domain already purchased on Hostinger).
- **Founder Profile:** Software Engineer.
- **Academic Context:** This project serves both as a real SaaS product (User #001 is me) and as the Capstone Project for my **Post-Graduation in Software and Solutions Architecture with Artificial Intelligence** at **XP Educação**.
- **Product Vision (POC -> Full Platform):**
  - **Phase 1 (Current POC):** An ultra-fast, keyboard-first, AI-augmented Time Tracking & Analytics application with seamless bi-directional Toggl Track CSV compatibility.
  - **Phase 2 (Strategic Evolution):** A complete **Time & Execution Management Platform** for both **Work** and **Personal Mastery** (studies, workouts, reading, personal goals).
  - **Enterprise Killer Feature (Azure DevOps Sync):** Sometimes engineers must log hours on Azure DevOps Work Items in the `Completed Work` (`Microsoft.VSTS.Scheduling.CompletedWork`) field. Klox is architected so `TimeLog` entries can link to a `Task`, and a `Task` can either be created manually (for personal goals) or synced with an **Azure DevOps Work Item**. With user approval (Human-in-the-Loop AI workflow), Klox will automatically calculate and push accumulated hours to update existing Azure DevOps Work Items or create new Work Items for unplanned tasks.

---

## 2. UBIQUITOUS LANGUAGE & DOMAIN-DRIVEN DESIGN (DDD)

We follow strict Domain-Driven Design nomenclature. Do NOT confuse `Timer` with `TimeLog`:

1. **`Project`:** Macro context (Work or Personal, e.g., `"XP Core API"`, `"Post-Grad Capstone"`, `"Marathon Prep"`).
   - Fields: `id`, `userId`, `name`, `color` (customizable Hex color), `isBillableDefault: boolean`, `createdAt`.
2. **`ProjectTag` (`Tag`):** Cross-cutting label **strictly owned by a `Project`** (`projectId`).
   - **Domain Invariant:** When logging or editing a task/time log and selecting a Project, **ONLY the tags owned by that specific Project** may be shown and selected. Switching projects clears incompatible tags and defaults `isBillable` to the Project's `isBillableDefault`.
   - For imports/logs without a project, a fallback `"General / Unassigned"` project owns those tags.
3. **`Task`:** Actionable unit of work or goal belonging to a `Project` (`projectId`).
   - **3-Level Hierarchy (`Task` → `Subtask` → `Sub-subtask`, ADR-0007):** Supports `parentTaskId?: EntityId | null` and `depth?: 0 | 1 | 2` (`0 = Task`, `1 = Subtask`, `2 = Sub-subtask`). A parent task must belong to the same `projectId` and have `depth < 2`. Deleting a task cascades deletion to its descendant subtasks and sub-subtasks.
   - **Basic Markdown Description:** Supports an optional `description?: string` field rendered with XSS-safe basic Markdown (`**bold**`, `*italic*`, `` `code` ``, lists, links, `- [ ]` checklists, headings).
   - **Task-Driven Timer Execution:** Users can start a live `Timer` (`[▶ Start]`) directly from any Task, Subtask, or Sub-subtask, automatically binding `projectId`, `taskId`, hierarchical `description` (`Parent / Subtask`), and `isBillable`, and transitioning `status` from `'todo'` to `'in_progress'`.
   - Supports personal goals (`targetHours`) and future **Azure DevOps Work Item** integration (`externalProvider?: 'azure_devops' | null`, `externalWorkItemId?: string`, `completedWorkHours: number`, `status: 'todo' | 'in_progress' | 'done'`).
4. **`Timer` (`ActiveTimer`):** The singleton, transient live-ticking stopwatch state (`{ description, projectId, taskId?, tagIds[], isBillable, startTimeUTC }`).
   - **Resilience Invariant:** Persisted in both Firestore (`users/{uid}.activeTimer`) and `localStorage`. Elapsed seconds are ALWAYS calculated as `Math.floor((Date.now() - Date.parse(startTimeUTC)) / 1000)` (never via naive `elapsed++` counters) so page refreshes, browser crashes, or tab throttling never lose time.
   - **Single Active Timer Constraint:** Starting a new `Timer` while one is running must automatically stop and commit the running `Timer` into a `TimeLog` first.
5. **`TimeLog`:** A persisted historical record of time spent (created by stopping a `Timer`, manual time logging, or Toggl CSV import).
   - Fields: `id`, `userId`, `description`, `normalizedDescription`, `projectId`, `projectNameSnapshot`, `projectColorSnapshot`, `taskId?`, `taskNameSnapshot?`, `tagIds: string[]`, `tagNamesSnapshot: string[]`, `isBillable: boolean`, `startTime` (UTC ISO), `endTime` (UTC ISO), `durationSeconds: number`, `timeZone` (IANA snapshot at write time, e.g. `"America/Sao_Paulo"`), `dateKey` (`"YYYY-MM-DD"` computed from `startTime` in the **user's preferred IANA timezone** — `UserPreferences.timeZone` — not the browser's current timezone).
6. **`UserPreferences`:** Regional settings stored at `users/{uid}.preferences` (`locale`, `timeZone`, `weekStartsOn: 0 | 1 | 6`, `dateFormat`, `hourCycle: 'h12' | 'h23'`). Auto-detected from the browser on first visit and editable in Settings (FR-3).
7. **`OnboardingState`:** Per-user onboarding progress stored at `users/{uid}.onboarding` (`version`, `wizardStatus: 'pending' | 'completed' | 'skipped'`, `profile?: 'work' | 'personal' | 'both'`, `tutorialCompletedAt?`, `checklist: Record<ChecklistItemId, completedAt>`) (FR-2).
8. **`DomainEvent`:** Typed in-app events published by stores (`TimerStarted`, `TimerStopped`, `TimeLogCreated{source}`, `RecallTemplateSelected`, `AiAutofillUsed`, `DashboardViewed`, `CsvImported`, `CsvExported`). Consumers (onboarding checklist, future Azure DevOps sync, analytics) subscribe; producers never know their consumers (ADR D10).

**System entities & identifiers:**
- The fallback project carries `systemKey: 'unassigned'`; its label is rendered via i18n (never stored as a translated string). User-created names are never translated.
- Entity IDs come from an `IdGenerator` port (ADR D8): Firestore random auto-IDs (no monotonic IDs → no hotspots), deterministic SHA-256-based IDs for Toggl CSV imports (idempotent re-import), UUIDv7 reserved for a future relational adapter.

---

## 3. FUNCTIONAL REQUIREMENTS (POC)

### 3.1 Authentication & Tenant Isolation

- **Firebase Authentication:** Must support both **Email/Password** (Sign Up / Sign In) AND **Google OAuth 2.0** (`signInWithPopup`).
- **Strict Isolation:** All user data lives under `users/{userId}/...` in Cloud Firestore, enforced by `firestore.rules`.

### 3.2 High-Velocity Keyboard-First Workflow

- **Global Shortcuts** (must be guarded so single-key shortcuts do NOT fire while `document.activeElement` is an `INPUT`, `TEXTAREA`, or `SELECT`):
  - `N`: Focuses the "New Task / Timer" description input immediately from anywhere.
  - `S`: Stops the currently running `Timer` and saves the `TimeLog`.
  - `Esc`: Blurs the active input or closes open dropdowns, returning to global command mode.
- **Fluid `Tab` Sequence:** When focused on the task description input, pressing `Tab` cycles cleanly through:
  1. `Description Input` -> 2. `Project Selector` -> 3. `Project-Scoped Tag Selector` -> 4. `Billable Toggle` -> 5. `Start/Save Button` (`Enter` to execute).
- **Manual Time Logging & CRUD:** Users can also add historical `TimeLog` entries manually (specifying date, start/end time or duration) and inline edit/delete existing logs.

### 3.3 Two-Tier Hybrid Search Engine & Gemini AI Auto-Fill

- **Tier 1 — Instant Lexical Recall (`Fuse.js`, `<2ms`):**
  - As the user types a task description, `Fuse.js` searches deduplicated historical task templates (`normalizedDescription + projectId`) ranked by fuzzy match, frequency, and recency, displaying the **Top 10 best matches** in a floating dropdown. Selecting a match auto-fills `description`, `projectId`, `tagIds`, and `isBillable`.
- **Tier 2 — Semantic AI Auto-Fill (`@google/genai` with `gemini-3.8-flash`):**
  - Triggered via keyboard shortcut `Cmd+I` / `Ctrl+I` or clicking the `[✨ AI Auto-Fill]` button.
  - Sends the typed description + the user's catalog of Projects and their Project-Scoped Tags to a backend endpoint using `gemini-3.8-flash` with Structured JSON Outputs (`responseSchema`) to automatically predict and select the most appropriate `projectId`, valid `tagIds` (belonging to that project), and `isBillable` status.

### 3.4 Analytical Dashboard & Multi-Dimensional Slicing

- **Global Reactive Filter Bar:** Filters the entire history (feeding both charts and the data table simultaneously) by:
  - **Time Range:** Presets (Today, This Week, Last 7 Days, This Month, All Time) + Custom Start/End Date Range.
  - **Project / Task:** Multi-select.
  - **Tag:** Multi-select.
  - **Description:** Keyword/substring filter.
- **Visualization 1 — Pizza (Donut/Pie) Chart:**
  - Sliceable dynamically via a segmented control by: **`Tag`**, **`Project`**, or **`Task Description`**.
  - Shows total tracked hours in the center (`tabular-nums`) and percentage/duration breakdown in the legend.
- **Visualization 2 — Duration by Day Graph (Stacked Bar Chart):**
  - Shows daily tracked duration across the selected date range.
  - Dynamically breakable/stacked via a segmented control by: **`Tag`**, **`Project`**, or **`Task Description`**.
- **Visualization 3 — Filtered Tasks / TimeLogs Data Table:**
  - Displays the exact filtered `TimeLog` records feeding the charts.
  - Must support **Group / Breakdown by `Tag`** (collapsible group headers per Tag showing count and subtotal duration `HH:MM:SS`, plus an `"Untagged"` bucket if needed).

### 3.5 Bi-Directional Toggl Track CSV Import & Export

Must strictly follow official Toggl Track CSV specifications:

- **Official English Headers:** `User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags`
- **CSV Import (`PapaParse`):**
  - Supports both full time-log rows (requiring `Start date` in `YYYY-MM-DD`, `Start time` in `HH:MM:SS`, `Duration` in `HH:MM:SS`) AND standalone metadata rows (rows with only `Project` or `Tags`).
  - Automatically resolves or creates missing `Projects` (assigning distinct palette colors) and creates/links comma-separated `Tags` under that row's resolved `Project` (or `"General / Unassigned"` if `Project` is blank).
  - Calculates `endTime = startTime + durationSeconds` if `End time` is omitted, normalizes `Billable` (`Yes`/`No`/`TRUE`/`FALSE`), deduplicates identical logs, shows a dry-run preview, and batch-writes to Firestore.
- **CSV Export:**
  - Exports filtered or all `TimeLogs` into a UTF-8 CSV (with `\uFEFF` BOM for Excel compatibility) using the exact Toggl Track headers so users can migrate to/from Toggl Track or back up data locally.
- **Interop contract:** CSV headers and date/time formats always stay in Toggl's English spec regardless of UI language; only the preview UI and error messages are localized.

### 3.6 Landing Page (FR-1)

- **Purpose:** Product showcase with open sign-up. Routes `/` (en) and `/pt-br` — **prerendered** static HTML (SEO + link previews), no Firebase SDK in the landing bundle.
- **CTAs:** Primary `Get started free` → `/login?mode=signup`; secondary `Sign in` and `Try the live demo` (demo mode, no sign-up). Signed-in visitors see `Open app →`.
- **Sections:** Header (logo, anchors, locale + theme switch) → **Hero with a self-playing Command Bar demo** (types a description, recall dropdown, `✨` AI fill, `[Enter]` start, ticking JetBrains Mono digits; built from the real presentational components; honors `prefers-reduced-motion`) → **Feature grid** (Keyboard-first, Two-tier AI recall/auto-fill, Analytics, Toggl import/export) → **Azure DevOps sync teaser** ("Coming soon") → **Pricing** (Free / Pro "coming soon" placeholder, no billing) → **FAQ** (native `<details>`) → Footer.
- **Targets:** Lighthouse mobile Performance ≥ 95, SEO = 100, Accessibility ≥ 95, LCP < 2.0 s; per-locale meta, canonical, `hreflang` + `x-default`, OG images, `sitemap.xml`, `robots.txt` disallowing `/app/**`.

### 3.7 Onboarding (FR-2)

- **Setup wizard** (`/app/welcome`, first sign-in, fully keyboard navigable, skippable at every step):
  1. Welcome + confirm auto-detected regional preferences (language, timezone, week start, date format, 12/24h).
  2. Profile: Work / Personal / Both (drives localized project templates, translated at creation time and then stored as plain user data).
  3. Starting point: Create first project + tags · Import from Toggl · Start empty (no fake/sample data is ever seeded).
  4. Interactive tutorial (below).
- **Interactive keyboard tutorial (spotlight tour):** each step advances only on the **real action** — `N` → type → `Tab` cycle → `⌘I`/`Ctrl+I` (skippable if AI unavailable) → `Enter` (timer starts) → `S` (stops; offer keep/delete the log). Touch devices (`pointer: coarse`) get a tap-flow variant for the bottom dock. Steps anchor on `data-tour` attributes.
- **Getting-started checklist** (dismissible, progress ring): first timer · reuse a recall template · try AI auto-fill · manual log · open dashboard · Toggl import/export. Items complete via `DomainEvent`s.
- **Replay & help:** Help menu + global `?` shortcut (same input-focus guard as `N`/`S`) opens a command sheet: shortcuts cheat-sheet, replay tutorial, show checklist, re-run wizard (non-destructive).
- Accounts created before onboarding shipped default to `wizardStatus: 'skipped'`.

### 3.8 Internationalization (FR-3)

- **Launch locales:** `en` (default + source of truth) and `pt-BR` (`es` deferred to post-POC backlog). Adding a locale = one JSON file + one config entry, no code changes. **RTL is out of scope.**
- **Four separate concerns:** UI language (`@nuxtjs/i18n`, lazy-loaded) · regional formatting (`Intl.*` via a single `useFormat()` composable) · time semantics (`UserPreferences.timeZone` + `weekStartsOn` in the domain layer; dashboard presets respect them) · user content (never translated).
- **Telemetry exception:** live timers and durations always render `HH:MM:SS` in Latin digits, JetBrains Mono, `tabular-nums`, in every locale.
- **Boundaries:** server/API returns error **codes** (`AI_RATE_LIMITED`, `AI_UNAVAILABLE`, `AUTH_INVALID`), translated client-side. Gemini returns IDs only. Firebase Auth `languageCode` follows the user locale.
- **Quality gates (lean POC):** typed message keys from `en.json`. Key convention `feature.component.element`. Heavy i18n lint rules, CI check scripts, and pseudo-locale generation are deferred to the post-POC backlog to keep token spend and setup minimal.
- **Rule from Phase 1 onward:** every UI string goes through `$t()`; every interactive element relevant to onboarding gets a `data-tour` attribute.

---

## 4. NON-FUNCTIONAL REQUIREMENTS & "MUSK-TECH" DESIGN SYSTEM

- **Aesthetic Inspiration:** **xAI (Grok), Cursor, SpaceX, and Starlink** — minimalist, high-precision engineering telemetry, sharp geometry, dark by default, with a working **Dark / Light Mode Switch**.
- **Color Tokens:**
  - **Dark Mode (Default):** Primary BG `#050505` (Deep Obsidian) | Elevated Card BG `#0C0C0E` | Hover Surface `#141417` | Hairline Borders `1px solid #222226` | Primary Text `#FAFAFA` | Muted Text `#8E8E93` | Telemetry Accent `#3B82F6` (Electric Cobalt).
  - **Light Mode:** Primary BG `#FAFAFA` | Elevated Card BG `#FFFFFF` | Hairline Borders `#E4E4E7` | Primary Text `#09090B`.
- **Typography:**
  - UI Sans: `'Inter'` or `'Geist'` (`tracking-tight`).
  - Telemetry & Timers Mono: `'JetBrains Mono'` with `font-variant-numeric: tabular-nums` MANDATORY on all live timers, durations, dates, and keyboard shortcut keycaps (`[N]`, `[S]`, `[Tab]`, `[⌘I]`).
- **Mobile Responsiveness:**
  - Desktop (`>= 1024px`): Persistent top Command Timer Bar and multi-column analytics grid.
  - Mobile (`< 768px`): Command Timer Bar transforms into a sticky bottom thumb-zone dock; charts stack cleanly in 1 column.

---

## 5. TECH STACK

**Primary Stack (Local Development via Claude Code / Gemini CLI / Antigravity):**

- **Frontend + BFF:** **Nuxt 4** (`app/` directory, Vue 3 Composition API, TypeScript Strict) with **hybrid rendering** — prerendered marketing routes + client-only `/app/**` SPA (`routeRules`) — and Nuxt Nitro Server Routes `server/api/*` for Gemini AI calls. `Pinia`, `@vueuse/core`, `@nuxtjs/tailwindcss`, `@nuxtjs/color-mode`, `@nuxtjs/i18n`.
- **Backend:** **Firebase (latest modular SDK, v12+)** — Authentication + Cloud Firestore; `firebase-admin` on the server for ID-token verification.
- **Libraries:** `chart.js` + `vue-chartjs`, `fuse.js`, `papaparse`, `date-fns` + `@date-fns/tz`, `lucide-vue-next`, `@google/genai` (model from `GEMINI_MODEL` env var; default = current Flash GA model).
- **Tooling (lean POC):** `pnpm`, TypeScript (`nuxt typecheck`), optional lightweight `Vitest` only for pure tricky logic (duration math, CSV parsing) when fast and cheap to write. No Playwright, no Firestore emulator test suite, no heavy CI scripts during POC.
- **Hosting:** Firebase App Hosting (alternative: Vercel); `klox.dev` DNS on Hostinger.

---

## 6. ARCHITECTURE DECISIONS (ADR SUMMARY)

> **POC Pragmatism Principle:** Priority #1 is proving platform feasibility fast with minimal token spend. Keep boundaries clean where it is free (pure `app/domain/` functions, simple store interfaces), and skip heavy test harnesses, ceremonial abstractions, and over-engineering until post-POC.

| # | Decision |
|---|---|
| D1 | Nuxt 4 instead of Nuxt 3 (Nuxt 3 is end-of-life). |
| D2 | Latest Firebase modular SDK (v12+). |
| D3 | Gemini model configured via `GEMINI_MODEL` env var (model IDs get deprecated). |
| D4 | Firebase App Hosting for SSR/prerender + Nitro API (static Hosting can't run server routes). |
| D5 | Every `/api/ai/*` call verifies the Firebase ID token (`firebase-admin`) and is rate-limited per user. The server re-validates that AI-returned `tagIds` belong to the predicted project. |
| D6 | **Lean verification:** `pnpm`, `pnpm typecheck`, manual browser check. Optional tiny Vitest tests only for tricky pure functions (`duration`, `toggl`). Playwright, rules-emulator suites, and i18n CI scripts are deferred to post-POC. |
| D7 | Demo mode: `localStorage` fallback when Firebase env is missing. |
| D8 | Entity IDs: Firestore random auto-IDs (UUIDv7 rejected for Firestore — monotonic keys cause write hotspots and give no B-tree benefit there); deterministic SHA-256 hash IDs for idempotent Toggl CSV import; UUIDv7 noted for any future SQL store. |
| D9 | Hybrid rendering: prerendered landing (`/`, `/pt-br`), client-only `/app/**` and `/login`; Firebase loaded only on app routes. |
| D10 | Lightweight typed in-app event helper (~20 lines) so onboarding checklist items react to user actions without coupling stores. |
| D11 | 8-phase roadmap with a dedicated Onboarding & i18n completion phase before launch. |
| D12 | **Browser support policy:** Baseline *Widely available* features may be used freely; Baseline *Newly available* features only when feature-detected with a graceful fallback. Consult `modern-web-guidance` before building UI patterns (dialogs, popovers, anchor positioning, motion). |

**Layering rule:** `app/domain/` is pure TypeScript (no Vue/Firebase imports). Keep adapters simple.

**Living backlog:** `docs/product/backlog.md`.

**ADRs are written on demand, never batched at the end:** every architectural decision is recorded in `docs/adr/NNNN-kebab-title.md` (template `docs/adr/0000-template.md`, index `docs/adr/README.md`) **in the same change that introduces it** — during planning if decided in planning, or in the feature's PR if decided during development. Keep each ADR concise (1 short page). Superseded ADRs are kept and marked `Superseded by ADR-NNNN`. The table above is a summary; the ADR files are authoritative.

---

## 7. 8-PHASE IMPLEMENTATION ROADMAP

We are executing the build in 8 sequential phases. Every phase ends with `pnpm typecheck` green, a quick manual check, any new ADRs written, and `docs/product/backlog.md` updated.

- **Phase 1 — Foundation:** Nuxt 4 scaffold with hybrid `routeRules`, Tailwind, color-mode, `@nuxtjs/i18n` (`en` wired, `pt-BR` locale file stubbed), `domain/types.ts`, `domain/duration.ts`, `domain/preferences.ts` + `useFormat`, Musk-Tech Design System (`#050505` dark / light mode), `KloxLogo`, `KeycapBadge`, `TimerDigits`, `marketing` + `app` layouts, and a **minimal landing page** (hero + CTAs).
- **Phase 2 — Auth & Isolation:** Firebase Auth (Email/Password + Google OAuth) on app routes only, `auth` middleware for `/app/**`, Firestore + Demo data access, `firestore.rules`, tiny domain event helper, **`/app/settings`** (regional preferences), Firebase Auth `languageCode`.
- **Phase 3 — Catalog:** Catalog Store (`Projects`, `Project-Owned Tags`, foundational `Tasks`) + Project & Scoped Tag CRUD UI with custom hex color picker and default `isBillable` toggle; `systemKey: 'unassigned'` with translated label.
- **Phase 4 — Command Timer Bar & AI:** `N`, `S`, `Tab` cycle, `Esc`, `?`; resilient `startTimeUTC` delta calculation; manual log CRUD; `Fuse.js` Top-10 recall; `@google/genai` `[✨ AI Auto-Fill]` endpoint returning error codes; domain events published.
- **Phase 5 — Analytics Dashboard:** `FilterBar` (timezone + week-start aware presets), `PizzaChartCard` and `DailyDurationChartCard` (Tag/Project/Description), `TasksBreakdownTable` groupable by Tag; locale-formatted axes/legends.
- **Phase 6 — Toggl CSV Studio:** `useTogglCsv`, dry-run preview, automatic Project/Scoped-Tag resolution, deterministic import IDs, UTF-8 BOM exporter.
- **Phase 7 — Onboarding & i18n Completion:** Setup wizard, profile templates, `SpotlightTour` (keyboard + touch), getting-started checklist, help sheet; full `pt-BR` translation; localized Auth email templates.
- **Phase 8 — Polish, Landing & Launch:** Mobile bottom-dock polish, full landing page in `en` and `pt-BR` (SEO/OG/hreflang/sitemap), the **XP Educação Post-Graduation Software & AI Architecture README** (consolidating the already-written ADRs + Mermaid C4 diagrams), production deploy to `klox.dev`.
