# ADR-0012: User Profile Management, Atomic Unique Usernames, Client-Resized Avatars & Backup-First Workspace Wipe

- **Status:** Accepted
- **Date:** 2026-11-25
- **Phase:** Phase 10 / FR-6.6 (`AB#29`)

## Context

Work Item `AB#29` introduces a dedicated User Profile workspace (`/app/profile`) where users edit `displayName`, claim a globally unique `@username`, manage a custom profile picture (with automatic Google OAuth `photoURL` fallback), inspect a year-at-a-glance Time-Tracking Activity Heatmap, and wipe all workspace data safely after an automatic backup download. Three constraints require explicit architectural decisions:

1. **Global username uniqueness under strict tenant isolation:** `users/{uid}` is owner-read-only (`request.auth.uid == userId`), so clients cannot query across `/users` to check or enforce handle uniqueness without breaking tenant privacy.
2. **Custom avatars without Cloud Storage / CORS setup:** `firebase.json` does not provision Cloud Storage buckets or `storage.rules`, and Demo Mode runs entirely locally without network buckets.
3. **Lossless workspace wipe recovery:** Existing Toggl CSV exports omit projects, project-scoped tags, and hierarchical tasks that have zero logged time entries, and `useTogglCsv.commitPreview` did not recreate tasks on re-import.

## Decision

1. **Atomic `usernames/{username}` reservation collection:** Reserve normalized handles (`3–24` chars, `[a-z0-9_-]`) in top-level `usernames/{username}` (`{ uid, createdAt }`) with `allow list: if false` to prevent scraping/enumeration. Profile updates execute inside a Firestore `runTransaction` (releasing any previous handle, claiming the new handle, and merging `users/{uid}`), backed by a conditional `getAfter()` cross-document check in `firestore.rules` triggered only when `username` is created or modified so `activeTimer`/`preferences`/`onboarding` updates incur zero extra reads.
2. **Client-resized raster avatar in `users/{uid}` with OAuth fallback:** Process uploaded images client-side on a `256×256` center-cropped `<canvas>` encoded as WebP (or JPEG fallback) `<= 120,000` chars, rejecting SVG/HTML payloads at both domain and Firestore Rules layers. Store `customAvatarUrl` on `users/{uid}` (and tenant `localStorage` for Demo Mode) while keeping Google `photoURL` separate so UI renders `customAvatarUrl || googlePhotoUrl || null` (`referrerpolicy="no-referrer"`).
3. **Backup-first wipe with lossless Toggl metadata rows:** Extend `serializeTogglCsv(..., { includeCatalogMetadata: true })` to append Toggl-compatible metadata rows for uncovered projects, tags, and 3-level tasks (`Parent / Subtask / Sub-subtask`), and extend `useTogglCsv.commitPreview` + `createTasksBatch` to restore tasks on re-import. `useWorkspaceWipe` fetches authoritative remote collections (bypassing Stage 2 streaming state), downloads the backup CSV first (aborting deletion on any failure), discards any running timer, batch-deletes all logs/tasks/tags/projects, and immediately re-provisions `General / Unassigned`.

## Consequences

- **Good:** Guarantees globally unique handles without exposing user PII or listing `/users`; works identically in Firebase and local Demo Mode with zero extra infrastructure; guarantees zero-loss data recovery after workspace wipe.
- **Trade-off:** Custom avatars share the `1 MiB` Firestore document budget (bounded safely at `<= 120 KB` via client re-encoding) and require deploying updated `firestore.rules`.
