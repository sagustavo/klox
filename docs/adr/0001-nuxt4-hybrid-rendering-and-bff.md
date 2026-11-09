# ADR-0001: Nuxt 4 with Hybrid Rendering and Nitro BFF

- **Status:** Accepted
- **Date:** 2026-11-09
- **Phase:** Planning (D1, D4, D9)

## Context

The initial context specified Nuxt 3 with global `ssr: false`. As of 2026, Nuxt 3 is end-of-life, and FR-1 (public landing page in multiple locales) requires static HTML for search engines and social link previews, while the authenticated `/app/**` tracker remains a reactive client-side workspace that also needs a server route (`/api/ai/autofill`) to keep the Gemini API key off the client.

## Decision

Use **Nuxt 4** (`app/` directory) deployed on **Firebase App Hosting** with **hybrid `routeRules`**:
- Marketing routes (`/`, `/pt-br`) are **prerendered** at build time with zero Firebase client SDK in their bundle.
- Application routes (`/app/**`, `/login`) run as a **client-only SPA (`ssr: false`)**.
- **Nitro server routes** (`/api/ai/*`) act as the BFF for Gemini calls.

## Consequences

- **Good:** Fast, indexable landing pages and instant SPA navigation inside the app from a single codebase and deploy target.
- **Trade-off:** Requires App Hosting (or Vercel) instead of static-only Firebase Hosting, and auth-dependent header CTAs on the landing page must hydrate inside `<ClientOnly>`.
