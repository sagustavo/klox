export type OrbitalWebGLTier = 'none' | 'mobile' | 'desktop';

export const ORBITAL_DESKTOP_MIN_WIDTH = 1024;
export const ORBITAL_MIN_CORES = 4;
export const ORBITAL_MIN_MOBILE_MEMORY_GB = 4;

export interface WebGLCapabilitySnapshot {
  viewportWidth: number;
  prefersReducedMotion: boolean;
  saveData: boolean;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  webgl2Supported: boolean;
  rendererString: string | null;
}

const SOFTWARE_RENDERER_PATTERN =
  /swiftshader|llvmpipe|softpipe|software|microsoft basic render|apple software/i;

/**
 * Detects CPU-backed software WebGL rasterizers that burn main-thread/CPU cycles
 * and degrade Lighthouse / battery scores.
 */
export function isSoftwareWebGLRenderer(rendererString: string | null): boolean {
  if (!rendererString) return false;
  return SOFTWARE_RENDERER_PATTERN.test(rendererString);
}

/**
 * Pure capability resolver for the unified adaptive Three.js hero scene:
 * - 'none': static 2D klox-orbit.jpg fallback (0 KB WebGL JS)
 * - 'mobile': adaptive mobile profile (dpr 1.0, 30 FPS, reduced subdivisions)
 * - 'desktop': full desktop profile (dpr <= 1.5, 60 FPS, pointer parallax)
 */
export function resolveOrbitalWebGLTier(
  snapshot: WebGLCapabilitySnapshot
): OrbitalWebGLTier {
  if (
    snapshot.viewportWidth <= 0 ||
    snapshot.prefersReducedMotion ||
    snapshot.saveData ||
    !snapshot.webgl2Supported ||
    snapshot.hardwareConcurrency < ORBITAL_MIN_CORES ||
    isSoftwareWebGLRenderer(snapshot.rendererString)
  ) {
    return 'none';
  }

  if (snapshot.viewportWidth >= ORBITAL_DESKTOP_MIN_WIDTH) {
    return 'desktop';
  }

  if (
    snapshot.deviceMemory !== null &&
    snapshot.deviceMemory < ORBITAL_MIN_MOBILE_MEMORY_GB
  ) {
    return 'none';
  }

  return 'mobile';
}

interface NavigatorWithCapabilities extends Navigator {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
}

/**
 * Client-side browser capability & GPU probe. Short-circuits before creating any
 * WebGL2 context when reduced motion, Save-Data, or low CPU/memory already disqualifies WebGL.
 */
export function probeOrbitalWebGLTier(): OrbitalWebGLTier {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'none';
  }

  const nav = navigator as NavigatorWithCapabilities;
  const viewportWidth = window.innerWidth || 0;
  const prefersReducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const saveData = nav.connection?.saveData === true;
  const hardwareConcurrency =
    typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
      ? nav.hardwareConcurrency
      : ORBITAL_MIN_CORES;
  const deviceMemory =
    typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0
      ? nav.deviceMemory
      : null;

  // Short-circuit before probing a WebGL context if already disqualified.
  if (
    viewportWidth <= 0 ||
    prefersReducedMotion ||
    saveData ||
    hardwareConcurrency < ORBITAL_MIN_CORES ||
    (viewportWidth < ORBITAL_DESKTOP_MIN_WIDTH &&
      deviceMemory !== null &&
      deviceMemory < ORBITAL_MIN_MOBILE_MEMORY_GB)
  ) {
    return 'none';
  }

  let webgl2Supported = false;
  let rendererString: string | null = null;
  let probeCanvas: HTMLCanvasElement | null = null;
  let gl: WebGL2RenderingContext | null = null;

  try {
    probeCanvas = document.createElement('canvas');
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    gl = probeCanvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: true,
    });

    if (gl) {
      webgl2Supported = true;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const rawRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        rendererString = typeof rawRenderer === 'string' ? rawRenderer : null;
      } else {
        const fallbackRenderer = gl.getParameter(gl.RENDERER);
        rendererString = typeof fallbackRenderer === 'string' ? fallbackRenderer : null;
      }
    }
  } catch {
    webgl2Supported = false;
  } finally {
    if (gl) {
      try {
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      } catch {
        // Ignore cleanup errors on already-lost probe contexts.
      }
    }
    probeCanvas = null;
  }

  return resolveOrbitalWebGLTier({
    viewportWidth,
    prefersReducedMotion,
    saveData,
    hardwareConcurrency,
    deviceMemory,
    webgl2Supported,
    rendererString,
  });
}
