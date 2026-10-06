import * as THREE from 'three';

const GLOW_LAYER = 30;
const ANIMATION_STRENGTH_THRESHOLD = 0.025;
const ANIMATION_INTERVAL_SECONDS = 1 / 24;
const WARM_LIGHT = new THREE.Color('#ff7026');
const HOT_LIGHT = new THREE.Color('#fff2d9');

const vertexShader = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    #include <logdepthbuf_vertex>
  }
`;

function glowMaterial(fragmentShader, extraUniforms = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      strength: { value: 0 },
      time: { value: 0 },
      lightColor: { value: HOT_LIGHT.clone() },
      ...extraUniforms,
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
}

const veilFragmentShader = `
  #include <logdepthbuf_pars_fragment>
  uniform float strength, time;
  uniform vec3 lightColor;
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  void main() {
    float ends = smoothstep(0.0, 0.085, vUv.y)
      * (1.0 - smoothstep(0.915, 1.0, vUv.y));
    float facing = max(dot(normalize(vWorldNormal),
      normalize(cameraPosition - vWorldPosition)), 0.0);
    float rim = pow(1.0 - facing, 2.0);
    // Very slight movement in the light, without flames or flickering tubes.
    float shimmer = 0.975 + 0.025 * sin(vUv.y * 31.0 - time * 1.8
      + sin(vUv.x * 28.0 + time * 0.7));
    float alpha = strength * ends * (0.065 + rim * 0.065) * shimmer;
    if (alpha < 0.00001) discard;
    gl_FragColor = vec4(lightColor, alpha);
    #include <logdepthbuf_fragment>
    #include <colorspace_fragment>
  }
`;

const coronaFragmentShader = `
  #include <logdepthbuf_pars_fragment>
  uniform float strength, time, cornerRadius, spread;
  uniform vec2 halfSize, receiverHalfSize;
  uniform vec3 lightColor;
  varying vec2 vUv;
  void main() {
    vec2 point = (vUv - 0.5) * 2.0 * halfSize;
    vec2 q = abs(point) - receiverHalfSize + cornerRadius;
    float distanceToReceiver = length(max(q, 0.0))
      + min(max(q.x, q.y), 0.0) - cornerRadius;
    // The opaque absorber supplies the white core. This is only its soft edge.
    float outside = smoothstep(-0.25, 0.25, distanceToReceiver);
    float halo = outside * exp(-max(distanceToReceiver, 0.0) / spread);
    float shimmer = 0.98 + 0.02 * sin(point.y * 1.9 - time * 1.1
      + sin(point.x * 2.1 + time * 0.8));
    float alpha = strength * halo * shimmer * 0.23;
    if (alpha < 0.00001) discard;
    gl_FragColor = vec4(lightColor, alpha);
    #include <logdepthbuf_fragment>
    #include <colorspace_fragment>
  }
