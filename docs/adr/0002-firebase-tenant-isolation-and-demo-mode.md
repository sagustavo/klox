# ADR-0002: Firebase v12 Tenant Isolation and Local Demo Fallback

- **Status:** Accepted
- **Date:** 2026-11-09
- **Phase:** Planning (D2, D7)

## Context

Klox is a multi-tenant SaaS where each user's projects, tags, tasks, active timer, and time logs are strictly private. At the same time, visitors on the landing page ("Try the live demo") and academic evaluators need to try the app immediately without creating an account or configuring cloud credentials.

## Decision

Use the **latest Firebase modular SDK (v12+)** with all user data stored under `users/{userId}/...` enforced by `firestore.rules` (`request.auth.uid == userId`). When Firebase environment variables are absent or `?demo=1` is active, stores fall back to a **`localStorage` implementation** behind the same data-access functions.

## Consequences

- **Good:** Path-level tenant isolation is simple to audit; demo mode works offline and in academic grading with zero setup.
- **Trade-off:** Two thin storage implementations (`firestore` and `demo`) must be kept in sync on data shapes.
