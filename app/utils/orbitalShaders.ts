/**
 * V3 Photorealistic GLSL shaders for the unified adaptive Three.js orbital scene:
 * - Low-Earth-Orbit Night Earth (6-octave ridged continents, Voronoi highway webs,
 *   incandescent amber megacities, cloud-occluded light diffusion, tight Karman-line limb)
 * - Moonlit Stratocumulus Cloud Deck
 * - Physical 1.55% Karman-line BackSide Rayleigh + Mie Atmosphere Halo
 * - 1,200 Interactive Gaussian Spectral Stars
 * - Vacuum-lit Metallic Spacecraft, Translucent Ion Exhaust, Instanced Basalt Asteroids, & Trails
 */

const GLSL_NOISE_3D = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p.zxy, p.yxz + 19.19);
  return fract(p.x * p.y * p.z);
}

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float fbm4(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * vnoise3(p);
    p = p * 2.03 + vec3(17.1, 31.7, 11.3);
    amp *= 0.5;
  }
  return value;
}

float fbm6(vec3 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 6; i++) {
    value += amp * vnoise3(p);
    p = p * 2.06 + vec3(13.7, 29.3, 7.9);
    amp *= 0.5;
  }
  return value;
}
`;

export const ORBITAL_EARTH_VERT = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vLocalPos = normalize(position);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ORBITAL_EARTH_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIsDark;
uniform vec3 uOceanBase;
uniform vec3 uLandBase;
uniform vec3 uCityCore;
uniform vec3 uCityGlow;
uniform vec3 uRimPrimary;
uniform vec3 uRimCore;
uniform float uRimIntensity;

varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

${GLSL_NOISE_3D}

void main() {
  vec3 p = normalize(vLocalPos);
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(vViewDir);

  float ndotv = clamp(dot(n, v), 0.0, 1.0);

  // High-frequency 6-octave Low-Earth-Orbit continental topography & jagged coastlines
  vec3 warp = vec3(
    fbm4(p * 5.8 + vec3(1.2, 3.4, 0.7)),
    fbm4(p * 5.8 + vec3(5.8, 1.9, 4.3)),
    fbm4(p * 5.8 + vec3(2.1, 6.4, 8.2))
  );
  float continent = fbm6(p * 7.6 + warp * 0.92);
  float ridgeDetail = 1.0 - abs(vnoise3(p * 26.0) - 0.5) * 2.0;
  float elevation = continent + ridgeDetail * 0.055;

  float landMask = smoothstep(0.495, 0.535, elevation);
  float coastLine = smoothstep(0.018, 0.0, abs(elevation - 0.512));

  // Subtle moonlight glint on calm nocturnal oceans near the limb
  vec3 moonDir = normalize(vec3(0.24, 0.62, 0.74));
  vec3 halfVec = normalize(moonDir + v);
  float oceanSpec = pow(max(dot(n, halfVec), 0.0), 68.0) * (1.0 - landMask);

  vec3 surface = mix(uOceanBase, uLandBase * (0.85 + ridgeDetail * 0.35), landMask);
  surface += uRimPrimary * oceanSpec * (uIsDark > 0.5 ? 0.14 : 0.10);

  // Overhead cloud shadow mask for authentic light diffusion / occlusion
  float cloudShade = smoothstep(0.54, 0.78, fbm4(p * 11.5 + vec3(uTime * 0.004, 0.0, -uTime * 0.003)));

  if (uIsDark > 0.5) {
    // Multi-tier ISS city lights: coastal density + regional basins + highway webs + pinpoint hubs
    float coastBelt = smoothstep(0.48, 0.53, elevation) * smoothstep(0.70, 0.53, elevation);
    float regionPop = smoothstep(0.50, 0.74, fbm4(p * 18.0 + vec3(2.3, 8.1, 4.9)));
    float popMask = clamp(coastBelt * 1.3 + landMask * 0.45, 0.0, 1.0) * regionPop;

    // Ridged filamentary highway arteries linking metropolitan hubs
    float roadWaveA = 1.0 - abs(vnoise3(p * 130.0 + warp * 1.6) - 0.5) * 2.0;
    float roadWaveB = 1.0 - abs(vnoise3(p * 175.0 - warp * 1.1) - 0.5) * 2.0;
    float highways = pow(max(roadWaveA, 0.0), 12.0) * 0.45 + pow(max(roadWaveB, 0.0), 14.0) * 0.35;

    // Sharp pinpoint megacity cores & scattered towns
    float metroHub = smoothstep(0.66, 0.86, vnoise3(p * 82.0 + warp * 0.8));
    float citySparkle = pow(max(vnoise3(p * 260.0), 0.0), 7.5);
    float townScatter = pow(max(vnoise3(p * 420.0), 0.0), 11.0);

    float lightEnergy = popMask * (
      metroHub * (0.45 + citySparkle * 1.85) +
      highways * 0.55 +
      townScatter * 0.95
    );

    // Cloud occlusion dims lights softly; grazing atmospheric haze softens near horizon edge
    lightEnergy *= (1.0 - cloudShade * 0.62) * smoothstep(0.03, 0.24, ndotv);

    vec3 cityColor = mix(uCityGlow, uCityCore, smoothstep(0.18, 0.85, lightEnergy));
    surface += cityColor * lightEnergy * 1.65;
  } else {
    // Inverted Light Mode: clean architectural blueprint coastline & subtle cobalt metro hubs
    float regionPop = smoothstep(0.56, 0.76, vnoise3(p * 20.0));
    float nodes = pow(max(vnoise3(p * 210.0), 0.0), 8.0) * landMask * regionPop;
    surface = mix(surface, uRimPrimary, coastLine * 0.42);
    surface = mix(surface, uCityCore, clamp(nodes * 1.4, 0.0, 0.65) * smoothstep(0.06, 0.28, ndotv));
  }

  // Physically tight inner atmospheric horizon limb (keeps planet crisp & dark right to the rim)
  float upperMask = smoothstep(-0.14, 0.76, n.y);
  float shimmer = 0.94 + 0.06 * sin(n.x * 6.0 + uTime * 0.28);

  float broadScatter = pow(max(1.0 - ndotv, 0.0), 9.5) * upperMask * shimmer;
  float crispLimb = pow(max(1.0 - ndotv, 0.0), 28.0) * upperMask * shimmer;

  vec3 limbColor = mix(uRimPrimary, uRimCore, clamp(crispLimb * 1.45, 0.0, 1.0));
  surface = mix(surface, uRimPrimary * 0.42 + surface * 0.58, clamp(broadScatter * 0.55, 0.0, 0.65));
  surface += limbColor * (broadScatter * 0.52 + crispLimb * 1.48) * uRimIntensity;

  gl_FragColor = vec4(surface, 1.0);
}
`;

