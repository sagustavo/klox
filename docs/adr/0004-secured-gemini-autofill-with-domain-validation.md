# ADR-0004: Secured AI Auto-Fill with Server-Side Domain Validation

- **Status:** Accepted
- **Date:** 2026-11-09
- **Phase:** Planning (D3, D5)

## Context

Tier-2 AI Auto-Fill (`⌘I` / `Ctrl+I`) calls Gemini to predict `projectId`, `tagIds`, and `isBillable` from a task description. Exposing the endpoint without auth would let anyone burn API quota, hardcoding a model string risks breakage when Google deprecates model versions, and LLM outputs can hallucinate IDs that violate the domain invariant (*tags must belong to the selected project*).

## Decision

- Read the model ID from the **`GEMINI_MODEL` environment variable**, defaulting to the current Gemini Flash GA model.
- In `/api/ai/autofill`, **verify the Firebase ID token** via `firebase-admin` and apply a lightweight per-user rate limit.
- Use Gemini **Structured Outputs (`responseSchema`)**, then **re-validate on the server** that `projectId` exists in the user's catalog and filter `tagIds` to only those owned by `projectId`. Return machine-readable error codes (`AI_RATE_LIMITED`, `AI_UNAVAILABLE`, `AUTH_INVALID`) for client-side i18n translation.

## Consequences

- **Good:** Quota is protected, model upgrades require no code deploy, and the project-scoped tag invariant cannot be broken by the LLM.
- **Trade-off:** Requires `firebase-admin` credentials on the server runtime (provided natively by Firebase App Hosting).
