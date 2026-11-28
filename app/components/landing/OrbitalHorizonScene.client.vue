<script setup lang="ts">
import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  Mesh,
  NormalBlending,
  Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { getOrbitalPalette, type RgbTuple } from '~/utils/orbitalPalette';
import {
  ORBITAL_ARC_FRAG,
  ORBITAL_ARC_VERT,
  ORBITAL_ASTEROID_FRAG,
  ORBITAL_ASTEROID_VERT,
  ORBITAL_ATMO_FRAG,
  ORBITAL_ATMO_VERT,
  ORBITAL_CLOUDS_FRAG,
  ORBITAL_CLOUDS_VERT,
  ORBITAL_CRAFT_FRAG,
  ORBITAL_CRAFT_VERT,
  ORBITAL_EARTH_FRAG,
  ORBITAL_EARTH_VERT,
  ORBITAL_PLUME_FRAG,
  ORBITAL_PLUME_VERT,
  ORBITAL_STARS_FRAG,
  ORBITAL_STARS_VERT,
} from '~/utils/orbitalShaders';

const props = defineProps<{
  quality: 'desktop' | 'mobile';
  active: boolean;
  paused: boolean;
  isDark: boolean;
}>();

const emit = defineEmits<{
  ready: [];
  'context-lost': [];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isMobileQuality = computed(() => props.quality === 'mobile');
const MOBILE_FRAME_INTERVAL_MS = 1000 / 30; // Hard-capped 30 FPS mobile power budget
const REFERENCE_ORBIT_ASPECT = 1920 / 1088;
const EARTH_RADIUS = 120.0;
const CLOUDS_RADIUS = 120.12;
const ATMO_RADIUS = 120.8;
const CAP_THETA_LENGTH = Math.PI * 0.38;

function applyCoverCameraOffset(cam: PerspectiveCamera, width: number, height: number) {
  const aspect = width / height;
  cam.aspect = REFERENCE_ORBIT_ASPECT;
  if (aspect >= REFERENCE_ORBIT_ASPECT) {
    const fullW = width;
    const fullH = width / REFERENCE_ORBIT_ASPECT;
    cam.setViewOffset(fullW, fullH, 0, fullH - height, width, height);
  } else {
    const fullH = height;
    const fullW = height * REFERENCE_ORBIT_ASPECT;
    cam.setViewOffset(fullW, fullH, (fullW - width) * 0.5, 0, width, height);
  }
  cam.updateProjectionMatrix();
}

interface SatelliteRig {
  holder: Group;
  craft: Group;
  trail: Line;
  trailMat: ShaderMaterial;
  radius: number;
  speed: number;
  phase: number;
  span: number;
}

interface AsteroidState {
  basePos: Vector3;
  scale: number;
  rot: Vector3;
  rotSpeed: Vector3;
  driftPhase: number;
  driftAmp: number;
}

interface ShootingStarRig {
  line: Line;
  material: ShaderMaterial;
  startPos: Vector3;
  dir: Vector3;
  cycleSpeed: number;
  offset: number;
}

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let earthMesh: Mesh | null = null;
let cloudsMesh: Mesh | null = null;
let atmoMesh: Mesh | null = null;
let earthMaterial: ShaderMaterial | null = null;
let cloudsMaterial: ShaderMaterial | null = null;
let atmoMaterial: ShaderMaterial | null = null;
let starsMaterial: ShaderMaterial | null = null;
let craftMaterial: ShaderMaterial | null = null;
let plumeMaterial: ShaderMaterial | null = null;
let asteroidMaterial: ShaderMaterial | null = null;
let asteroidMesh: InstancedMesh | null = null;
let rocketGroup: Group | null = null;
let satellites: SatelliteRig[] = [];
let shootingStars: ShootingStarRig[] = [];
let asteroidStates: AsteroidState[] = [];

const dummyObj = new Object3D();
const rocketPos = new Vector3();
const rocketAhead = new Vector3();
const satWorldTarget = new Vector3();
const pointerNdc = new Vector2(-9, -9);
const pointerTarget = { x: 0, y: 0 };
const pointerCurrent = { x: 0, y: 0 };
const baseCameraPos = { x: 0, y: 1.35, z: 11.5 };

let resizeObserver: ResizeObserver | null = null;
let rafId: number | null = null;
let elapsedTime = 0;
let lastTimestamp = 0;
let lastDrawTimestamp = 0;
let lastWidth = 0;
let lastHeight = 0;
let hasEmittedReady = false;
let contextLost = false;

function toThreeColor(rgb: RgbTuple, target = new Color()): Color {
  return target.setRGB(rgb[0], rgb[1], rgb[2]);
}

function seededUnit(seed: number): number {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function createStarfieldGeometry(count: number): BufferGeometry {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const temps = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const u = seededUnit(i * 3 + 1);
    const v = seededUnit(i * 3 + 2);
    const r = 30 + seededUnit(i * 3 + 3) * 34;

    const theta = (u - 0.5) * Math.PI * 1.45;
    const phi = -0.1 + v * 1.02;

    positions[i * 3] = Math.sin(theta) * Math.cos(phi) * r;
    positions[i * 3 + 1] = Math.sin(phi) * r * 0.72 + 1.2;
    positions[i * 3 + 2] = -Math.cos(theta) * Math.cos(phi) * r + 4.0;

    const mag = seededUnit(i * 5 + 7);
    sizes[i] = mag > 0.94 ? 3.2 + mag * 1.7 : 1.25 + mag * 1.65;
    phases[i] = seededUnit(i * 7 + 11) * Math.PI * 2;
    temps[i] = seededUnit(i * 11 + 13);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
  geometry.setAttribute('aTemp', new Float32BufferAttribute(temps, 1));
  return geometry;
}

function createAsteroidGeometry(): BufferGeometry {
  const geo = new IcosahedronGeometry(1, 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = Math.sin(x * 3.1 + y * 2.4) * Math.cos(z * 2.9 - x * 1.7);
    const n2 = Math.cos(y * 5.2 - z * 4.3) * 0.14;
    const scale = 0.88 + n1 * 0.22 + n2;
    pos.setXYZ(i, x * scale, y * scale * 0.8, z * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

function createHorizonArcGeometry(
  radius: number,
  arcSpanRad: number,
  segments = 36
): BufferGeometry {
  const positions = new Float32Array((segments + 1) * 3);
  const progress = new Float32Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = t * arcSpanRad;
    positions[i * 3] = Math.cos(theta) * radius;
    positions[i * 3 + 1] = Math.sin(theta) * radius;
    positions[i * 3 + 2] = 0;
    progress[i] = t;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aProgress', new Float32BufferAttribute(progress, 1));
  return geometry;
}

function createShootingStarGeometry(length = 2.4, segments = 20): BufferGeometry {
  const positions = new Float32Array((segments + 1) * 3);
  const progress = new Float32Array(segments + 1);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    positions[i * 3] = 0;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = (t - 1) * length;
    progress[i] = t;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aProgress', new Float32BufferAttribute(progress, 1));
  return geometry;
}

function buildRocketship(
  hullMat: ShaderMaterial,
  exhaustMat: ShaderMaterial
): Group {
  const rocket = new Group();

  // Orient every component along +Z so lookAt(aheadPoint) aims the nosecone forward.
  const fuselage = new Mesh(new CylinderGeometry(0.052, 0.066, 0.72, 16), hullMat);
  fuselage.rotation.x = Math.PI / 2;
  rocket.add(fuselage);

  const fairing = new Mesh(new ConeGeometry(0.052, 0.24, 16), hullMat);
  fairing.rotation.x = Math.PI / 2;
  fairing.position.z = 0.48;
  rocket.add(fairing);

  const engineBell = new Mesh(new CylinderGeometry(0.036, 0.052, 0.1, 12), hullMat);
  engineBell.rotation.x = Math.PI / 2;
  engineBell.position.z = -0.4;
  rocket.add(engineBell);

  const finGeo = new BoxGeometry(0.11, 0.09, 0.012);
  for (let i = 0; i < 4; i++) {
    const fin = new Mesh(finGeo, hullMat);
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    fin.position.set(Math.cos(angle) * 0.078, Math.sin(angle) * 0.078, -0.28);
    fin.rotation.z = angle;
    rocket.add(fin);
  }

  // Faint vacuum ion exhaust plume extending backward along -Z
  const plume = new Mesh(new ConeGeometry(0.044, 0.48, 16, 1, true), exhaustMat);
  plume.rotation.x = -Math.PI / 2;
  plume.position.z = -0.66;
  rocket.add(plume);

  rocket.scale.setScalar(0.62);
  return rocket;
}

function buildSatellite(hullMat: ShaderMaterial): Group {
  const sat = new Group();
  const bus = new Mesh(new BoxGeometry(0.048, 0.036, 0.075), hullMat);
  sat.add(bus);

  const wingGeo = new BoxGeometry(0.18, 0.006, 0.05);
  const leftWing = new Mesh(wingGeo, hullMat);
  leftWing.position.x = -0.13;
  sat.add(leftWing);

  const rightWing = new Mesh(wingGeo, hullMat);
  rightWing.position.x = 0.13;
  sat.add(rightWing);

  return sat;
}

function sampleRocketTrajectory(t: number, out: Vector3): Vector3 {
  // Distant high-altitude orbital path across the right/upper-right sky
  const u = (t * 0.065) % 1;
  const x = -0.6 + u * 9.8;
  const y = 1.25 + Math.sin(u * Math.PI) * 1.15 - u * 0.25;
  const z = -5.4 + Math.sin(u * Math.PI * 0.85) * 2.4;
  return out.set(x, y, z);
}

function applyPalette(isDark: boolean) {
  const p = getOrbitalPalette(isDark);
  if (renderer) {
    renderer.setClearColor(toThreeColor(p.spaceBg), 1);
  }
  if (earthMaterial) {
    earthMaterial.uniforms.uIsDark!.value = p.isDark ? 1.0 : 0.0;
    toThreeColor(p.oceanBase, earthMaterial.uniforms.uOceanBase!.value as Color);
    toThreeColor(p.landBase, earthMaterial.uniforms.uLandBase!.value as Color);
    toThreeColor(p.cityCore, earthMaterial.uniforms.uCityCore!.value as Color);
    toThreeColor(p.cityGlow, earthMaterial.uniforms.uCityGlow!.value as Color);
    toThreeColor(p.rimPrimary, earthMaterial.uniforms.uRimPrimary!.value as Color);
    toThreeColor(p.rimCore, earthMaterial.uniforms.uRimCore!.value as Color);
    earthMaterial.uniforms.uRimIntensity!.value = p.rimIntensity;
  }
  if (cloudsMaterial) {
    cloudsMaterial.uniforms.uIsDark!.value = p.isDark ? 1.0 : 0.0;
    toThreeColor(p.cloudColor, cloudsMaterial.uniforms.uCloudColor!.value as Color);
    toThreeColor(p.rimPrimary, cloudsMaterial.uniforms.uRimPrimary!.value as Color);
  }
  if (atmoMaterial) {
    atmoMaterial.uniforms.uIsDark!.value = p.isDark ? 1.0 : 0.0;
    toThreeColor(p.atmoHalo, atmoMaterial.uniforms.uAtmoHalo!.value as Color);
    toThreeColor(p.rimCore, atmoMaterial.uniforms.uRimCore!.value as Color);
    atmoMaterial.uniforms.uRimIntensity!.value = p.rimIntensity;
    atmoMaterial.blending = p.isDark ? AdditiveBlending : NormalBlending;
    atmoMaterial.needsUpdate = true;
  }
  if (starsMaterial) {
    starsMaterial.uniforms.uIsDark!.value = p.isDark ? 1.0 : 0.0;
    toThreeColor(p.starColor, starsMaterial.uniforms.uStarColor!.value as Color);
    toThreeColor(p.rimCore, starsMaterial.uniforms.uRimCore!.value as Color);
    starsMaterial.uniforms.uStarOpacity!.value = p.starOpacity;
  }
  if (craftMaterial) {
    craftMaterial.uniforms.uIsDark!.value = p.isDark ? 1.0 : 0.0;
    toThreeColor(p.craftBody, craftMaterial.uniforms.uCraftBody!.value as Color);
    toThreeColor(p.rimPrimary, craftMaterial.uniforms.uRimPrimary!.value as Color);
    toThreeColor(p.rimCore, craftMaterial.uniforms.uRimCore!.value as Color);
  }
  if (plumeMaterial) {
    toThreeColor(p.craftPlume, plumeMaterial.uniforms.uPlumeColor!.value as Color);
    toThreeColor(p.rimCore, plumeMaterial.uniforms.uRimCore!.value as Color);
  }
  if (asteroidMaterial) {
    asteroidMaterial.uniforms.uIsDark!.value = p.isDark ? 1.0 : 0.0;
    toThreeColor(p.asteroidBase, asteroidMaterial.uniforms.uAsteroidBase!.value as Color);
    toThreeColor(p.asteroidRim, asteroidMaterial.uniforms.uAsteroidRim!.value as Color);
    toThreeColor(p.rimCore, asteroidMaterial.uniforms.uRimCore!.value as Color);
  }
  for (const sat of satellites) {
    toThreeColor(p.arcColor, sat.trailMat.uniforms.uArcColor!.value as Color);
    sat.trailMat.uniforms.uOpacity!.value = p.isDark ? 0.42 : 0.34;
  }
  for (const s of shootingStars) {
    toThreeColor(p.rimCore, s.material.uniforms.uArcColor!.value as Color);
  }
}

function renderFrame(dtSeconds: number) {
  if (!renderer || !scene || !camera || contextLost) return;

  elapsedTime += dtSeconds;

  if (earthMaterial) earthMaterial.uniforms.uTime!.value = elapsedTime;
  if (cloudsMaterial) cloudsMaterial.uniforms.uTime!.value = elapsedTime;
  if (atmoMaterial) atmoMaterial.uniforms.uTime!.value = elapsedTime;
  if (starsMaterial) {
    starsMaterial.uniforms.uTime!.value = elapsedTime;
    (starsMaterial.uniforms.uPointer!.value as Vector2).copy(pointerNdc);
  }
  if (plumeMaterial) plumeMaterial.uniforms.uTime!.value = elapsedTime;

  if (earthMesh) {
    earthMesh.rotation.y += dtSeconds * 0.0032;
  }
  if (cloudsMesh) {
    cloudsMesh.rotation.y += dtSeconds * 0.0046;
  }

  // Update sleek distant orbital rocketship
  if (rocketGroup) {
    sampleRocketTrajectory(elapsedTime, rocketPos);
    sampleRocketTrajectory(elapsedTime + 0.04, rocketAhead);
    rocketGroup.position.copy(rocketPos);
    rocketGroup.lookAt(rocketAhead);
    const u = (elapsedTime * 0.065) % 1;
    const visScale = Math.min(1, u * 10, (1 - u) * 10);
    rocketGroup.scale.setScalar(0.62 * Math.max(0.001, visScale));
  }

  // Update 2 pinpoint sunlit satellites gliding above Earth's upper horizon
  for (const sat of satellites) {
    const cycle = (sat.phase + elapsedTime * sat.speed) % 1;
    const theta = 1.44 + cycle * 0.26; // Sweeps smoothly across visible upper horizon arc
    const x = Math.cos(theta) * sat.radius;
    const y = Math.sin(theta) * sat.radius;
    sat.craft.position.set(x, y, 0);

    const aheadTheta = theta + (sat.speed >= 0 ? 0.01 : -0.01);
    satWorldTarget.set(Math.cos(aheadTheta) * sat.radius, Math.sin(aheadTheta) * sat.radius, 0);
    sat.holder.localToWorld(satWorldTarget);
    sat.craft.lookAt(satWorldTarget);

    sat.trail.rotation.z = theta - sat.span;
    const fadeEdge = Math.sin(cycle * Math.PI);
    sat.trailMat.uniforms.uOpacity!.value = (props.isDark ? 0.42 : 0.34) * fadeEdge;
  }

  // Update 4-5 tiny high-contrast basalt micro-asteroids in open peripheral space
  if (asteroidMesh) {
    for (let i = 0; i < asteroidStates.length; i++) {
      const st = asteroidStates[i]!;
      st.rot.x += dtSeconds * st.rotSpeed.x;
      st.rot.y += dtSeconds * st.rotSpeed.y;
      st.rot.z += dtSeconds * st.rotSpeed.z;

      const driftX = Math.sin(elapsedTime * 0.22 + st.driftPhase) * st.driftAmp;
      const driftY = Math.cos(elapsedTime * 0.19 + st.driftPhase) * st.driftAmp * 0.7;
      dummyObj.position.set(
        st.basePos.x + driftX + pointerCurrent.x * 0.16,
        st.basePos.y + driftY - pointerCurrent.y * 0.1,
        st.basePos.z
      );
      dummyObj.rotation.set(st.rot.x, st.rot.y, st.rot.z);
      dummyObj.scale.setScalar(st.scale);
      dummyObj.updateMatrix();
      asteroidMesh.setMatrixAt(i, dummyObj.matrix);
    }
    asteroidMesh.instanceMatrix.needsUpdate = true;
  }

  // Update periodic shooting stars
  for (const s of shootingStars) {
    const cycle = (elapsedTime * s.cycleSpeed + s.offset) % 1;
    if (cycle < 0.16) {
      const prog = cycle / 0.16;
      s.line.visible = true;
      s.line.position.copy(s.startPos).addScaledVector(s.dir, prog * 14.0);
      s.line.lookAt(rocketAhead.copy(s.line.position).add(s.dir));
      s.material.uniforms.uOpacity!.value = Math.sin(prog * Math.PI) * 0.78;
    } else {
      s.line.visible = false;
    }
  }

  // Smooth damped pointer parallax (desktop only)
  if (!isMobileQuality.value) {
    const lerpFactor = dtSeconds > 0 ? Math.min(1, dtSeconds * 4.2) : 1;
    pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * lerpFactor;
    pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * lerpFactor;
    camera.position.x = baseCameraPos.x + pointerCurrent.x * 0.22;
    camera.position.y = baseCameraPos.y - pointerCurrent.y * 0.1;
  } else {
    camera.position.set(baseCameraPos.x, baseCameraPos.y, baseCameraPos.z);
  }
  camera.lookAt(0, -0.35, -2.0);

  renderer.render(scene, camera);

  if (!hasEmittedReady) {
    hasEmittedReady = true;
    emit('ready');
  }
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastTimestamp = 0;
  lastDrawTimestamp = 0;
}

function tick(now: number) {
  if (!props.active || props.paused || contextLost) {
    stopLoop();
    return;
  }
  if (isMobileQuality.value) {
    if (lastDrawTimestamp !== 0 && now - lastDrawTimestamp < MOBILE_FRAME_INTERVAL_MS) {
      rafId = requestAnimationFrame(tick);
      return;
    }
    lastDrawTimestamp = now;
  }
  const dt = lastTimestamp ? Math.min(0.08, (now - lastTimestamp) / 1000) : 0;
  lastTimestamp = now;
  renderFrame(dt);
  rafId = requestAnimationFrame(tick);
}

function syncLoopState() {
  if (props.active && !props.paused && !contextLost) {
    if (rafId === null && renderer) {
      lastTimestamp = 0;
      lastDrawTimestamp = 0;
      rafId = requestAnimationFrame(tick);
    }
  } else {
    stopLoop();
  }
}

function handleResize(force = false) {
  if (!containerRef.value || !renderer || !camera) return;
  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  if (width <= 0 || height <= 0) return;

  // Ignore small vertical-only mobile address bar jitter while scrolling.
  if (
    !force &&
    isMobileQuality.value &&
    width === lastWidth &&
    Math.abs(height - lastHeight) < 120
  ) {
    return;
  }

  lastWidth = width;
  lastHeight = height;

  const dpr = isMobileQuality.value ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  if (starsMaterial) {
    starsMaterial.uniforms.uPixelRatio!.value = dpr;
  }
  applyCoverCameraOffset(camera, width, height);
  renderFrame(0);
}

function handlePointerMove(event: PointerEvent) {
  if (isMobileQuality.value || props.paused || !props.active || event.pointerType !== 'mouse') {
    return;
  }
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const nx = (event.clientX / w - 0.5) * 2;
  const ny = -(event.clientY / h - 0.5) * 2;
  pointerTarget.x = nx;
  pointerTarget.y = -ny;
  pointerNdc.set(nx, ny);
}

function handleContextLost(event: Event) {
  event.preventDefault();
  contextLost = true;
  stopLoop();
  emit('context-lost');
}

function initScene() {
  const container = containerRef.value;
  const canvas = canvasRef.value;
  if (!container || !canvas) return;

  const width = container.clientWidth || window.innerWidth || 1280;
  const height = container.clientHeight || window.innerHeight || 720;
  lastWidth = width;
  lastHeight = height;

  const mobile = isMobileQuality.value;
  const dpr = mobile ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.5);
  const palette = getOrbitalPalette(props.isDark);

  renderer = new WebGLRenderer({
    canvas,
    alpha: false,
    antialias: !mobile,
    depth: true,
    stencil: false,
    powerPreference: 'default',
  });
  renderer.setClearColor(toThreeColor(palette.spaceBg), 1);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);

  scene = new Scene();
  camera = new PerspectiveCamera(40, REFERENCE_ORBIT_ASPECT, 0.1, 300);
  camera.position.set(baseCameraPos.x, baseCameraPos.y, baseCameraPos.z);
  camera.lookAt(0, -0.35, -2.0);
  applyCoverCameraOffset(camera, width, height);

  // Layer 1 & 2: True Low-Earth-Orbit Horizon (R=120.0, Karman-line R_atmo=120.60)
  const earthGroup = new Group();
  earthGroup.position.set(2.0, -123.44, -4.5);
  scene.add(earthGroup);

  const earthSegW = mobile ? 72 : 144;
  const earthSegH = mobile ? 40 : 72;
  const shellSegW = mobile ? 64 : 112;
  const shellSegH = mobile ? 32 : 56;

  earthMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_EARTH_VERT,
    fragmentShader: ORBITAL_EARTH_FRAG,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
      uIsDark: { value: palette.isDark ? 1.0 : 0.0 },
      uOceanBase: { value: toThreeColor(palette.oceanBase) },
      uLandBase: { value: toThreeColor(palette.landBase) },
      uCityCore: { value: toThreeColor(palette.cityCore) },
      uCityGlow: { value: toThreeColor(palette.cityGlow) },
      uRimPrimary: { value: toThreeColor(palette.rimPrimary) },
      uRimCore: { value: toThreeColor(palette.rimCore) },
      uRimIntensity: { value: palette.rimIntensity },
    },
  });
  earthMesh = new Mesh(
    new SphereGeometry(EARTH_RADIUS, earthSegW, earthSegH, 0, Math.PI * 2, 0, CAP_THETA_LENGTH),
    earthMaterial
  );
  earthMesh.rotation.z = 0.16;
  earthGroup.add(earthMesh);

  cloudsMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_CLOUDS_VERT,
    fragmentShader: ORBITAL_CLOUDS_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uIsDark: { value: palette.isDark ? 1.0 : 0.0 },
      uCloudColor: { value: toThreeColor(palette.cloudColor) },
      uRimPrimary: { value: toThreeColor(palette.rimPrimary) },
    },
  });
  cloudsMesh = new Mesh(
    new SphereGeometry(CLOUDS_RADIUS, shellSegW, shellSegH, 0, Math.PI * 2, 0, CAP_THETA_LENGTH),
    cloudsMaterial
  );
  cloudsMesh.rotation.z = 0.12;
  earthGroup.add(cloudsMesh);

  atmoMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_ATMO_VERT,
    fragmentShader: ORBITAL_ATMO_FRAG,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: palette.isDark ? AdditiveBlending : NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uIsDark: { value: palette.isDark ? 1.0 : 0.0 },
      uAtmoHalo: { value: toThreeColor(palette.atmoHalo) },
      uRimCore: { value: toThreeColor(palette.rimCore) },
      uRimIntensity: { value: palette.rimIntensity },
    },
  });
  atmoMesh = new Mesh(
    new SphereGeometry(ATMO_RADIUS, shellSegW, shellSegH, 0, Math.PI * 2, 0, CAP_THETA_LENGTH),
    atmoMaterial
  );
  earthGroup.add(atmoMesh);

  // Layer 3: Interactive Spectral Starfield + Periodic Shooting Stars
  starsMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_STARS_VERT,
    fragmentShader: ORBITAL_STARS_FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: dpr },
      uPointer: { value: new Vector2(-9, -9) },
      uIsDark: { value: palette.isDark ? 1.0 : 0.0 },
      uStarColor: { value: toThreeColor(palette.starColor) },
      uRimCore: { value: toThreeColor(palette.rimCore) },
      uStarOpacity: { value: palette.starOpacity },
    },
  });
  const stars = new Points(createStarfieldGeometry(mobile ? 650 : 1200), starsMaterial);
  scene.add(stars);

  shootingStars = [];
  const shootSpecs = [
    { start: new Vector3(10.5, 5.2, -16), dir: new Vector3(-0.88, -0.34, 0.15).normalize(), speed: 0.1, offset: 0.22 },
    { start: new Vector3(5.0, 5.8, -20), dir: new Vector3(-0.78, -0.45, 0.1).normalize(), speed: 0.07, offset: 0.7 },
  ];
  for (const spec of shootSpecs) {
    const sMat = new ShaderMaterial({
      vertexShader: ORBITAL_ARC_VERT,
      fragmentShader: ORBITAL_ARC_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uArcColor: { value: toThreeColor(palette.rimCore) },
        uOpacity: { value: 0.78 },
      },
    });
    const sLine = new Line(createShootingStarGeometry(2.4, 20), sMat);
    sLine.visible = false;
    scene.add(sLine);
    shootingStars.push({
      line: sLine,
      material: sMat,
      startPos: spec.start,
      dir: spec.dir,
      cycleSpeed: spec.speed,
      offset: spec.offset,
    });
  }

  // Layer 4: Sleek Distant Rocketship + 2 Pinpoint Sunlit Satellites
  craftMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_CRAFT_VERT,
    fragmentShader: ORBITAL_CRAFT_FRAG,
    uniforms: {
      uIsDark: { value: palette.isDark ? 1.0 : 0.0 },
      uCraftBody: { value: toThreeColor(palette.craftBody) },
      uRimPrimary: { value: toThreeColor(palette.rimPrimary) },
      uRimCore: { value: toThreeColor(palette.rimCore) },
    },
  });

  plumeMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_PLUME_VERT,
    fragmentShader: ORBITAL_PLUME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uPlumeColor: { value: toThreeColor(palette.craftPlume) },
      uRimCore: { value: toThreeColor(palette.rimCore) },
    },
  });

  rocketGroup = buildRocketship(craftMaterial, plumeMaterial);
  scene.add(rocketGroup);

  const satConfigs = [
    { radius: 121.1, tiltX: -0.012, tiltY: 0.025, speed: 0.028, phase: 0.15, span: 0.018 },
    { radius: 121.65, tiltX: 0.015, tiltY: -0.02, speed: 0.021, phase: 0.62, span: 0.015 },
  ] as const;

  satellites = [];
  for (const cfg of satConfigs) {
    const holder = new Group();
    holder.rotation.set(cfg.tiltX, cfg.tiltY, 0);
    earthGroup.add(holder);

    const trailMat = new ShaderMaterial({
      vertexShader: ORBITAL_ARC_VERT,
      fragmentShader: ORBITAL_ARC_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uArcColor: { value: toThreeColor(palette.arcColor) },
        uOpacity: { value: palette.isDark ? 0.42 : 0.34 },
      },
    });
    const craft = buildSatellite(craftMaterial);
    const trail = new Line(
      createHorizonArcGeometry(cfg.radius, cfg.span, 32),
      trailMat
    );
    holder.add(trail);
    holder.add(craft);

    satellites.push({
      holder,
      craft,
      trail,
      trailMat,
      radius: cfg.radius,
      speed: cfg.speed,
      phase: cfg.phase,
      span: cfg.span,
    });
  }

  // Layer 5: 4-5 Tiny High-Contrast Basalt Micro-Asteroids in Far Flanks
  asteroidMaterial = new ShaderMaterial({
    vertexShader: ORBITAL_ASTEROID_VERT,
    fragmentShader: ORBITAL_ASTEROID_FRAG,
    uniforms: {
      uIsDark: { value: palette.isDark ? 1.0 : 0.0 },
      uAsteroidBase: { value: toThreeColor(palette.asteroidBase) },
      uAsteroidRim: { value: toThreeColor(palette.asteroidRim) },
      uRimCore: { value: toThreeColor(palette.rimCore) },
    },
  });

  const asteroidCount = mobile ? 4 : 5;
  asteroidMesh = new InstancedMesh(
    createAsteroidGeometry(),
    asteroidMaterial,
    asteroidCount
  );

  const asteroidPlacements: readonly Vector3[] = [
    new Vector3(4.2, 1.4, -4.5),
    new Vector3(6.8, 2.7, -7.2),
    new Vector3(8.1, 0.9, -5.8),
    new Vector3(3.5, 3.1, -8.5),
    new Vector3(-7.2, 2.5, -9.0),
  ];

  asteroidStates = [];
  for (let i = 0; i < asteroidCount; i++) {
    asteroidStates.push({
      basePos: asteroidPlacements[i]!,
      scale: 0.024 + seededUnit(i * 13 + 4) * 0.022,
      rot: new Vector3(
        seededUnit(i * 13 + 5) * Math.PI,
        seededUnit(i * 13 + 6) * Math.PI,
        seededUnit(i * 13 + 7) * Math.PI
      ),
      rotSpeed: new Vector3(
        (seededUnit(i * 13 + 8) - 0.5) * 0.45,
        (seededUnit(i * 13 + 9) - 0.5) * 0.52,
        (seededUnit(i * 13 + 10) - 0.5) * 0.38
      ),
      driftPhase: seededUnit(i * 13 + 11) * Math.PI * 2,
      driftAmp: 0.03 + seededUnit(i * 13 + 12) * 0.04,
    });
  }
  scene.add(asteroidMesh);

  canvas.addEventListener('webglcontextlost', handleContextLost, false);
  if (!mobile) {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
  }
  resizeObserver = new ResizeObserver(() => handleResize(false));
  resizeObserver.observe(container);

  renderFrame(0);
  syncLoopState();
}

