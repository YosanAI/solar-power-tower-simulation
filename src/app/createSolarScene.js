import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG } from '../scene/config.js';
import { createFieldLayout } from '../scene/layout.js';
import { createMaterials } from '../scene/materials.js';
import { createLandscape } from '../scene/landscape.js';
import { createTower } from '../scene/site/tower.js';
import { createPowerBlock } from '../scene/site/powerBlock.js';
import { createRoads } from '../scene/site/roads.js';
import { HeliostatField } from '../scene/heliostats.js';
import { Atmosphere } from '../scene/atmosphere.js';
import { FieldReflections } from '../scene/reflections.js';
import { disposeSceneResources } from './disposeScene.js';
import { clamp, radians } from '../utils/math.js';
import { getSolarDay, getSunPosition } from '../utils/solarTime.js';

export function createSolarScene({
  viewport,
  onReady,
  onError,
  onSunChange,
  onFrame,
  onDispose,
}) {
  const scene = new THREE.Scene();
  scene.name = 'SolarTowerScene';
  let needsRender = true;
  let disposed = false;
  let firstFrame = true;
  let lastFrameTime = null;
  let sunTimeMinutes = CONFIG.sunTimeMinutes;
  const solarDay = Object.freeze(getSolarDay(CONFIG.solarDay));
  const receiverTargetPos = Object.freeze({
    x: CONFIG.receiverCenter[0], y: CONFIG.receiverCenter[1], z: CONFIG.receiverCenter[2],
  });
  const invalidate = () => {
    needsRender = true;
  };

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute(
    'aria-label',
    'Orbit and zoom around the solar power tower',
  );
  renderer.domElement.tabIndex = 0;
  viewport.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.4,
    14500,
  );
  camera.position.set(-128, 8.2, 192);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 58, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 2;
  controls.maxDistance = 2200;
  controls.maxPolarAngle = Math.PI * 0.92;
  controls.screenSpacePanning = true;
  controls.zoomSpeed = 0.85;
  controls.update();
  controls.addEventListener('change', invalidate);

  const materials = createMaterials(renderer);
  const layout = createFieldLayout();
  const landscape = createLandscape(scene, materials, layout, renderer);
  createTower(scene, materials);
  createPowerBlock(scene, materials);
  createRoads(scene, materials, layout);

  const atmosphere = new Atmosphere(
    scene,
    renderer,
    landscape.ground,
    invalidate,
  );
  const field = new HeliostatField(scene, layout, materials, () => {
    invalidate();
    atmosphere.sun.shadow.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  });
  field.updateDetail(camera.position);
  const reflections = new FieldReflections(scene, renderer, field, atmosphere);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    invalidate();
  }

  function handleContextLost(event) {
    event.preventDefault();
    onError?.(
      new Error('The graphics context was interrupted. Reload the page'),
    );
  }

  window.addEventListener('resize', resize);
  const resetFrameClock = () => { lastFrameTime = null; };
  document.addEventListener('visibilitychange', resetFrameClock);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

  // Start with a coherent frame, then refine one reflection sector per frame.
  atmosphere.refreshEnvironment();
  reflections.request();

  renderer.setAnimationLoop(() => {
    if (disposed) return;
    const now = performance.now();
    if (!document.hidden) {
      const deltaTime = lastFrameTime === null ? 0 : (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      onFrame?.(deltaTime);
    } else {
      lastFrameTime = null;
    }
    controls.update();
    if (camera.position.y < 0.65) {
      camera.position.y = 0.65;
      invalidate();
    }
    if (field.updateDetail(camera.position)) {
      atmosphere.sun.shadow.needsUpdate = true;
      needsRender = true;
    }
    if (atmosphere.updateShadow(camera, controls.target)) {
      renderer.shadowMap.needsUpdate = true;
    }
    if (
      atmosphere.environmentDue &&
      performance.now() >= atmosphere.environmentDue &&
      reflections.pending < 0
    ) {
      atmosphere.refreshEnvironment();
      reflections.request();
      needsRender = true;
    }
    if (reflections.update()) needsRender = true;
    if (needsRender) {
      if (atmosphere.sun.shadow.needsUpdate)
        renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      needsRender = false;
      if (firstFrame) {
        firstFrame = false;
        onReady?.();
      }
    }
    window.solarReflectionsReady =
      reflections.pending < 0 && !atmosphere.environmentDue;
  });

  function notifySunChange() {
    onSunChange?.(atmosphere.azimuth, atmosphere.altitude, sunTimeMinutes);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    controls.removeEventListener('change', invalidate);
    controls.dispose();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', resetFrameClock);
    renderer.domElement.removeEventListener(
      'webglcontextlost',
      handleContextLost,
    );
    reflections.dispose();
    field.dispose();
    atmosphere.dispose();
    disposeSceneResources(scene, materials);
    renderer.dispose();
    renderer.domElement.remove();
    onDispose?.();
  }

  return Object.freeze({
    scene,
    camera,
    renderer,
    controls,
    heliostats: field.rigs,
    config: CONFIG,
    getHeliostat: (id) => field.get(id),
    getMirrorSnapshots: () => field.getMirrorSnapshots(),
    applyMirrorCommands: (commands) => field.applyCommands(commands),
    getSolarDay: () => solarDay,
    getReceiverTargetPos: () => ({ ...receiverTargetPos }),
    getSunData() {
      return {
        azimuth: radians(atmosphere.azimuth),
        elevation: radians(atmosphere.altitude),
        altitude: radians(atmosphere.altitude),
        ...(sunTimeMinutes === null ? {} : { timeMinutes: sunTimeMinutes }),
      };
    },
    setSunTime(minutes) {
      if (!Number.isFinite(minutes)) throw new TypeError('Solar time must be finite minutes.');
      sunTimeMinutes = clamp(minutes, solarDay.start, solarDay.end);
      const sun = getSunPosition(sunTimeMinutes, solarDay);
      atmosphere.setDegrees(sun.azimuth, sun.altitude);
      notifySunChange();
    },
    setSun(angles) {
      atmosphere.setSun(angles);
      sunTimeMinutes = null;
      notifySunChange();
    },
    setSunDegrees(azimuth, altitude) {
      atmosphere.setDegrees(azimuth, altitude);
      sunTimeMinutes = null;
      notifySunChange();
    },
    invalidate,
    dispose,
  });
}
