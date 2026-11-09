# ADR-0005: Internationalization and User-Timezone Semantics

- **Status:** Accepted
- **Date:** 2026-11-09
- **Phase:** Planning (FR-3)

## Context

Klox launches in English (`en`) and Brazilian Portuguese (`pt-BR`), and must scale to new locales (such as Spanish `es` post-POC) without code changes. A naive `dateKey` computed from the browser's current timezone shifts a user's day boundaries when they travel, and storing translated strings for system entities (such as the fallback `"General / Unassigned"` project) locks them into whichever language created the account.

## Decision

Separate four concerns:
1. **UI copy:** `@nuxtjs/i18n` with lazy-loaded JSON files (`en.json` as typed source of truth). System entities store `systemKey: 'unassigned'` and translate on render; user-created names are never translated.
2. **Regional formatting:** a single `useFormat()` composable wrapping `Intl.*`. **Exception:** live timers and durations are engineering telemetry and always render `HH:MM:SS` in Latin digits (`tabular-nums`, JetBrains Mono) in every locale.
3. **Time semantics:** `UserPreferences` stores the user's IANA `timeZone` and `weekStartsOn`. Each `TimeLog` snapshots `timeZone` at write time and computes `dateKey` (`YYYY-MM-DD`) in that timezone via `@date-fns/tz`.
4. **Interop contracts:** Toggl CSV headers and date/time values always remain in Toggl's English specification.

## Consequences

- **Good:** Adding a locale is one JSON file + one config entry; traveling users keep consistent day buckets; CSV round-trips stay 100% Toggl-compatible.
- **Trade-off:** Changing timezone in Settings affects new logs only (historical logs keep their recorded day unless recalculated).
