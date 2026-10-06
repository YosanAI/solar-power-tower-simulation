import * as THREE from 'three';

/** Fixed world-space probes shared by each sector's mirrors. */
export class FieldReflections {
  constructor(scene, renderer, field, atmosphere) {
    this.scene = scene;
    this.renderer = renderer;
    this.field = field;
    this.atmosphere = atmosphere;

    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      type: THREE.HalfFloatType,
      generateMipmaps: false,
    });
    this.cubeCamera = new THREE.CubeCamera(1, 14000, this.cubeRenderTarget);
    scene.add(this.cubeCamera);

    this.sectorTargets = [];
    this.pending = -1;
    this.probePositions = [
      [0, 3.4, 180],
      [180, 3.4, 0],
      [0, 3.4, -180],
      [-180, 3.4, 0],
    ];
  }

  request() {
    this.pending = 0;
  }

  /** Capture one sector per frame to keep the sun sliders responsive. */
  update() {
    if (this.pending < 0) return false;

    const sectorIndex = this.pending;
    const sector = this.field.sectors[sectorIndex];
    const previousEnvironmentMaps = this.field.sectors.map(
      (item) => item.material.envMap,
    );

    // Capture against the sky environment to prevent recursive reflection feedback.
    for (const fieldSector of this.field.sectors) {
      fieldSector.material.envMap = this.scene.environment;
    }

    const shadowsWereEnabled = this.renderer.shadowMap.enabled;
    // The viewing camera's shadow coverage must not be baked into fixed probes.
    this.renderer.shadowMap.enabled = false;
    this.cubeCamera.position.set(...this.probePositions[sectorIndex]);
    this.cubeCamera.updateMatrixWorld(true);

    try {
      this.cubeCamera.update(this.renderer, this.scene);
      const sectorTarget = this.atmosphere.environmentMapGenerator.fromCubemap(
        this.cubeRenderTarget.texture,
      );
      sectorTarget.texture.name = `FixedMirrorEnvironment/${sectorIndex}`;
      this.sectorTargets[sectorIndex]?.dispose();
      this.sectorTargets[sectorIndex] = sectorTarget;
    } finally {
      this.renderer.shadowMap.enabled = shadowsWereEnabled;
      this.field.sectors.forEach((fieldSector, index) => {
        fieldSector.material.envMap = previousEnvironmentMaps[index];
      });
    }

    sector.material.envMap = this.sectorTargets[sectorIndex].texture;
    sector.material.needsUpdate = true;
    this.pending =
      sectorIndex + 1 === this.field.sectors.length ? -1 : sectorIndex + 1;
    return true;
  }

  dispose() {
    this.sectorTargets.forEach((target) => target.dispose());
    this.cubeRenderTarget.dispose();
    this.cubeCamera.removeFromParent();
  }
}
