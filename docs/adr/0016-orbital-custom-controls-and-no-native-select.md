# ADR-0016: Orbital Custom Controls & Prohibition of Browser-Native `<select>` Elements

- **Status:** Accepted
- **Date:** 2026-11-28
- **Phase:** Sprint 5 / Design System Standardization (`UX-3.1`)

---

## Context

Even after adopting the Orbital "Musk-Tech" design system (ADR-0008) and headless `reka-ui` primitives for Popovers, Menus, Switches, and Dialogs (ADR-0009), legacy browser-native `<select>` controls persisted in secondary toolbars (e.g., `/app/tasks` link/deadline filters, `/app/dashboard` grouping/page-size selectors, `/app/settings` regional pickers, and ADO/CSV modal pickers).

Native `<select>` OS menus break cross-platform visual consistency:
1. Popup menus ignore Klox's dark/light OKLCH tokens, sharp `0px` geometry, hairline borders, `.signal-line` accents, and `.tabular-telemetry` typography on Windows, Linux, and macOS browsers.
2. Styling inconsistencies between custom `reka-ui` popovers (`FilterMultiSelect`, `ProjectPopover`, `TaskPopover`) and adjacent raw `<select>` controls create jarring UX seams on the same toolbar row.

---

## Decision

1. **Ban Browser-Native `<select>` Controls Across Application UI:** No page, toolbar, card, or dialog under `app/` may render a raw `<select>` element.
2. **Standardize on `<UiSelect>` (`app/components/ui/Select.vue`):** Introduce a single shared `<UiSelect>` component built on `reka-ui`'s WAI-ARIA `SelectRoot` / `SelectTrigger` / `SelectContent` / `SelectItem` primitives:
   - Preserves sharp `0px` Orbital geometry, `1px` `border-border-input`, portal positioning with collision avoidance (`position="popper"`), top `.signal-line` accent, `>= 12px` text (`text-ui` / `text-xs`), optional color swatch / secondary badges, `.tabular-telemetry` support, and full keyboard typeahead (`ArrowUp` / `ArrowDown` / `Home` / `End` / `Enter` / `Esc`).
   - Handles numeric vs. string option coercion cleanly so all consumer bindings remain strongly typed.
3. **Rule Enforcement:** New dropdowns must reuse `<UiSelect>` (single-select), `<UiFilterMultiSelect>` (filter multi-select), or `<UiTagMultiSelect>` (project-scoped tag picker + inline creation). Native `<select>` is prohibited by review checklist (`grep -rn '<select' app/` must return 0 matches).

---

## Consequences

- **Good:** Every dropdown trigger and menu popup across Tasks, Analytics, Activity Tracker, Import, Onboarding, and Settings shares identical Orbital visual language, keyboard accessibility, and light/dark theme contrast.
- **Trade-off:** Portal-rendered `reka-ui` `SelectContent` inside `DialogContent` must use explicit z-index layering (`z-[60]`) above dialog backdrops (`z-50`).

---

## References

- ADR-0008: Orbital "Musk-Tech" Design System Evolution (`docs/adr/0008-orbital-musk-tech-design-system.md`)
- ADR-0009: Headless Accessible UI Primitives via `reka-ui` (`docs/adr/0009-headless-ui-primitives-reka-ui.md`)
- Component: `app/components/ui/Select.vue`

