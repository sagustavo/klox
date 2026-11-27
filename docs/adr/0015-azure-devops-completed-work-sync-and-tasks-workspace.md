# ADR-0015: Azure DevOps `CompletedWork` Sync, Server-Side PAT Vault, Split Projects/Tasks Workspaces & Drag-and-Drop Prioritization

- **Status:** Accepted
- **Date:** 2026-11-27
- **Phase:** Sprint 4 / FR-V1 (`AB#31`)

## Context

Work Item `AB#31` delivers Klox's flagship engineering integration with Azure DevOps while refining core workspace ergonomics:
1. Mixing Projects, Project-Scoped Tags, and 3-level Tasks into a single Catalog screen created clutter as task backlogs grew.
2. Users needed Toggl-style frictionless creation of missing Projects and Tags directly from picker inputs while keeping Task creation disciplined inside a dedicated priority board.
3. Engineers needed explicit sibling prioritization across Tasks, Subtasks, and Sub-subtasks (`Task.sortOrder`), intuitive `"Activity / Activities"` terminology in the UI without migrating Firestore `users/{uid}/timeLogs`, and strict guarantees around Azure DevOps synchronization:
   - PAT secrets must never reside in client storage or browser-readable Firestore paths.
   - Klox must only fetch `(System.Id, System.Title, System.WorkItemType, Microsoft.VSTS.Scheduling.CompletedWork)` and must **only** write `Microsoft.VSTS.Scheduling.CompletedWork` on existing items after explicit Human-in-the-Loop approval (never overwriting titles, descriptions, states, remaining work, or comments).
   - Standard Scrum projects lack `CompletedWork` until added on an inherited process, whereas Agile/CMMI include it natively.

## Decision

1. **Encrypted Server-Only PAT Vault (Entra-Ready Schema & Zero-ADC Persistence):**
   - Store encrypted PAT payloads (`{ v: 1, authType, salt, iv, tag, ciphertext, updatedAt }`) in `users/{uid}/secrets/azureDevOps` encrypted via `AES-256-GCM` with per-record HKDF-SHA256 keys (`NUXT_ADO_ENCRYPTION_KEY` kept strictly server-side) and `uid` bound as GCM AAD.
   - Server BFF routes verify the caller's Firebase ID Token via `firebase-admin/auth` (using public Google JWK certificates) and persist/read `users/{uid}` and `users/{uid}/secrets/azureDevOps` over the **Cloud Firestore REST v1 API** (`server/utils/firestoreRest.ts`) authenticated with that verified ID token (`Authorization: Bearer <idToken>`). This eliminates any GCP Application Default Credentials (ADC / `@google-cloud/firestore`) dependency in local `nuxt dev` or non-GCP hosts.
   - Lock `users/{uid}/secrets/{secretId}` in `firestore.rules` to `secretId == 'azureDevOps'` for the owning `uid` only (`allow list: if false`), enforcing exact ciphertext envelope schema (`v == 1`, valid `authType`, base64 `salt`/`iv`/`tag`/`ciphertext`) so plaintext credentials can never be stored or decrypted client-side.
   - Expose only masked non-sensitive metadata (`users/{uid}.adoConnection`, carrying `authType: 'pat' | 'entra_oauth'`) to the SPA, with strict SSRF organization URL allowlisting (`https://dev.azure.com/{org}` / `*.visualstudio.com`).
2. **Minimal Read/Write Azure DevOps Contract & Incremental Ledger:**
   - Nitro BFF endpoints (`/api/integrations/ado/*`) verify Firebase ID tokens and inspect Work Item Type field metadata dynamically (`supportsCompletedWork`, cached 5 minutes) to prevent `400 WITFieldNotSupported` errors on unmodified Scrum processes.
   - `PATCH` operations update strictly `/fields/Microsoft.VSTS.Scheduling.CompletedWork` (`liveCompletedWork + approvedDeltaHours`) guarded by an optimistic `/rev` test patch (with 1 automatic conflict retry). Unplanned Klox Tasks can create a minimal new ADO Work Item setting `System.Title` (+ optional initial `CompletedWork`).
   - Activities (`TimeLog`) record `adoSync: { workItemId, orgUrl, project, syncedSeconds, syncedAt }` and nearest-ancestor Task roll-up (`resolveControllingAdoTask`) prevents double-counting when subtasks have or inherit links.
3. **Workspace Split, Inline Creation & Sibling Priority Stack (`sortOrder`):**
   - Split `/app/catalog` into `/app/projects` (Projects, Project-Scoped Tags, per-Project ADO target override) and `/app/tasks` (3-level priority board with sparse midpoint `sortOrder` drag-and-drop and `Alt+ArrowUp`/`Alt+ArrowDown` keyboard reordering, keeping `/app/catalog` as a permanent redirect).
   - Enable `+ Create tag` and `+ Create project` directly in `TagMultiSelect` and `ProjectTaskPopover` while keeping `Task` strictly selectable-only in pickers.
   - Unify UI copy to **Activity / Activities** (`Atividade / Atividades`) in `en.ts` and `pt-BR.ts` without breaking Firestore collection paths.

## Consequences

- **Good:** Zero secret exposure to the browser; zero unintended mutations to Azure DevOps titles, descriptions, or states; zero double-counting across incremental sync runs; zero Firestore migration cost for Activity terminology; clean Early Access + Demo Mode parity.
- **Trade-off:** Standard Azure DevOps Scrum teams must add the `Completed Work` field to their inherited Task process before pushing hours (surfaced clearly in-app before push); Microsoft Entra ID OAuth 2.0 remains a clean pluggable extension via `authType: 'entra_oauth'`.
