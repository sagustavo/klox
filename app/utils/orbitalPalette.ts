export type RgbTuple = readonly [number, number, number];

export interface OrbitalThemePalette {
  isDark: boolean;
  spaceBg: RgbTuple;
  oceanBase: RgbTuple;
  landBase: RgbTuple;
  planetBase: RgbTuple;
  cityCore: RgbTuple;
  cityGlow: RgbTuple;
  cloudColor: RgbTuple;
  rimPrimary: RgbTuple;
  rimCore: RgbTuple;
  atmoHalo: RgbTuple;
  arcColor: RgbTuple;
  craftBody: RgbTuple;
  craftPlume: RgbTuple;
  asteroidBase: RgbTuple;
  asteroidRim: RgbTuple;
  starColor: RgbTuple;
  starOpacity: number;
  rimIntensity: number;
}

const DARK_PALETTE: OrbitalThemePalette = {
  isDark: true,
  spaceBg: [0.0, 0.0, 0.0], // Pure obsidian deep space
  oceanBase: [0.002, 0.005, 0.014], // Photographic nocturnal ocean
  landBase: [0.010, 0.016, 0.028], // Subtle dark nocturnal continent
  planetBase: [0.002, 0.005, 0.014],
  cityCore: [1.0, 0.910, 0.680], // #FFE8AD incandescent megacity core
  cityGlow: [0.980, 0.480, 0.120], // #FA7A1F sodium-amber urban sprawl
  cloudColor: [0.210, 0.270, 0.370], // Muted moonlit grey-silver clouds
  rimPrimary: [0.160, 0.480, 1.0], // #297AFF Rayleigh cobalt scatter
  rimCore: [0.840, 0.945, 1.0], // Photographic #D6F1FF Karman-line rim matching klox-orbit.jpg
  atmoHalo: [0.140, 0.450, 0.980], // Outer Rayleigh atmospheric scatter
  arcColor: [0.420, 0.720, 1.0],
  craftBody: [0.160, 0.190, 0.250], // Dark metallic aerospace alloy
  craftPlume: [0.420, 0.740, 1.0],
  asteroidBase: [0.032, 0.038, 0.048], // High-contrast volcanic basalt
  asteroidRim: [0.220, 0.520, 0.960], // Subtle blue Earthshine catchlight
  starColor: [0.930, 0.960, 1.0],
  starOpacity: 0.95,
  rimIntensity: 1.22,
};

const LIGHT_PALETTE: OrbitalThemePalette = {
  isDark: false,
  spaceBg: [0.980, 0.984, 0.992], // Alabaster daylight zenith
  oceanBase: [0.912, 0.946, 0.988], // Pale orbital sea
  landBase: [0.838, 0.892, 0.964], // Architectural silver landmass
  planetBase: [0.912, 0.946, 0.988],
  cityCore: [0.145, 0.388, 0.922], // #2563EB cobalt metro nodes
  cityGlow: [0.376, 0.647, 0.980], // #60A5FA blueprint glow
  cloudColor: [1.0, 1.0, 1.0], // Crisp sunlit cloud sheets
  rimPrimary: [0.145, 0.388, 0.922], // #2563EB cobalt horizon limb
  rimCore: [0.580, 0.780, 1.0],
  atmoHalo: [0.220, 0.460, 0.950],
  arcColor: [0.114, 0.306, 0.847],
  craftBody: [0.240, 0.300, 0.400],
  craftPlume: [0.145, 0.388, 0.922],
  asteroidBase: [0.400, 0.450, 0.530],
  asteroidRim: [0.145, 0.388, 0.922],
  starColor: [0.140, 0.240, 0.420],
  starOpacity: 0.42,
  rimIntensity: 1.0,
};

/**
 * Shared theme-reactive palette ensuring ISS photographic contrast in Dark Mode
 * and clean architectural daylight parity in inverted Light Mode.
 */
export function getOrbitalPalette(isDark: boolean): OrbitalThemePalette {
  return isDark ? DARK_PALETTE : LIGHT_PALETTE;
}
