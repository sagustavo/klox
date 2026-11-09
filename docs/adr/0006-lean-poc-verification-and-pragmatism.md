# ADR-0006: Lean POC Verification, Real-Data-Only Policy, and Browser Support

- **Status:** Accepted
- **Date:** 2026-11-09
- **Phase:** Planning (D6, D10, D11, D12)

## Context

The primary goal of the POC is to validate platform feasibility fast while keeping AI coding token consumption low. Heavy test suites (Playwright e2e, Firestore emulator suites, custom i18n linters, pseudo-locale generators) and fake sample-data seeders consume significant build time and tokens without helping prove the core product workflow.

## Decision

- **Lean verification (D6):** Gate each phase on `pnpm typecheck` and a quick manual browser check. Write small `Vitest` unit tests **only** where pure math or parsing is genuinely tricky (`duration`, `toggl`). Defer Playwright, rules-emulator test suites, and i18n CI scripts to post-POC (`BL-1`).
- **No sample data (`BL-8`):** Never seed fake historical logs. Onboarding lets users create their first real project (with optional localized name suggestions), import a real Toggl CSV, or start empty.
- **Lightweight domain events (D10):** Use a ~20-line typed pub/sub helper so onboarding checklist items react to user actions (`TimerStarted`, `TimeLogCreated`, etc.) without coupling stores.
- **Browser support (D12):** Use Baseline *Widely available* web features freely; use Baseline *Newly available* features only with feature detection and a simple fallback, consulting `modern-web-guidance` before building dialogs/popovers/anchor positioning.

## Consequences

- **Good:** Dramatically lower token spend and faster iteration across all 8 phases; user accounts stay clean.
- **Trade-off:** Regression coverage relies mostly on TypeScript strictness and manual checks until post-POC.
