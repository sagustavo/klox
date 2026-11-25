# ADR-0013: Multi-Provider Authentication Linking (Google OAuth & Email/Password)

- **Status:** Accepted
- **Date:** 2026-11-25
- **Phase:** Phase 10 / FR-6.4 (`AB#27`)

## Context

Klox supports both Google OAuth and Email/Password authentication, but users were previously locked into whichever sign-in method they originally registered with. Attempting to sign in with Google for an account created with Email/Password triggers `auth/account-exists-with-different-credential`, while signing up with Email/Password for an existing Google account fails with `auth/email-already-in-use`. Additionally, Firebase's default Email Enumeration Protection restricts arbitrary `fetchSignInMethodsForEmail` queries, and in-app OAuth popups require popup-permissive COOP headers on `/app/**` routes.

## Decision

1. **Same-UID Modular Linking & Self-Lockout Guard:** Use Firebase v12 modular APIs (`linkWithCredential` + `EmailAuthProvider.credential`, `linkWithPopup` + `GoogleAuthProvider`, `reauthenticateWithPopup` on `auth/requires-recent-login`, and `unlink`) inside `useAuthStore` so both methods resolve to the exact same `uid` and `users/{uid}` Firestore tree. Enforce `connectedCount >= 2` before permitting `unlink` (both in `domain/auth.ts` and UI). Always call `currentUser.reload()` and refresh reactive `providers` and `useProfileStore().syncGooglePhotoUrl(...)` immediately after linking/unlinking.
2. **Non-Enumerating Guided Linking on `/login`:**
   - On `auth/account-exists-with-different-credential` during Google sign-in, hold `GoogleAuthProvider.credentialFromError(err)` strictly in memory (`pendingAuthCredential`, never `localStorage`), lock the email input, guide password sign-in, and automatically attach the Google credential via `linkWithCredential`.
   - On `auth/email-already-in-use` during Email/Password sign-up, provide a guided `"Verify with Google & Link Password"` action that signs in with Google, verifies `doEmailsMatch(googleUser.email, enteredEmail)` before calling `linkWithCredential`, and signs out any mismatched Google popup cleanly.
3. **COOP Headers on `/app/**`:** Add `'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'` to `/app`, `/app/**`, `/pt-br/app`, and `/pt-br/app/**` in `nuxt.config.ts` so `linkWithPopup` and `reauthenticateWithPopup` operate cleanly from `/app/settings`.

## Consequences

- **Good:** Eliminates single-provider lock-in without duplicating user records or leaking registered emails; preserves Google `photoURL` syncing and Demo Mode parity.
- **Trade-off:** Linking a password from `/app/settings` requires an email address on the Firebase Auth user and may prompt recent Google re-authentication if the session token is old.
