import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createFieldLayout } from '../src/scene/layout.js';
import { HeliostatField, HeliostatRig } from '../src/scene/heliostats.js';

test('every mirror starts facing up with finite, nonzero glazing transforms', () => {
  const materials = Object.fromEntries([
    'foundation', 'steel', 'darkSteel', 'white', 'brightSteel',
    'back', 'warning', 'rubber', 'mirror', 'edge',
  ].map(key => [key, new THREE.MeshStandardMaterial()]));
  const layout = createFieldLayout();
  const field = new HeliostatField(new THREE.Scene(), layout, materials);

  try {
    assert.ok(field.rigs.length > 0);
    for (const rig of field.rigs) {
      assert.equal(rig.azimuth, 0, `${rig.id} azimuth`);
      assert.equal(rig.altitude, Math.PI / 2, `${rig.id} altitude`);
      for (const pivot of [rig.root, rig.azimuthPivot, rig.altitudePivot]) {
        assert.ok(pivot.matrixWorld.elements.every(Number.isFinite), `${rig.id} transform`);
      }
      const normal = rig.getNormal();
      assert.ok(normal.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12, `${rig.id} normal`);
    }

    let mirrorInstances = 0;
    const matrix = new THREE.Matrix4();
    for (const sector of field.sectors) {
      const mirror = sector.meshes.find(mesh => mesh.material === sector.material);
      assert.ok(mirror.visible);
      mirrorInstances += mirror.count;
      for (let index = 0; index < mirror.count; index += 1) {
        mirror.getMatrixAt(index, matrix);
        assert.ok(matrix.elements.every(Number.isFinite));
        assert.ok(Math.abs(matrix.determinant() - 1) < 1e-6);
      }
    }
    assert.equal(mirrorInstances, layout.positions.length);
  } finally {
    field.dispose();
    Object.values(materials).forEach(material => material.dispose());
  }
});

test('reset restores the upward pose after manual rig adjustments', () => {
  const rig = new HeliostatRig({ ...createFieldLayout().positions[0], index: 0 });
  rig.setPose({ azimuth: -0.75, altitude: 0.25 });
  assert.equal(rig.azimuth, -0.75);
  assert.equal(rig.altitude, 0.25);
  rig.reset();
  assert.equal(rig.azimuth, 0);
  assert.equal(rig.altitude, Math.PI / 2);
  assert.ok(rig.altitudePivot.matrixWorld.elements.every(Number.isFinite));
});