function disposeScene() {
  stopLoop();
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener('pointermove', handlePointerMove);
  canvasRef.value?.removeEventListener('webglcontextlost', handleContextLost);

  if (scene) {
    scene.traverse((obj) => {
      const maybeMesh = obj as {
        geometry?: BufferGeometry;
        material?: { dispose: () => void } | Array<{ dispose: () => void }>;
      };
      maybeMesh.geometry?.dispose();
      if (Array.isArray(maybeMesh.material)) {
        maybeMesh.material.forEach((m) => m.dispose());
      } else {
        maybeMesh.material?.dispose();
      }
    });
  }

  asteroidMesh?.dispose();
  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
  earthMesh = null;
  cloudsMesh = null;
  atmoMesh = null;
  earthMaterial = null;
  cloudsMaterial = null;
  atmoMaterial = null;
  starsMaterial = null;
  craftMaterial = null;
  plumeMaterial = null;
  asteroidMaterial = null;
  asteroidMesh = null;
  rocketGroup = null;
  satellites = [];
  shootingStars = [];
  asteroidStates = [];
}

watch(
  () => [props.active, props.paused] as const,
  () => {
    syncLoopState();
  }
);

watch(
  () => props.isDark,
  (nextIsDark) => {
    applyPalette(nextIsDark);
    renderFrame(0);
  }
);

onMounted(() => {
  initScene();
});

onBeforeUnmount(() => {
  disposeScene();
});
</script>

<template>
  <div ref="containerRef" class="h-full w-full">
    <canvas ref="canvasRef" class="block h-full w-full" />
  </div>
</template>
