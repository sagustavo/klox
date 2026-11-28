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

1. **Project-Bound Multi-Connections & Server-Only PAT Vault (Entra-Ready & Zero-ADC):**
   - Every Azure DevOps connection (`AdoConnectionSummary`) requires a 1:1 link to a non-system Klox `Project` (`kloxProjectId`), stored in `users/{uid}.adoConnections` (with backward-compatible read migration for legacy single `adoConnection`), and edited directly in Settings alongside an accessible show/hide PAT toggle.
   - Store an encrypted JSON token map (`{ v: 2, tokens: Record<connectionId, pat> }`) in `users/{uid}/secrets/azureDevOps` encrypted via `AES-256-GCM` with per-record HKDF-SHA256 keys (`NUXT_ADO_ENCRYPTION_KEY` kept strictly server-side) and `uid` bound as GCM AAD (with legacy v1 single-string decryption fallback).
   - Server BFF routes verify the caller's Firebase ID Token via `firebase-admin/auth` (using public Google JWK certificates) and persist/read `users/{uid}` and `users/{uid}/secrets/azureDevOps` over the **Cloud Firestore REST v1 API** (`server/utils/firestoreRest.ts`) authenticated with that verified ID token (`Authorization: Bearer <idToken>`). This eliminates any GCP Application Default Credentials (ADC / `@google-cloud/firestore`) dependency in local `nuxt dev` or non-GCP hosts.
   - Lock `users/{uid}/secrets/{secretId}` in `firestore.rules` to `secretId == 'azureDevOps'` for the owning `uid` only (`allow list: if false`), enforcing exact ciphertext envelope schema (`v == 1`, valid `authType`, base64 `salt`/`iv`/`tag`/`ciphertext`) so plaintext credentials can never be stored or decrypted client-side.
2. **Minimal Read/Write ADO Contract, 2-Level Sprint Import & Level-2 `Sub-subtask` Roll-Up:**
   - Nitro BFF endpoints (`/api/integrations/ado/*`) discover project iterations (`_apis/wit/classificationNodes/Iterations`), pre-select the active **Current Sprint**, and import strictly 2 levels assigned to `@Me` (`depth: 0` root items such as `PBI` / `Bug` / `User Story` + `depth: 1` child `Tasks` assigned to `@Me` or unassigned, plus parent context for `@Me`'s child tasks under other parents).
   - Newly imported tasks default `name` to `System.Title` (clamped safely to `200` chars) and display semantic Work Item Type icons (`Bug`, `PBI`, `US`, `Task`, `Feature`, `Epic`, `Issue`). Local custom renames are preserved on idempotent sprint re-fetches.
   - Level-2 `Sub-subtasks` remain strictly Klox-only and roll up via `resolveControllingAdoTask` to their nearest ADO-linked ancestor (e.g., the `depth: 1` `Subtask` representing the Azure `Task`), summing hours without leaking to `depth: 0` `PBI`s or generating false unplanned-task warnings.
   - `PATCH` operations update strictly `/fields/Microsoft.VSTS.Scheduling.CompletedWork` (`liveCompletedWork + approvedDeltaHours`) guarded by an optimistic `/rev` test patch.
3. **Zero-Drag Google-Tasks Workspace Split & Sibling Priority Stack (`sortOrder`):**
   - Split `/app/catalog` into `/app/projects` and `/app/tasks` (with `/app/catalog` redirecting).
   - Replace bulky multi-field task creation forms on `/app/tasks` with a single-line Google-Tasks inline composer (`Enter` rapid-create, `blur` auto-save, `Esc` dismiss, IME-safe), inline subtask creation beneath rows, click-to-edit titles, `Tab` / `Shift+Tab` indent/outdent (`computeTaskReparent`), 1-click completion circles, sparse midpoint `sortOrder` drag-and-drop, and auto-saving progressive Details (`Notes` + `Target Hours`).
   - Enable `+ Create tag` and `+ Create project` directly in `TagMultiSelect` and `ProjectTaskPopover` while keeping `Task` strictly selectable-only in pickers.
   - Unify UI copy to **Activity / Activities** (`Atividade / Atividades`) in `en.ts` and `pt-BR.ts` without breaking Firestore collection paths.

## Consequences

- **Good:** Zero secret exposure to the browser; zero unintended mutations to Azure DevOps titles, descriptions, or states; zero double-counting across incremental sync runs; zero Firestore migration cost for Activity terminology; clean Early Access + Demo Mode parity.
- **Trade-off:** Standard Azure DevOps Scrum teams must add the `Completed Work` field to their inherited Task process before pushing hours (surfaced clearly in-app before push); Microsoft Entra ID OAuth 2.0 remains a clean pluggable extension via `authType: 'entra_oauth'`.
