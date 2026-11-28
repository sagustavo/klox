import { describe, expect, it } from 'vitest';
import { getOrbitalPalette } from '../../app/utils/orbitalPalette';
import {
  isSoftwareWebGLRenderer,
  resolveOrbitalWebGLTier,
  type WebGLCapabilitySnapshot,
} from '../../app/utils/webglGate';

function createBaseSnapshot(
  overrides: Partial<WebGLCapabilitySnapshot> = {}
): WebGLCapabilitySnapshot {
  return {
    viewportWidth: 1440,
    prefersReducedMotion: false,
    saveData: false,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webgl2Supported: true,
    rendererString: 'ANGLE (Apple, Apple M3 Pro, OpenGL 4.1)',
    ...overrides,
  };
}

describe('webglGate — isSoftwareWebGLRenderer', () => {
  it('detects SwiftShader, llvmpipe, and Microsoft Basic Render Driver', () => {
    expect(isSoftwareWebGLRenderer('Google SwiftShader')).toBe(true);
    expect(isSoftwareWebGLRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))')).toBe(
      true
    );
    expect(isSoftwareWebGLRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareWebGLRenderer('Microsoft Basic Render Driver')).toBe(true);
    expect(isSoftwareWebGLRenderer('Apple Software Renderer')).toBe(true);
  });

  it('allows hardware GPUs and null/unknown strings', () => {
    expect(isSoftwareWebGLRenderer(null)).toBe(false);
    expect(isSoftwareWebGLRenderer('NVIDIA GeForce RTX 4070')).toBe(false);
    expect(isSoftwareWebGLRenderer('Apple M2')).toBe(false);
  });
});

describe('webglGate — resolveOrbitalWebGLTier', () => {
  it('selects desktop for capable desktop viewports (>= 1024px)', () => {
    expect(resolveOrbitalWebGLTier(createBaseSnapshot({ viewportWidth: 1024 }))).toBe(
      'desktop'
    );
    expect(resolveOrbitalWebGLTier(createBaseSnapshot({ viewportWidth: 1920 }))).toBe(
      'desktop'
    );
  });

  it('selects mobile for capable mobile/tablet viewports (< 1024px)', () => {
    expect(
      resolveOrbitalWebGLTier(createBaseSnapshot({ viewportWidth: 390, deviceMemory: 4 }))
    ).toBe('mobile');
    expect(
      resolveOrbitalWebGLTier(
        createBaseSnapshot({ viewportWidth: 768, deviceMemory: null })
      )
    ).toBe('mobile');
  });

  it('falls back to none on low-memory mobile devices (< 4 GB)', () => {
    expect(
      resolveOrbitalWebGLTier(createBaseSnapshot({ viewportWidth: 390, deviceMemory: 2 }))
    ).toBe('none');
  });

  it('falls back to none when prefers-reduced-motion, Save-Data, or low CPU cores is set', () => {
    expect(
      resolveOrbitalWebGLTier(createBaseSnapshot({ prefersReducedMotion: true }))
    ).toBe('none');
    expect(resolveOrbitalWebGLTier(createBaseSnapshot({ saveData: true }))).toBe('none');
    expect(
      resolveOrbitalWebGLTier(createBaseSnapshot({ hardwareConcurrency: 2 }))
    ).toBe('none');
    expect(
      resolveOrbitalWebGLTier(
        createBaseSnapshot({ viewportWidth: 390, hardwareConcurrency: 2 })
      )
    ).toBe('none');
  });

  it('falls back to none when WebGL2 is unavailable or software-rendered', () => {
    expect(resolveOrbitalWebGLTier(createBaseSnapshot({ webgl2Supported: false }))).toBe(
      'none'
    );
    expect(
      resolveOrbitalWebGLTier(
        createBaseSnapshot({ rendererString: 'Google SwiftShader' })
      )
    ).toBe('none');
    expect(
      resolveOrbitalWebGLTier(
        createBaseSnapshot({ viewportWidth: 390, rendererString: 'llvmpipe' })
      )
    ).toBe('none');
  });

  it('falls back to none on non-positive viewport widths', () => {
    expect(resolveOrbitalWebGLTier(createBaseSnapshot({ viewportWidth: 0 }))).toBe('none');
  });
});

describe('orbitalPalette — Dark & Inverted Light Mode', () => {
  it('provides ISS night-side Dark Mode and inverted alabaster/cobalt Light Mode palettes', () => {
    const dark = getOrbitalPalette(true);
    const light = getOrbitalPalette(false);

    expect(dark.isDark).toBe(true);
    expect(light.isDark).toBe(false);
    expect(dark.spaceBg[0]).toBe(0);
    expect(light.spaceBg[0]).toBeGreaterThan(0.95);
    expect(dark.oceanBase[0]).toBeLessThan(0.02);
    expect(light.oceanBase[0]).toBeGreaterThan(0.85);
    expect(dark.cityCore[0]).toBeGreaterThan(0.9);
    expect(dark.cityGlow[0]).toBeGreaterThan(0.9);
    expect(light.cityCore[2]).toBeGreaterThan(light.cityCore[0]);
    expect(dark.asteroidRim[2]).toBeGreaterThan(dark.asteroidRim[0]);
    expect(dark.rimPrimary).not.toEqual(light.rimPrimary);
  });
});