export const ORBITAL_CLOUDS_VERT = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vLocalPos = normalize(position);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ORBITAL_CLOUDS_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIsDark;
uniform vec3 uCloudColor;
uniform vec3 uRimPrimary;

varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

${GLSL_NOISE_3D}

void main() {
  vec3 p = normalize(vLocalPos);
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(vViewDir);

  float ndotv = clamp(dot(n, v), 0.0, 1.0);

  // High-frequency LEO stratocumulus & sheared jet-stream cloud wisps
  vec3 flowPos = vec3(p.x * 8.5 + uTime * 0.004, p.y * 13.5, p.z * 8.5 - uTime * 0.003);
  vec3 swirl = vec3(
    fbm4(flowPos * 1.2),
    fbm4(flowPos * 1.2 + vec3(4.2, 1.7, 6.1)),
    fbm4(flowPos * 1.2 + vec3(8.3, 5.4, 2.9))
  );
  float clouds = fbm6(flowPos * 1.75 + swirl * 0.95);
  float cloudMask = smoothstep(0.515, 0.77, clouds);

  // Moonlit silver-grey across disc, slight cool blue scatter only near grazing limb
  float limbEdge = pow(max(1.0 - ndotv, 0.0), 4.0);
  float horizonMask = smoothstep(-0.1, 0.72, n.y);
  vec3 color = mix(uCloudColor, uRimPrimary * 0.75 + uCloudColor * 0.25, limbEdge * (uIsDark > 0.5 ? 0.52 : 0.22));
  float alpha = cloudMask * mix(0.18, 0.78, limbEdge) * horizonMask * (uIsDark > 0.5 ? 0.36 : 0.50) * smoothstep(0.015, 0.12, ndotv);

  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.52));
}
`;

export const ORBITAL_ATMO_VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ORBITAL_ATMO_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIsDark;
uniform vec3 uAtmoHalo;
uniform vec3 uRimCore;
uniform float uRimIntensity;

varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(vViewDir);

  // For R_earth=42.0 and R_atmo=42.65, tangent grazing dot(-n, v) at the Earth limb is ~0.174.
  float backDot = clamp(dot(-n, v), 0.0, 1.0);
  float t = clamp(backDot / 0.174, 0.0, 1.0);

  float core = pow(t, 7.0);
  float rayleigh = pow(t, 2.3);
  float upperMask = smoothstep(-0.12, 0.72, n.y);
  float shimmer = 0.95 + 0.05 * sin(n.x * 6.0 + uTime * 0.32);

  float strength = (rayleigh * 0.62 + core * 1.15) * upperMask * shimmer * uRimIntensity * (uIsDark > 0.5 ? 1.28 : 0.58);
  vec3 color = mix(uAtmoHalo, uRimCore, clamp(core * 1.15, 0.0, 1.0));
  float alpha = clamp(strength, 0.0, uIsDark > 0.5 ? 0.94 : 0.42);

  gl_FragColor = vec4(color, alpha);
}
`;

