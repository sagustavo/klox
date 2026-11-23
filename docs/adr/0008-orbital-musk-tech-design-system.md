# ADR-0008: Orbital "Musk-Tech" Design System Evolution

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** Gustavo Oliveira (Founder & Lead Architect)
- **Consulted:** Lovable Reference Design Exploration, SpaceX/Starlink/xAI Design Benchmarks

---

## 1. Context & Problem Statement

Initial POC UI implementations across Klox were built organically without a unified visual specification, leading to:
1. Inconsistent visual density and contrast between marketing, authentication, and in-app execution workspaces.
2. Under-leveraged brand identity—Klox's stated aesthetic inspiration ("Musk-tech: SpaceX, Starlink, xAI, Grok") was only partially captured in rudimentary monochrome tokens.
3. A successful Lovable design exploration produced reference components for the landing and auth flows demonstrating that clean typography (`Michroma`/`Eurostile` wide display + `Geist`/`Inter` body + `JetBrains Mono` telemetry), atmospheric void gradients, subtle hairline borders (`1px` with low opacity), and atmospheric blue signal accents create a simple, futuristic, and unique identity.

We need an overarching architectural decision that establishes this **Orbital Design System** not just as a one-off landing page coat of paint, but as the foundational design system across the **entire platform** (Marketing Landing, Authentication Shell, Command Timer Bar, Tracker Feed, Analytics Dashboard, Catalog, and Modals).

---

## 2. Decision

We establish the **Orbital "Musk-Tech" Design System** across the entire application with a staged adoption strategy:

### 2.1 Core Visual Tokens & Primitives
- **Void & Surface:** 
  - Pure Black Void (`#000000` dark / `#FAFAFA` light) for canvas depth.
  - Elevated cards & docks (`#0B0B0E` / `rgba(255,255,255,0.04)` dark; `#FFFFFF` light).
  - Subtle hairline borders (`1px solid rgba(255,255,255,0.08)` dark / `rgba(0,0,0,0.08)` light).
- **Atmospheric Blue Signal:**
  - One high-precision signal color (`#3B82F6` / `oklch(0.72 0.16 245)` dark, `#2563EB` light) used sparingly for active live timers, key interactive highlights, scanlines, and critical badges.
  - `signal-line`: `1px` atmospheric gradient lines (`linear-gradient(90deg, transparent, var(--signal), transparent)`) framing active modals, panels, and cards.
- **Typography Matrix:**
  - **Display (Wide/Orbital):** `"Michroma"`, `"Eurostile"`, or wide uppercase tracking (`tracking-[0.25em]` to `0.35em`) for macro titles, section headers, and brand logos.
  - **Body (UI Sans):** `"Geist"`, `"Inter"`, sans-serif (`tracking-tight`) for high readability at `100%` display zoom.
  - **Telemetry (Strict Mono):** `"JetBrains Mono"`, monospace with mandatory `font-variant-numeric: tabular-nums` for all live ticking digits, timestamps, durations, and keycap badges (`[N]`, `[S]`, `[Tab]`, `[⌘I]`).

### 2.2 Reusable Shared Components
1. `BrandKloxLogo`: Orbital wide-tracked geometric mark with signal dot.
2. `KeycapBadge`: Hardware-like keycaps with 3D pressed animation (`animate-press`) and hover active states.
3. `InstrumentPanel`: Framed cards with telemetry header, signal line, and grid backdrop.
4. `MissionClock`: High-precision live mission elapsed timer with millisecond telemetry.
5. `GoogleButton`: Strict Google identity compliant SVG button integrated with dark/light themes.

### 2.3 Two-Stage Rollout Strategy
- **Stage 1 (Sprint 3 / Phase 9 Foundation):**
  - Implement design tokens in `tailwind.config.ts` and `app/assets/css/tokens.css`.
  - Redesign public marketing landing page (`/`, `/pt-br`) and authentication shell (`/login`).
  - Introduce reusable keycaps, instrument cards, and orbital utilities.
- **Stage 2 (In-App Workspaces Alignment):**
  - Align in-app layout (`app/layouts/app.vue`), Command Timer Bar, and sticky mobile dock.
  - Apply 2-level grouping styling and telemetry cards to Analytics Dashboard (`app/pages/app/dashboard.vue`).
  - Align Catalog, Onboarding Checklist, and Modal dialogs with confirmation standards.

### 2.4 Implementation Refinements (Sprint 3 Rollout)
- **Tailwind v3 OKLCH Alpha Channels:** Core color tokens are exposed as space-separated OKLCH channel tuples (`--*-ch`) mapped via `'oklch(var(--*-ch) / <alpha-value>)'` in `tailwind.config.ts`, preserving utility alpha modifiers (`/10`, `/40`, `/60`) across `html.dark` and `html.light`.
- **Contrast Polarity & Scrims:** `--launch-bg` / `--launch-fg` invert cleanly across themes (`#FAFAFA`/`#09090B` in Dark, `#09090B`/`#FAFAFA` in Light); Light Mode strengthens `.bg-void-fade` (`88%` → `78%` → `95%` → `100%`) over `klox-orbit.jpg` and lowers `--text-muted` lightness to maintain WCAG AA contrast.
- **Font Fallback Metrics & Chart.js Compatibility:** A `'Michroma Fallback'` `@font-face` (`size-adjust` / ascent-override) minimizes CLS before `Michroma` swaps in, while `dashboard.vue` resolves Chart.js stroke/tick/grid colors to hex/`rgba()` values reactive to `useColorMode()` (avoiding `@kurkle/color` parse failures on OKLCH CSS custom properties).
- **Motion & Modal Accessibility:** Continuous orbital animations (`.animate-scan`, `.animate-press`, `.animate-blink`, `.animate-rise`) are gated behind `@media (prefers-reduced-motion: no-preference)` with a user Pause/Play toggle (`.motion-paused`), and `reka-ui` dialogs (`ConfirmDialog`, `HelpCommandSheet`) apply `overscroll-contain` for scroll containment.

---

## 3. Consequences

### Positive
- Unified, futuristic, and memorable brand identity differentiating Klox from generic SaaS time trackers.
- Design tokens become the single source of truth for both marketing and in-app views, eliminating UI discrepancies.
- Zero extra runtime overhead: CSS utility classes and Tailwind extensions preserve Nuxt 4's lightweight prerender and client performance targets.

### Negative / Trade-offs
- Requires migrating existing in-app pages in Stage 2 to ensure consistent typography and border contrasts.
- Must ensure custom display fonts (`Michroma`) load asynchronously without causing layout shifts (CLS) on prerendered landing routes.

---

## 4. References
- Living Product Backlog: `docs/product/backlog.md` (PBI `[UX-1.2]`)
- Lovable Reference Exploration: `https://id-preview--8692f9e9-340a-582f-ae00-1ede0103105e.lovable.app/`
- Reference assets: `/home/gustavo/Downloads/klox-lovable/`
