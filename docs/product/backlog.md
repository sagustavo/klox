# Klox Product Backlog

Living backlog for **Klox (`klox.dev`)**. Source of truth for context and domain rules: [GEMINI.md](../../GEMINI.md).

**Status values:** `Done` · `In Progress` · `POC` (scheduled in Phases 1–8) · `Next` (post-POC) · `Later` (vision) · `Won't` (explicitly out of scope).

---

## POC Scope (Phases 1–8)

| ID | Requirement | Phase | Status | Notes |
|---|---|---|---|---|
| FR-0.1 | Firebase Auth (Email/Password + Google OAuth) & strict `users/{uid}` tenant isolation | 2 | POC | GEMINI.md §3.1 |
| FR-0.2 | Keyboard-first Command Timer Bar (`N`, `S`, `Esc`, `?`, `Tab` cycle), resilient `startTimeUTC` elapsed math, single active timer, manual log CRUD | 4 | POC | GEMINI.md §3.2 |
| FR-0.3 | Catalog: `Projects` (hex color, `isBillableDefault`), project-scoped `Tags` (domain invariant), foundational `Tasks`, `systemKey: 'unassigned'` | 3 | POC | GEMINI.md §2 |
| FR-0.4 | Two-tier hybrid search & AI auto-fill: Tier 1 `Fuse.js` Top-10 recall + Tier 2 Gemini structured JSON (`⌘I` / `Ctrl+I`) with server-side tag/project validation | 4 | POC | GEMINI.md §3.3 |
| FR-0.5 | Analytical Dashboard: reactive filter bar, Pizza chart, Daily stacked bar chart, Tag-grouped breakdown table | 5 | POC | GEMINI.md §3.4 |
| FR-0.6 | Bi-directional Toggl Track CSV import (dry-run, auto-resolve entities, deterministic hash IDs) & UTF-8 BOM export | 6 | POC | GEMINI.md §3.5 |
| **FR-1** | **Landing page:** prerendered showcase (`/`, `/pt-br`), open sign-up, self-playing Command Bar hero demo, feature grid, ADO sync teaser, pricing placeholder, FAQ, SEO/OG | 1 (minimal) → 8 (full) | POC | GEMINI.md §3.6 |
| **FR-2** | **Onboarding:** `/app/welcome` setup wizard (regional prefs → Work/Personal/Both profile → create project / import Toggl / start empty — **never fake sample data**), interactive keyboard tutorial (with touch variant), getting-started checklist, `?` help & replay sheet | seams 2–4 → 7 | POC | GEMINI.md §3.7 |
| **FR-3** | **Internationalization:** `en` and `pt-BR` at launch; locale-agnostic setup; `UserPreferences` (timezone, week start, date format, 12/24h); timezone-aware `dateKey` + per-log `timeZone` snapshot; `useFormat()` via `Intl.*`; timers always `HH:MM:SS` in Latin digits | 1 → 7 | POC | GEMINI.md §3.8 |

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
| BL-7 | Right-to-left (RTL) locales | Won't | Explicitly out of scope |
| BL-8 | Sample/fake data seeder | Won't | Explicitly rejected — accounts start with real user data only |
