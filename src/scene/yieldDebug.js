import * as THREE from 'three';

const RAY_LAYER = 31;
const COLORS = {
  incidence: 0xffd54f,
  reflection: 0xff4040,
  normal: 0x39d5ff,
};

function copyVector(target, value) {
  return Array.isArray(value) || ArrayBuffer.isView(value)
    ? target.fromArray(value)
    : target.copy(value);
}

/** Batched world-space optical rays, isolated from shadows and environment probes. */
export class YieldDebug {
  constructor(scene, count, normalLength) {
    this.capacity = count;
    this.normalLength = normalLength;
    this.enabled = false;
    this.group = new THREE.Group();
    this.group.name = 'YieldDebug';
    this.group.visible = false;
    this.group.layers.set(RAY_LAYER);
    this.lines = {};
    this.center = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    for (const [name, color] of Object.entries(COLORS)) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(count * 6), 3)
          .setUsage(THREE.DynamicDrawUsage),
      );
      geometry.setDrawRange(0, 0);
      const material = new THREE.LineBasicMaterial({
        color, depthWrite: false, transparent: true,
        opacity: name === 'normal' ? 0.85 : name === 'reflection' ? 0.4 : 0.25,
      });
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = `YieldDebug/${name}`;
      lines.layers.set(RAY_LAYER);
      // Updated coordinates can extend outside the initial geometry bounds.
      lines.frustumCulled = false;
      this.lines[name] = lines;
      this.group.add(lines);
    }

    scene.add(this.group);
  }

  setEnabled(enabled, records) {
    if (typeof enabled !== 'boolean') throw new TypeError('Show rays must be a boolean.');
    this.enabled = enabled;
    if (records !== undefined) this.update(records);
    this.group.visible = this.enabled;
  }

  update(records) {
    if (records.length > this.capacity) {
      throw new RangeError('Debug ray records exceed the allocated mirror count.');
    }

    const incidence = this.lines.incidence.geometry.attributes.position;
    const reflection = this.lines.reflection.geometry.attributes.position;
    const normal = this.lines.normal.geometry.attributes.position;

    records.forEach((record, index) => {
      const { distanceMetres } = record;
      const center = copyVector(this.center, record.center);
      const start = index * 2;
      const end = start + 1;

      copyVector(this.direction, record.sunDirection).normalize().multiplyScalar(distanceMetres);
      incidence.setXYZ(start,
        center.x + this.direction.x,
        center.y + this.direction.y,
        center.z + this.direction.z);
      incidence.setXYZ(end, center.x, center.y, center.z);

      // Misses have the same full-length reflected segment as receiver hits.
      copyVector(this.direction, record.reflected).normalize().multiplyScalar(distanceMetres);
      reflection.setXYZ(start, center.x, center.y, center.z);
      reflection.setXYZ(end,
        center.x + this.direction.x,
        center.y + this.direction.y,
        center.z + this.direction.z);

      copyVector(this.direction, record.normal).normalize().multiplyScalar(this.normalLength);
      normal.setXYZ(start, center.x, center.y, center.z);
      normal.setXYZ(end,
        center.x + this.direction.x,
        center.y + this.direction.y,
        center.z + this.direction.z);
    });

    for (const lines of Object.values(this.lines)) {
      lines.geometry.attributes.position.needsUpdate = true;
      lines.geometry.setDrawRange(0, records.length * 2);
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const lines of Object.values(this.lines)) {
      lines.geometry.dispose();
      lines.material.dispose();
    }
  }
}
