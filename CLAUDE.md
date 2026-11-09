
# MASTER CONTEXT HANDOFF: KLOX (`klox.dev`) — AI-Native Time & Execution Management Platform

You are acting as my Principal Software & Solutions Architect and Lead Full-Stack Engineer. Use this document as the persistent source of truth for our project, **KLOX (`klox.dev`)**.

Below is the complete context of everything we have already designed, decided, and validated. Read and internalize every section carefully.

---

## 1. PROJECT IDENTITY, FOUNDER CONTEXT & VISION

- **App Name & Domain:** **KLOX** (`https://klox.dev` — domain already purchased on Hostinger).
- **Founder Profile:** Software Engineer at **XP Inc.** (Brazil).
- **Academic Context:** This project serves both as a real SaaS product (User #001 is my wife!) and as the Capstone Project for my **Post-Graduation in Software and Solutions Architecture with Artificial Intelligence** at **XP Educação**.
- **Product Vision (POC -> Full Platform):**
  - **Phase 1 (Current POC):** An ultra-fast, keyboard-first, AI-augmented Time Tracking & Analytics application with seamless bi-directional Toggl Track CSV compatibility.
  - **Phase 2 (Strategic Evolution):** A complete **Time & Execution Management Platform** for both **Work** and **Personal Mastery** (studies, workouts, reading, personal goals).
  - **Enterprise Killer Feature (Azure DevOps Sync):** At XP Inc., engineers must log hours on Azure DevOps Work Items in the `Completed Work` (`Microsoft.VSTS.Scheduling.CompletedWork`) field. KLOX is architected so `TimeLog` entries can link to a `Task`, and a `Task` can either be created manually (for personal goals) or synced with an **Azure DevOps Work Item**. With user approval (Human-in-the-Loop AI workflow), KLOX will automatically calculate and push accumulated hours to update existing Azure DevOps Work Items or create new Work Items for unplanned tasks.

---

## 2. UBIQUITOUS LANGUAGE & DOMAIN-DRIVEN DESIGN (DDD)

We follow strict Domain-Driven Design nomenclature. Do NOT confuse `Timer` with `TimeLog`:

1. **`Project`:** Macro context (Work or Personal, e.g., `"XP Core API"`, `"Post-Grad Capstone"`, `"Marathon Prep"`).
   - Fields: `id`, `userId`, `name`, `color` (customizable Hex color), `isBillableDefault: boolean`, `createdAt`.
2. **`ProjectTag` (`Tag`):** Cross-cutting label **strictly owned by a `Project`** (`projectId`).
   - **Domain Invariant:** When logging or editing a task/time log and selecting a Project, **ONLY the tags owned by that specific Project** may be shown and selected. Switching projects clears incompatible tags and defaults `isBillable` to the Project's `isBillableDefault`.
   - For imports/logs without a project, a fallback `"General / Unassigned"` project owns those tags.
3. **`Task`:** Actionable unit of work or goal belonging to a `Project` (`projectId`).
   - Supports personal goals (`targetHours`) and future **Azure DevOps Work Item** integration (`externalProvider?: 'azure_devops' | null`, `externalWorkItemId?: string`, `completedWorkHours: number`, `status: 'todo' | 'in_progress' | 'done'`).
4. **`Timer` (`ActiveTimer`):** The singleton, transient live-ticking stopwatch state (`{ description, projectId, taskId?, tagIds[], isBillable, startTimeUTC }`).
   - **Resilience Invariant:** Persisted in both Firestore (`users/{uid}.activeTimer`) and `localStorage`. Elapsed seconds are ALWAYS calculated as `Math.floor((Date.now() - Date.parse(startTimeUTC)) / 1000)` (never via naive `elapsed++` counters) so page refreshes, browser crashes, or tab throttling never lose time.
   - **Single Active Timer Constraint:** Starting a new `Timer` while one is running must automatically stop and commit the running `Timer` into a `TimeLog` first.
5. **`TimeLog`:** A persisted historical record of time spent (created by stopping a `Timer`, manual time logging, or Toggl CSV import).
   - Fields: `id`, `userId`, `description`, `normalizedDescription`, `projectId`, `projectNameSnapshot`, `projectColorSnapshot`, `taskId?`, `taskNameSnapshot?`, `tagIds: string[]`, `tagNamesSnapshot: string[]`, `isBillable: boolean`, `startTime` (UTC ISO), `endTime` (UTC ISO), `durationSeconds: number`, `dateKey` (`"YYYY-MM-DD"` in local timezone).

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

### 3.3 Two-Tier Hybrid Search Engine & Gemini AI Auto-Fill (Academic AI Highlight)

- **Tier 1 — Instant Lexical Recall (`Fuse.js`, `<2ms`):**
  - As the user types a task description, `Fuse.js` searches deduplicated historical task templates (`normalizedDescription + projectId`) ranked by fuzzy match, frequency, and recency, displaying the **Top 10 best matches** in a floating dropdown. Selecting a match auto-fills `description`, `projectId`, `tagIds`, and `isBillable`.
- **Tier 2 — Semantic AI Auto-Fill (`@google/genai` with `gemini-2.5-flash`):**
  - Triggered via keyboard shortcut `Cmd+I` / `Ctrl+I` or clicking the `[✨ AI Auto-Fill]` button.
  - Sends the typed description + the user's catalog of Projects and their Project-Scoped Tags to a backend endpoint using `gemini-2.5-flash` with Structured JSON Outputs (`responseSchema`) to automatically predict and select the most appropriate `projectId`, valid `tagIds` (belonging to that project), and `isBillable` status.

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

## 5. TECH STACK OPTIONS

**Primary Stack (Local Development via Claude Code / Gemini CLI):**

- **Frontend + BFF:** **Nuxt 3** (Vue 3 Composition API, TypeScript Strict, `ssr: false` SPA mode + Nuxt Nitro Server Routes `server/api/*` for Gemini AI calls), `Pinia`, `@vueuse/core`, `@nuxtjs/tailwindcss`, `@nuxtjs/color-mode`.
- **Backend:** **Firebase v11** (Authentication + Cloud Firestore).
- **Libraries:** `chart.js` + `vue-chartjs`, `fuse.js`, `papaparse`, `date-fns`, `lucide-vue-next`, `@google/genai` (`gemini-2.5-flash`).

---

## 7. 7-PHASE IMPLEMENTATION ROADMAP

We are executing the build in 7 sequential, verified phases:

- **Phase 1:** Project Scaffolding, `types/domain.ts` (`Project`, `ProjectTag`, `Task`, `ActiveTimer`, `TimeLog`, `DashboardFilters`), Musk-Tech Design System (`#050505` dark / light mode), `KloxLogo`, and `KeycapBadge`.
- **Phase 2:** Firebase Auth (Email/Password + Google OAuth), route protection middleware, demo fallback mode, and `firestore.rules`.
- **Phase 3:** Catalog Store (`Projects`, `Project-Owned Tags`, and foundational `Tasks` support) + Project & Scoped Tag CRUD UI with custom hex color picker and default `isBillable` toggle.
- **Phase 4:** High-Velocity Command Timer Bar (`N`, `S`, `Tab` cycle, `Esc`), resilient `startTimeUTC` delta calculation, `Fuse.js` Top-10 past task recall dropdown, and `@google/genai` (`gemini-2.5-flash`) `[✨ AI Auto-Fill]` endpoint.
- **Phase 5:** Reactive Analytical Dashboard (`FilterBar`, `PizzaChartCard` sliceable by Tag/Project/Description, `DailyDurationChartCard` breakable by Tag/Project/Description, and `TasksBreakdownTable` groupable by Tag).
- **Phase 6:** Bi-Directional Toggl Track CSV Import & Export Studio (`useTogglCsv`, dry-run preview, automatic Project/Scoped-Tag entity resolution, sample CSV generator, and UTF-8 BOM exporter).
- **Phase 7:** Mobile bottom-dock polish, realistic Musk-tech demo data seeder, and the **XP Educação Post-Graduation Software & AI Architecture README** (with ADRs and Mermaid C4 diagrams).

---

### HOW TO RESPOND NOW:

Acknowledge that you have loaded the complete context for **KLOX (`klox.dev`)** and ask me how I would like to proceed (e.g., starting **Phase 1**, refining the architecture documentation for XP Educação, or building inside Google AI Studio vs. local Nuxt 3).
