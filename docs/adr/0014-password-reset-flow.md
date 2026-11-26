# ADR-0014: Self-Service Password Reset Flow with Anti-Enumeration & Locale Sync

- **Status:** Accepted
- **Date:** 2026-11-26
- **Phase:** Phase 10 / FR-6.5 (`AB#28`)

## Context

Email/Password users on `/login` had no self-service recovery path for forgotten passwords. Additionally, Firebase Auth's `auth.languageCode` was previously synced only inside `ensureFirebaseAuthListener()` using `UserPreferences.locale`, leaving unauthenticated visitors on `/login` or `/pt-br/login` vulnerable to receiving reset emails in the wrong language. Finally, password recovery must never confirm or deny whether an email address is registered, and should allow immediate sign-in after the reset link is completed regardless of whether Firebase's default hosted action page (`/__/auth/action`) or a custom Klox Action URL (`/login?mode=resetPassword&oobCode=...`) handles the token.

## Decision

1. **Explicit Route-Locale Synchronization:** `useAuthStore.sendPasswordReset` receives the active UI `locale` from `/login` and sets `fb.auth.languageCode = toFirebaseAuthLanguageCode(locale)` (`'pt-br'` → `'pt-BR'`, default `'en'`) immediately before invoking Firebase `sendPasswordResetEmail`.
2. **Non-Enumerating Confirmation Contract & Rate-Limit Guard:** Intercept `auth/user-not-found` via `isNonEnumeratingResetError(err)` so both existing and non-existent valid emails return `{ ok: true }` and render the same neutral confirmation message (*"If an account exists for `{email}`..."*), paired with a client-side 60-second resend cooldown. Only malformed email (`AUTH_INVALID_EMAIL`), throttling (`AUTH_TOO_MANY_REQUESTS`), or connectivity (`AUTH_NETWORK_ERROR`) surface as errors.
3. **Dual Completion Path (`continueUrl` + In-App `oobCode` Handler):** Pass `actionCodeSettings.url` targeting `${origin}${localePath('/login')}?reset=success` (falling back cleanly to `sendPasswordResetEmail` without `actionCodeSettings` on `unauthorized-continue-uri` / `invalid-continue-uri`). On `/login`, support both the `?reset=success` return banner from Firebase's hosted page and direct `/login?mode=resetPassword&oobCode=...` verification/confirmation (`verifyPasswordResetCode` + `confirmPasswordReset`), pre-filling the verified email so the user can sign in immediately.

## Consequences

- **Good:** Protects account privacy against email enumeration, guarantees localized `en` / `pt-BR` reset emails matching the `/login` UI toggle, works out of the box with Firebase's default hosted handler and supports future branded Action URLs without code changes, and preserves Demo Mode testing.
- **Trade-off:** Requires client-side email validation before submission since invalid inputs are rejected locally rather than sent to Firebase; expired or already-used `oobCode` links direct users cleanly back to the forgot-password form.
