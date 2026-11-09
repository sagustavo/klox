# ADR-0003: Entity Identifier Strategy — Firestore Auto-IDs vs. UUIDv7

- **Status:** Accepted
- **Date:** 2026-11-09
- **Phase:** Planning (D8)

## Context

UUIDv7 was considered to optimize database indexing through time-ordered locality. That optimization applies to B-tree primary indexes in relational databases (PostgreSQL, MySQL/InnoDB). Cloud Firestore instead partitions documents and index entries across lexicographical key ranges; Google's Firestore best practices explicitly warn against monotonically increasing document IDs because they concentrate writes on a single tablet ("hotspotting"). Meanwhile, Toggl CSV imports need idempotency so re-importing the same file does not duplicate rows.

## Decision

- Use **Firestore native 20-char random auto-IDs** (`doc(collection(...)).id`, generated client-side with no network call) for interactive entities (`Project`, `ProjectTag`, `Task`, live/manual `TimeLog`).
- Use **deterministic SHA-256 hash IDs** derived from `(startTimeUTC, durationSeconds, normalizedDescription, projectName)` for CSV-imported `TimeLog` documents so re-imports overwrite idempotently while remaining uniformly distributed across key ranges.
- Reserve **UUIDv7** for any future relational (PostgreSQL) adapter in Phase 2+.

## Consequences

- **Good:** Follows Firestore's storage model (no hotspots), gives storage-level idempotency on CSV re-imports, and keeps `EntityId` as an opaque string so a future SQL store can adopt UUIDv7 without domain changes.
- **Trade-off:** Document IDs do not encode creation order; queries sort by the indexed `startTime` / `dateKey` fields instead (which we already store).
