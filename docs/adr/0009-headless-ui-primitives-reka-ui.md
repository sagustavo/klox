# ADR-0009: Headless Accessible UI Primitives via `reka-ui`

- **Status:** Accepted
- **Date:** 2026-11-22
- **Phase:** Phase 9 / FR-5.2 & FR-5.5

## Context

Klox requires rich, keyboard-first interactive primitives — collision-aware popovers, searchable multi-select tag and filter dropdowns, switches, and confirmation dialogs — inside dense telemetry rows and a sticky mobile bottom dock. Opinionated pre-styled component kits (`@nuxt/ui`, PrimeVue, Vuetify) either conflict with `@nuxtjs/tailwindcss` / `@nuxtjs/color-mode` or impose rounded, heavy visual stylesheets that clash with Klox's sharp (`0px` radius) Orbital "Musk-Tech" design tokens (ADR-0008). Hand-rolling WAI-ARIA focus traps, viewport collision positioning, and roving tabindex logic across multiple popovers increases bug risk and maintenance overhead.

## Decision

Adopt **`reka-ui`** (the official Vue 3 / Nuxt 4 evolution of Radix Vue) as Klox's headless WAI-ARIA primitive layer (`Popover`, `Listbox`, `Switch`, `Dialog`), styled exclusively through Klox's Tailwind tokens in `app/components/ui/*` and `app/components/timer/*`.

## Consequences

- **Good:** Guarantees full keyboard navigation (`Tab`, `ArrowUp`/`ArrowDown`, `Space`, `Enter`, `Esc`), screen-reader ARIA semantics, and portal-based viewport collision avoidance (essential for row popovers and the mobile bottom dock) with zero CSS theme conflicts and tree-shaken bundle size.
- **Trade-off:** Adds one focused runtime dependency (`reka-ui`), which is reused across Tag Multiselects, Project/Task pickers, Dashboard Multi-Select filters (`FR-5.5`), and Confirmation Dialogs (`FR-5.3`).
