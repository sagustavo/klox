# ADR-0010: Decoupled `ProjectTag` ID References Without `tagNamesSnapshot`

- **Status:** Accepted
- **Date:** 2026-11-22
- **Phase:** Phase 9 / FR-5.3

## Context

`TimeLog` documents previously stored both `tagIds: EntityId[]` and a denormalized `tagNamesSnapshot: string[]` array. When implementing `ProjectTag` renaming (`FR-5.3`), keeping `tagNamesSnapshot` would either require cascading batch rewrites across thousands of historical `TimeLog` documents in Cloud Firestore on every tag rename or leave stale tag labels in the tracker feed, dashboard charts/tables, and CSV exports.

## Decision

Remove `tagNamesSnapshot` from `TimeLog`, `TrackerLogGroup`, and `RecallTemplate`. Historical `TimeLog` records store only normalized `tagIds: EntityId[]`, while all UI surfaces (`TagMultiSelect`, Analytics Dashboard charts & breakdown tables) and Toggl CSV exports resolve live tag names by `tagId` against the hydrated `ProjectTag` catalog via `buildTagNameMap` / `resolveTagNames` at render or export time. In `firestore.rules`, `'tagNamesSnapshot'` is omitted from `hasRequiredFields` and remains tolerated as an optional legacy field so older Firestore documents stay readable and editable without migration.

## Consequences

- **Good:** Renaming a `ProjectTag` is a single O(1) write to `users/{uid}/tags/{tagId}` with zero fan-out writes to `timeLogs`, zero stale tag names across history/analytics/exports, and smaller `TimeLog` payloads.
- **Trade-off:** Render, aggregation, and CSV export paths require the catalog's `ProjectTag` list to resolve human-readable tag names; deleted tag IDs on historical logs are omitted from display rather than retaining tombstone strings.