`;

/** Local concentrated-sunlight glare; the absorbed-power model remains its owner. */
export class ReceiverGlow {
  constructor({
    scene, receiverPosition, receiverRadius, receiverHeight, material, fullPowerWatts,
  }) {
    if (![receiverRadius, receiverHeight, fullPowerWatts]
      .every(value => Number.isFinite(value) && value > 0)) {
      throw new RangeError('Receiver dimensions and full power must be positive finite values.');
    }
    if (!material?.emissive?.isColor || !Number.isFinite(material.emissiveIntensity)) {
      throw new TypeError('The receiver requires an emissive-capable material.');
    }

    this.position = new THREE.Vector3();
    if (Array.isArray(receiverPosition) || ArrayBuffer.isView(receiverPosition)) {
      this.position.fromArray(receiverPosition);
    } else {
      this.position.copy(receiverPosition);
    }
    if (!this.position.toArray().every(Number.isFinite)) {
      throw new TypeError('Receiver position must contain finite coordinates.');
    }

    this.material = material;
    this.originalEmissive = material.emissive.clone();
    this.originalEmissiveIntensity = material.emissiveIntensity;
    this.receiverRadius = receiverRadius;
    this.receiverHeight = receiverHeight;
    this.fullPowerWatts = fullPowerWatts;
    this.powerWatts = 0;
    this.normalizedPower = 0;
    this.time = 0;
    this.animationElapsed = 0;
    this.dirty = false;
    this.disposed = false;

    this.cameraPosition = new THREE.Vector3();
    this.cameraQuaternion = new THREE.Quaternion();
    this.lastCameraPosition = new THREE.Vector3();
    this.lastCameraQuaternion = new THREE.Quaternion();
    this.inverseCameraQuaternion = new THREE.Quaternion();
    this.hasCamera = false;
    this.viewAxis = new THREE.Vector3();
    this.viewDirection = new THREE.Vector3();
    this.localRotation = new THREE.Quaternion();
    this.localZ = new THREE.Vector3(0, 0, 1);

    this.group = new THREE.Group();
    this.group.name = 'ReceiverGlow';
    this.group.position.copy(this.position);
    this.group.layers.set(GLOW_LAYER);
    this.group.visible = false;
    this.group.userData = { powerWatts: 0, strength: 0 };

    // Outside the absorber tubes, open at both ends to leave the roof and decks dark.
    this.veil = new THREE.Mesh(
      new THREE.CylinderGeometry(receiverRadius + 0.18,
        receiverRadius + 0.18, receiverHeight * 0.994, 64, 1, true),
      glowMaterial(veilFragmentShader),
    );
    this.veil.name = 'ReceiverGlow/LightVeil';

    this.corona = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      glowMaterial(coronaFragmentShader, {
        halfSize: { value: new THREE.Vector2() },
        receiverHalfSize: { value: new THREE.Vector2(receiverRadius, receiverHeight / 2) },
        cornerRadius: { value: 0.15 },
        spread: { value: receiverRadius * 0.14 },
      }),
    );
    this.corona.name = 'ReceiverGlow/SoftCorona';
    // The halo sits at the receiver's depth, so foreground tower parts occlude it.
    this.corona.renderOrder = 1;

    for (const mesh of [this.veil, this.corona]) {
      mesh.layers.set(GLOW_LAYER);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
    scene.add(this.group);
    this.material.emissive.set(0);
    this.material.emissiveIntensity = 0;
  }

  /** Apply actual instantaneous absorbed watts, including immediate zero-power darkness. */
  setPower(powerWatts) {
    if (!Number.isFinite(powerWatts)) throw new TypeError('Receiver power must be finite watts.');
    if (this.disposed) return false;
    const nextPower = Math.max(0, powerWatts);
    if (nextPower === this.powerWatts) return false;
    this.powerWatts = nextPower;
    this.normalizedPower = Math.min(1, nextPower / this.fullPowerWatts);
    const strength = Math.pow(this.normalizedPower, 0.75);
    this.group.userData.powerWatts = nextPower;
    this.group.userData.strength = strength;

    this.material.emissive.copy(WARM_LIGHT)
      .lerp(HOT_LIGHT, Math.pow(this.normalizedPower, 0.45));
    this.material.emissiveIntensity = strength * 12;
    this.group.visible = nextPower > 0;
    for (const mesh of [this.veil, this.corona]) {
      mesh.material.uniforms.strength.value = strength;
      mesh.material.uniforms.lightColor.value.copy(this.material.emissive);
    }
    if (!this.group.visible) {
      this.material.emissive.set(0);
      this.time = 0;
      this.animationElapsed = 0;
    }
    this.dirty = true;
    return true;
  }

  /** Face the halo toward the view and return whether this frame needs rendering. */
  update(deltaSeconds, camera) {
    if (this.disposed) return false;
    const changed = this.dirty;
    this.dirty = false;
    if (!this.group.visible) return changed;

    let cameraChanged = false;
    if (camera) {
      camera.getWorldPosition(this.cameraPosition);
      camera.getWorldQuaternion(this.cameraQuaternion);
      cameraChanged = !this.hasCamera
        || !this.cameraPosition.equals(this.lastCameraPosition)
        || !this.cameraQuaternion.equals(this.lastCameraQuaternion);
    }
    if (cameraChanged) {
      this.hasCamera = true;
      this.lastCameraPosition.copy(this.cameraPosition);
      this.lastCameraQuaternion.copy(this.cameraQuaternion);
      this.viewDirection.copy(this.cameraPosition).sub(this.position).normalize();
      const elevation = Math.abs(this.viewDirection.y);
      const verticalProjection = Math.sqrt(Math.max(0, 1 - elevation * elevation));
      const projectedHalfHeight = this.receiverHeight * 0.5 * verticalProjection
        + this.receiverRadius * elevation;
      const padding = this.receiverRadius * 0.85;
      const uniforms = this.corona.material.uniforms;
      uniforms.receiverHalfSize.value.set(this.receiverRadius, projectedHalfHeight);
      uniforms.halfSize.value.set(this.receiverRadius + padding, projectedHalfHeight + padding);
      uniforms.cornerRadius.value = Math.max(0.15, this.receiverRadius * elevation);
      this.corona.scale.set(uniforms.halfSize.value.x, uniforms.halfSize.value.y, 1);

      // Also supports a rolled camera: align the long axis with projected world-up.
      this.inverseCameraQuaternion.copy(this.cameraQuaternion).invert();
      this.viewAxis.set(0, 1, 0).applyQuaternion(this.inverseCameraQuaternion);
      const rotation = Math.atan2(-this.viewAxis.x, this.viewAxis.y);
      this.localRotation.setFromAxisAngle(this.localZ, rotation);
      this.corona.quaternion.copy(this.cameraQuaternion).multiply(this.localRotation);
    }

    if (this.group.userData.strength > ANIMATION_STRENGTH_THRESHOLD) {
      const step = Number.isFinite(deltaSeconds) ? Math.max(0, Math.min(deltaSeconds, 0.1)) : 0;
      this.animationElapsed += step;
      if (this.animationElapsed >= ANIMATION_INTERVAL_SECONDS) {
        this.time += this.animationElapsed;
        this.animationElapsed = 0;
        for (const mesh of [this.veil, this.corona]) mesh.material.uniforms.time.value = this.time;
      }
    } else {
      // Small amounts of input still illuminate the surface, without an idle render loop.
      this.animationElapsed = 0;
    }
    // Shimmer follows frames the scene already needs; it never wakes an idle scene.
    return changed || cameraChanged;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const mesh of [this.veil, this.corona]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.material.emissive.copy(this.originalEmissive);
    this.material.emissiveIntensity = this.originalEmissiveIntensity;
  }
}