export const ORBITAL_STARS_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aTemp;

uniform float uTime;
uniform float uPixelRatio;
uniform vec2 uPointer;

varying float vAlpha;
varying float vTemp;
varying float vProximity;

void main() {
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  vec4 clipPos = projectionMatrix * mvPos;
  vec2 ndc = clipPos.xy / max(clipPos.w, 0.0001);

  float distToPointer = length(ndc - uPointer);
  float proximity = smoothstep(0.32, 0.0, distToPointer);
  float twinkle = 0.76 + 0.24 * sin(uTime * (1.1 + aTemp * 1.3) + aPhase);

  vAlpha = clamp(twinkle + proximity * 0.50, 0.15, 1.25);
  vTemp = aTemp;
  vProximity = proximity;

  float sizeScale = aSize * (1.0 + proximity * 0.75) * uPixelRatio;
  gl_PointSize = clamp(sizeScale * (21.0 / max(-mvPos.z, 1.0)), 1.3, 14.0);
  gl_Position = clipPos;
}
`;

export const ORBITAL_STARS_FRAG = /* glsl */ `
precision highp float;

uniform float uIsDark;
uniform vec3 uStarColor;
uniform vec3 uRimCore;
uniform float uStarOpacity;

varying float vAlpha;
varying float vTemp;
varying float vProximity;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float dist = length(uv);
  if (dist > 0.5) discard;

  float core = exp(-dist * dist * 36.0);
  float halo = exp(-dist * dist * 10.0) * 0.30;
  float shape = core + halo;

  vec3 warmTint = vec3(1.0, 0.88, 0.72);
  vec3 tint = uIsDark > 0.5
    ? mix(uRimCore, mix(uStarColor, warmTint, smoothstep(0.68, 1.0, vTemp)), 0.68)
    : uStarColor;

  tint = mix(tint, uRimCore, vProximity * 0.55);

  float alpha = shape * vAlpha * uStarOpacity;
  gl_FragColor = vec4(tint, clamp(alpha, 0.0, 1.0));
}
`;

export const ORBITAL_CRAFT_VERT = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ORBITAL_CRAFT_FRAG = /* glsl */ `
precision highp float;

uniform float uIsDark;
uniform vec3 uCraftBody;
uniform vec3 uRimPrimary;
uniform vec3 uRimCore;

varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(vViewDir);

  // High-contrast vacuum lighting: crisp directional sun glint + subtle blue Earthshine below
  vec3 sunDir = normalize(vec3(0.60, 0.65, 0.45));
  vec3 earthDir = normalize(vec3(0.0, -1.0, 0.2));

  float sunDiff = max(dot(n, sunDir), 0.0);
  float earthShine = max(dot(n, earthDir), 0.0);
  float fresnel = pow(max(1.0 - clamp(dot(n, v), 0.0, 1.0), 0.0), 4.0);

  vec3 base = uCraftBody * (uIsDark > 0.5 ? 0.25 : 0.85);
  vec3 color = base
    + vec3(0.95, 0.97, 1.0) * pow(sunDiff, 1.4) * (uIsDark > 0.5 ? 0.62 : 0.35)
    + uRimPrimary * earthShine * (uIsDark > 0.5 ? 0.48 : 0.35)
    + uRimCore * fresnel * (uIsDark > 0.5 ? 0.35 : 0.22);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const ORBITAL_PLUME_VERT = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ORBITAL_PLUME_FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec3 uPlumeColor;
uniform vec3 uRimCore;

varying vec2 vUv;

void main() {
  float axial = clamp(vUv.y, 0.0, 1.0);
  float flicker = 0.90 + 0.10 * sin(uTime * 18.0 + vUv.y * 12.0);
  // Subtle translucent vacuum plume rather than bright arcade flame
  float intensity = pow(axial, 2.4) * flicker;
  vec3 color = mix(uPlumeColor, uRimCore, pow(axial, 3.6));
  gl_FragColor = vec4(color, clamp(intensity * 0.42, 0.0, 1.0));
}
`;

export const ORBITAL_ASTEROID_VERT = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

void main() {
  vLocalPos = normalize(position);
  #ifdef USE_INSTANCING
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  #else
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
  #endif
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const ORBITAL_ASTEROID_FRAG = /* glsl */ `
precision highp float;

uniform float uIsDark;
uniform vec3 uAsteroidBase;
uniform vec3 uAsteroidRim;
uniform vec3 uRimCore;

varying vec3 vLocalPos;
varying vec3 vWorldNormal;
varying vec3 vViewDir;

${GLSL_NOISE_3D}

void main() {
  vec3 n = normalize(vWorldNormal);
  vec3 v = normalize(vViewDir);

  float crater = fbm4(vLocalPos * 6.2);
  float grit = vnoise3(vLocalPos * 22.0);
  vec3 rock = uAsteroidBase * (0.58 + crater * 0.62 + grit * 0.16);

  // Harsh vacuum space terminator: dark unlit shadow side, crisp sunlight + subtle Earthshine rim
  vec3 sunDir = normalize(vec3(0.55, 0.72, 0.42));
  vec3 earthDir = normalize(vec3(0.0, -1.0, 0.2));

  float sunDiff = smoothstep(0.02, 0.85, dot(n, sunDir));
  float earthShine = max(dot(n, earthDir), 0.0);
  float fresnel = pow(max(1.0 - clamp(dot(n, v), 0.0, 1.0), 0.0), 5.2);

  vec3 color = rock * (0.08 + sunDiff * 0.92)
    + uAsteroidRim * earthShine * (uIsDark > 0.5 ? 0.24 : 0.28)
    + uRimCore * fresnel * (uIsDark > 0.5 ? 0.22 : 0.18);

  gl_FragColor = vec4(color, 1.0);
}
`;

export const ORBITAL_ARC_VERT = /* glsl */ `
attribute float aProgress;
varying float vProgress;

void main() {
  vProgress = aProgress;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ORBITAL_ARC_FRAG = /* glsl */ `
precision highp float;

uniform vec3 uArcColor;
uniform float uOpacity;

varying float vProgress;

void main() {
  float tail = pow(clamp(vProgress, 0.0, 1.0), 2.8);
  float headBoost = smoothstep(0.90, 1.0, vProgress) * 0.45;
  float alpha = (tail + headBoost) * uOpacity;
  gl_FragColor = vec4(uArcColor, clamp(alpha, 0.0, 1.0));
}
`;
