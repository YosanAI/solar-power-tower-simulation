import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, degrees, smoothstep, sunDirection } from '../utils/math.js';
import { getSolarDay, getSunPosition } from '../utils/solarTime.js';

/** Shared sky dome for the visible scene and its reflection environments. */
function createClearSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3() },
      day: { value: 1 },
      gold: { value: 0 },
      zenith: { value: new THREE.Color('#0969cc') },
      horizon: { value: new THREE.Color('#86bde9') },
      dusk: { value: new THREE.Color('#e99648') },
      night: { value: new THREE.Color('#06112b') },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    vertexShader: `varying vec3 worldPosition;
      void main(){vec4 world=modelMatrix*vec4(position,1.0);worldPosition=world.xyz;
      gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `
      uniform vec3 sunDirection,zenith,horizon,dusk,night;
      uniform float day,gold; varying vec3 worldPosition;
      void main(){
        vec3 d=normalize(worldPosition-cameraPosition);
        float h=max(d.y,0.0);
        vec3 sky=mix(horizon,zenith,pow(h,.34));
        float towardSun=pow(max(dot(d,sunDirection),0.0),8.0);
        float warm=gold*exp(-h*7.0)*(.24+.76*towardSun);
        sky=mix(sky,dusk,warm*.86);
        sky=mix(night*(.7+.3*(1.0-h)),sky,day);
        float angle=acos(clamp(dot(d,sunDirection),-1.0,1.0));
        float edge=max(fwidth(angle),.00008);
        float disk=1.0-smoothstep(.00465-edge,.00465+edge,angle);
        vec3 sunlight=mix(vec3(1.0,.96,.85),vec3(1.0,.50,.15),gold);
        sky+=sunlight*disk*7.0*smoothstep(-.015,.025,sunDirection.y);
        sky+=sunlight*.034*exp(-angle*angle/0.0015)*day;
        gl_FragColor=vec4(sky,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  sky.name = 'ClearBlueSky';
  sky.scale.setScalar(16000);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  return sky;
}

export class Atmosphere {
  constructor(scene, renderer, ground, onChange) {
    this.scene = scene;
    this.renderer = renderer;
    this.onChange = onChange;

    this.sky = createClearSky();
    scene.add(this.sky);
    scene.fog = null;

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.name = 'Sun';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 3200;
    this.sun.shadow.normalBias = 0.018;
    this.sun.shadow.bias = -0.00002;
    this.sun.shadow.autoUpdate = false;
    scene.add(this.sun, this.sun.target);

    this.hemisphereLight = new THREE.HemisphereLight(
      '#b5d9ff',
      '#655138',
      0.34,
    );
    this.hemisphereLight.name = 'SkyGroundFill';
    scene.add(this.hemisphereLight);

    this.environmentMapGenerator = new THREE.PMREMGenerator(renderer);
    this.environmentMapGenerator.compileCubemapShader();
    this.environmentScene = new THREE.Scene();
    this.environmentScene.add(this.sky.clone());
    this.environmentGround = new THREE.Mesh(
      ground.geometry,
      new THREE.MeshBasicMaterial({
        map: ground.material.map,
        vertexColors: true,
      }),
    );
    this.environmentScene.add(this.environmentGround);

    this.sunDirection = new THREE.Vector3();
    const initialSun = getSunPosition(CONFIG.sunTimeMinutes, getSolarDay(CONFIG.solarDay));
    this.setDegrees(initialSun.azimuth, initialSun.elevation);
  }

  /** Set the sun's azimuth and elevation in degrees. */
  setDegrees(azimuth, elevation) {
    if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) {
      throw new TypeError('Sun angles must be finite.');
    }

    this.azimuth = azimuth;
    this.elevation = clamp(elevation, -10, 89);
    this.sunDirection.set(...sunDirection(this.azimuth, this.elevation));

    const daylight = smoothstep(-7, 4, this.elevation);
    const directLight = smoothstep(-0.4, 6, this.elevation);
    const goldenHour = 1 - smoothstep(2, 21, this.elevation);
    const skyUniforms = this.sky.material.uniforms;
    skyUniforms.sunDirection.value.copy(this.sunDirection);
    skyUniforms.day.value = daylight;
    skyUniforms.gold.value = goldenHour;

    this.sun.intensity = 2.85 * directLight;
    this.sun.color
      .set('#fff9ee')
      .lerp(new THREE.Color('#ffb45c'), goldenHour * 0.8);
    this.hemisphereLight.intensity = 0.035 + 0.3 * daylight;
    this.hemisphereLight.color
      .set('#b4d5ff')
      .lerp(new THREE.Color('#4e6dbe'), 1 - daylight);
    this.scene.environmentIntensity = 0.07 + 0.65 * daylight;
    this.environmentGround.material.color.setScalar(0.07 + 0.93 * daylight);
    this.renderer.toneMappingExposure = 0.96;

    // Continuous day playback must not keep postponing the next environment.
    if (!this.environmentDue) this.environmentDue = performance.now() + 500;
    this.shadowKey = '';
    this.onChange?.();
    return this;
  }

  /** Set the sun's azimuth and elevation in radians. */
  setSun({ azimuth, elevation }) {
    return this.setDegrees(degrees(azimuth), degrees(elevation));
  }

  refreshEnvironment() {
    const previousEnvironment = this.environmentTarget;
    this.environmentTarget = this.environmentMapGenerator.fromScene(
      this.environmentScene,
      0,
      0.3,
      18000,
    );
    this.scene.environment = this.environmentTarget.texture;
    previousEnvironment?.dispose();
    this.environmentDue = 0;
  }

  updateShadow(camera, target) {
    const isLowCamera = camera.position.y < 60;
    const shadowCenter = isLowCamera
      ? camera.position.clone().lerp(target, 0.25)
      : target.clone();
    shadowCenter.y = 0;
    const shadowHalfSize = isLowCamera
      ? 105
      : camera.position.y < 180
        ? 245
        : 430;

    const shadowRight = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), this.sunDirection)
      .normalize();
    const shadowUp = new THREE.Vector3()
      .crossVectors(this.sunDirection, shadowRight)
      .normalize();
    const shadowTexelSize = (shadowHalfSize * 2) / 2048;
    const snappedRight =
      Math.round(shadowCenter.dot(shadowRight) / shadowTexelSize) *
      shadowTexelSize;
    const snappedUp =
      Math.round(shadowCenter.dot(shadowUp) / shadowTexelSize) *
      shadowTexelSize;
    const snappedCenter = shadowRight
      .multiplyScalar(snappedRight)
      .add(shadowUp.multiplyScalar(snappedUp))
      .addScaledVector(this.sunDirection, shadowCenter.dot(this.sunDirection));

    const shadowKey = [
      shadowHalfSize,
      ...snappedCenter.toArray().map((value) => value.toFixed(2)),
      this.azimuth,
      this.elevation,
    ].join(',');
    if (shadowKey === this.shadowKey) return false;
    this.shadowKey = shadowKey;

    this.sun.target.position.copy(snappedCenter);
    this.sun.position
      .copy(snappedCenter)
      .addScaledVector(this.sunDirection, 1500);
    Object.assign(this.sun.shadow.camera, {
      left: -shadowHalfSize,
      right: shadowHalfSize,
      top: shadowHalfSize,
      bottom: -shadowHalfSize,
    });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.normalBias = shadowHalfSize > 150 ? 0.055 : 0.014;
    this.sun.shadow.needsUpdate = true;
    return true;
  }

  dispose() {
    this.scene.environment = null;
    this.environmentTarget?.dispose();
    this.environmentMapGenerator.dispose();
    this.sun.shadow.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.environmentGround.material.dispose();
    this.sky.removeFromParent();
    this.sun.removeFromParent();
    this.sun.target.removeFromParent();
    this.hemisphereLight.removeFromParent();
  }
}
