# ADR-0016: Dual-Engine Progressive WebGL Landing Hero

- **Status:** Accepted
- **Date:** 2026-11-28
- **Phase:** Sprint 4 / UX-3.1 (`AB#90`)

## Context

Klox competes directly with Toggl Track and Clockify for developer and engineering-team mindshare. While Klox's core workspace (`/app/**`) wins on keyboard velocity (`N`, `Tab`, `⌘I`, `Enter`, `S`) and minimal battery/INP overhead, the marketing landing page (`/` and `/pt-br`) benefits from an unmistakable aerospace-telemetry first impression that reinforces the Orbital "Musk-Tech" Design System (ADR-0008). However, eagerly bundling `three` (~125–145 KB gz) onto mobile or low-power devices would threaten Lighthouse Mobile Performance (`>= 95`) and `< 2.0s` LCP, and running persistent WebGL inside `/app/**` would drain laptop batteries during 8-hour pinned-tab workdays.

## Decision

We adopt a **Unified Adaptive Three.js Progressive WebGL Architecture** scoped strictly to the marketing landing hero (`#top`) while enforcing a **Strict No-Go** on always-on WebGL or 3D charts inside `/app/**`:

1. **Static 2D Fallback (`0 KB` WebGL JS):** `klox-orbit.jpg` (`87 KB`, `fetchpriority="high"`) + `.bg-void-fade` renders immediately for LCP and remains permanent whenever `prefers-reduced-motion: reduce`, `motionPaused`, `saveData`, `hardwareConcurrency < 4`, mobile `deviceMemory < 4`, WebGL2 unavailability, or software rasterizers (`SwiftShader` / `llvmpipe`) are detected (`app/utils/webglGate.ts`).
2. **Single-Horizon Cross-Fade Takeover:** Once the Three.js scene finishes initializing (`ready` event), `klox-orbit.jpg` and `.bg-void-fade` smoothly cross-fade to `opacity: 0` while the WebGL canvas fades to `opacity: 1` (`1000ms`), guaranteeing strictly **one** cohesive Earth horizon (never a ghosted double horizon) and reverting instantaneously to `klox-orbit.jpg` on `webglcontextlost`.
3. **Single Unified Adaptive Three.js Engine (`OrbitalHorizonScene.client.vue`):** Consolidates Desktop and Mobile into one maintainable tree-shaken vanilla `three` scene lazily loaded post-LCP via `requestIdleCallback` (with `preload: false` and `prefetch: false` in `nuxt.config.ts`). Renders true Low-Earth-Orbit geometry (`R = 42.0`, physical `1.55%` Karman-line Rayleigh halo, 6-octave ridged continents, Voronoi highway webs, sharp amber megacities, moonlit clouds, `1,200` interactive spectral stars, 1 sleek distant orbital rocketship, 2 pinpoint satellites, and 5 tiny high-contrast basalt micro-asteroids):
   - **`desktop` profile (`>= 1024px`):** `dpr <= 1.5`, `60 FPS`, `160×120` Earth mesh, `1,200` stars, `5` asteroids, damped pointer parallax.
   - **`mobile` profile (`< 1024px`):** `dpr = 1.0`, hard `30 FPS` cap, vertical resize hysteresis, `72×48` Earth mesh, `650` stars, `4` asteroids.
4. **Shared Theme & Lifecycle Parity:** Shares `app/utils/orbitalPalette.ts` and `app/utils/orbitalShaders.ts`, supports Dark Mode and inverted Light Mode via `useColorMode()`, halts GPU work immediately on `Pause motion`, off-screen scroll (`IntersectionObserver`), and `document.hidden`, and disposes all GPU resources on unmount or `webglcontextlost`.

## Consequences

- **Good:** Delivers Linear/SpaceX-grade visual differentiation on `/` and `/pt-br` with true Low-Earth-Orbit photorealism, zero LCP/CLS regression, a single Three.js codebase to maintain, zero preload/prefetch leaks, zero `three` bytes in `/app/**` or `/login`, and full WCAG 2.2.2 motion/accessibility compliance.
- **Trade-off:** Capable mobile viewports (`>= 4 GB` RAM, hardware WebGL2) download the async `three-vendor` chunk post-LCP (`~129 KB gz`), offset by `0` preloads/prefetches, `requestIdleCallback` deferral, `30 FPS` throttling, and `dpr = 1.0` capping.

