# ADR-0011: Customizable Keyboard Shortcuts and Instant-Start Timer Lifecycle

- **Status:** Accepted
- **Date:** 2026-11-24
- **Phase:** Phase 10 / FR-6.1 & FR-6.3

## Context

Klox's original timer bar required focusing the description field with `N`, typing, and explicitly pressing `Enter` or clicking **Start** before elapsed time began counting—losing seconds between task start and timer start. In addition, all keyboard shortcuts (`N`, `S`, `⌘I`, `⌘\`, `?`) were hardcoded inside individual components without a `Resume Last Logged Activity` command or user-configurable keybindings.

## Decision

1. **Instant-Start & Empty-Timer Discard (`FR-6.1`):** Pressing the `timer.new` shortcut (`N` by default) from any `/app/**` view invokes `timerStore.startInstantTimer()`, immediately starting `ActiveTimer` (`startTimeUTC = now`) with `allowEmptyDescription: true`, navigating to `/app` if needed, and focusing the command input. Live draft edits synchronize to `localStorage` immediately and debounce to Firestore (600 ms). Stopping (`S`) or cancelling (`Esc`) an active timer that satisfies `isEmptyActiveTimer` (blank description, unassigned project, no linked task, no tags) discards the timer cleanly without persisting an empty `TimeLog`.
2. **Pure Shortcut Registry & `UserPreferences` Persistence (`FR-6.3`):** Define all 6 command IDs (`timer.new`, `timer.stop`, `timer.resumeLast`, `timer.aiAutofill`, `ui.toggleSidebar`, `ui.toggleHelp`) and their normalization, capture, matching, conflict-detection, and single-key focus-guard rules in `app/domain/shortcuts.ts` (zero Vue/Firebase imports). Store only non-default overrides in `UserPreferences.keyboardShortcuts` (persisted in `localStorage` and Firestore `users/{uid}.preferences`, validated in `firestore.rules`), managed via `useShortcuts()` and a VS Code-style settings editor (`KeyboardShortcutsPanel.vue`), and wire workspace-wide timer actions once in `app/layouts/app.vue`.

## Consequences

- **Good:** Zero-lag single-keystroke time capture without polluting history on accidental `N` presses; single source of truth for dynamic shortcuts, keycap badges, conflict warnings, and `Resume Last Logged Activity` (`R`) across the entire authenticated workspace.
- **Trade-off:** Live draft changes on a running `ActiveTimer` debounce to Firestore over 600 ms rather than on every keystroke, while `localStorage` remains instantaneous; `firestore.rules` enforces type and size bounds (`<= 20` entries) on `keyboardShortcuts` while binding syntax sanitization lives in `app/domain/shortcuts.ts`.
