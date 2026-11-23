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
  - **Display (Wide/Orbital):** `"Michroma"` (`display-wide`) for brand marks (`KLOX ▪` / compact `K▪`), landing/in-app page titles, modal titles, and primary KPI totals.
  - **Body & Telemetry UI Sans:** `"Geist"`, `"Inter"`, sans-serif (`tracking-tight`) for high readability at `100%` display zoom, plus `.tabular-telemetry` (`font-variant-numeric: tabular-nums`) for live timers, durations, timestamps, and dashboard numbers.
  - **Keycap & Code Mono (Strictly Scoped):** `"JetBrains Mono"`, monospace reserved exclusively for keyboard keycap badges (`KeycapBadge`, e.g. `[N]`, `[S]`, `[Tab]`, `[⌘I]`) and technical code/CSV blocks.

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

### 2.5 Typography Unification, Cascade Fix & Kinetic Motion (Sprint 4 / UX-2.1 & UX-2.2)
- **CSS Layer Cascade Resolution:** `.display-wide`, `.tabular-telemetry`, and `.label-eyebrow` reside in `@layer components` inside `app/assets/css/tokens.css` (replacing `.label-mono` in `@layer utilities`), ensuring Tailwind `@layer utilities` letter-spacing classes (`tracking-[0.42em]`, `tracking-[0.32em]`, `tracking-[0.28em]`) never get overridden by `.display-wide`'s base `0.04em` tracking.
- **Font Hierarchy Unification:** `JetBrains Mono` is restricted strictly to `KeycapBadge` and code/CSV blocks; `Geist` (`tabular-nums`) renders all UI text, timers (`BrandTimerDigits`), durations, and dates; `Michroma` (`display-wide`) anchors brand marks, landing/in-app page titles, modal headers, and key KPI totals.
- **Kinetic Orbital Motion (Zero-CLS & Accessibility):**
  - `BrandTypewriterHeadline` reserves exact line dimensions via an invisible static mirror (`aria-hidden`) + `sr-only` text for zero CLS and full SSR/SEO output.
  - Below-the-fold landing sections (`[data-scroll-reveal]`) animate entry and exit using native CSS Scroll-Driven Animations (`animation-timeline: view()` declared after `animation` inside `@supports ((animation-timeline: view()) and (animation-range: entry))`) with a feature-detected `IntersectionObserver` fallback (`useScrollReveal.ts`) and `.motion-paused` / `prefers-reduced-motion` static rest guarantees.
  - Compositor-only `orbital-page` transitions, trigger-anchored `reka-ui` popover/dialog transitions (animating `scale` without overriding `-translate-x-1/2 -translate-y-1/2`), smooth `reka-ui` and native `::details-content` accordions, and tactile `:active` press micro-interactions run across the entire app.

### 2.6 Collapsible Orbital Sidebar & Content-First Chrome Reduction (Sprint 4 / UX-2.3)
- **3-State Desktop Sidebar (`AppSidebar.vue`):** Replaces the top horizontal workspace navbar at `>= 768px` with an Orbital left sidebar supporting `expanded` (`240px`), `collapsed` icon rail (`64px` with compact `K▪` mark and `reka-ui` right-side tooltips), and `hidden` (`0px` with floating reopen control), persisted in `localStorage` (`klox_sidebar_state`) and toggled via global `Cmd/Ctrl + \`.
- **Compact Mobile Navigation (`< 768px`):** Uses a `48px` (`< 12%` viewport height) single-row mobile header opening an accessible modal slide-over `reka-ui` `Dialog` drawer (`100svh`, inert backdrop, focus restoration, `Esc`/outside dismiss) layered cleanly at `z-50` above the mobile bottom timer dock (`z-40`).
- **Settings-Only Theme & In-App Language:** Theme selection (`Dark` / `Light` / `System`) lives exclusively in `/app/settings` (removed from app, landing, and auth headers), and in-app language selection lives exclusively in `/app/settings` while unauthenticated Landing (`/`, `/pt-br`) and Auth (`/login`) headers retain only a minimal `Globe` locale switcher. Sign Out renders as an icon-only control with `aria-label` and tooltip.

### 2.7 Seamless Command Timer Bar, Ghost Row Actions & Tag Label Fidelity (Sprint 4 / UX-2.4)
- **Borderless Command Timer Bar (`CommandTimerBar.vue`):** Consolidates the workspace capture strip into a borderless single-row desktop bar (and compact 2-row mobile dock) without status titles, redundant keycap rows, or a visible AI Auto-Fill button (`⌘I`/`Ctrl+I` triggers a sweeping top `.signal-line` scan animation). Pairs a borderless description input with `TimerProjectTaskPopover` (`variant="command"`), fine-pointer hover/click `UiTagMultiSelect` (`variant="command-icon"`), borderless `$` `UiBillableToggle` (`variant="command"`), modernized `BrandTimerDigits`, and an icon-only `Play`/`Square` action button.
- **Unified Ghost Row Actions (`.row-action-ghost`):** Standardizes non-billable, empty-tag, Continue (`Play`), and Delete (`Trash2`) tracker feed row controls on a borderless hover-reveal button pattern (`opacity: 0` at rest on desktop hover-capable pointers, revealed via `.group/row:hover`, `.group/row:focus-within`, and `:focus-visible`, and `opacity: 0.7` on `@media (hover: none)` touch devices).
- **Tag Label Fidelity:** Never prepends synthetic `#` characters to `ProjectTag` labels across feed rows, pickers, analytics charts/tables, catalog confirmations, CSV previews, or landing visuals (`#` renders only when entered by the user, while `#ID` remains scoped to external work item identifiers).

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
