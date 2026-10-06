import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { MAX_MIRROR_COMMANDS, validateMirrorCommands } from '../src/app/mirrorCommands.js';
import { HeliostatField, HeliostatRig } from '../src/scene/heliostats.js';
import { createFieldLayout } from '../src/scene/layout.js';

const materialKeys = [
  'foundation', 'steel', 'darkSteel', 'white', 'brightSteel',
  'back', 'warning', 'rubber', 'mirror', 'edge',
];

function createTestField(onChange) {
  const materials = Object.fromEntries(materialKeys.map((key) => [
    key, new THREE.MeshStandardMaterial(),
  ]));
  const field = new HeliostatField(new THREE.Scene(), createFieldLayout(), materials, onChange);
  return {
    field,
    dispose() {
      field.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}

function assertFiniteBatches(field) {
  const meshes = [
    ...Object.values(field.standardFrameBatches).flat(),
    ...Object.values(field.detailedFrameBatches).flat(),
    ...field.sectors.flatMap((sector) => sector.meshes),
  ];
  for (const mesh of meshes) {
    assert.ok(mesh.instanceMatrix.array.every(Number.isFinite), mesh.name);
  }
}

test('command validation preserves per-mirror command order without mutating rigs', () => {
  const rig = new HeliostatRig({ id: 'A', index: 0, sector: 0, x: 1, z: 2 });
  const staged = validateMirrorCommands([
    { id: 'A', method: 'setAzimuth', value: 0.4 },
    { id: 'A', method: 'setElevation', value: 0.6 },
    { id: 'A', method: 'setPose', pose: { azimuth: 0.7 } },
  ], [rig]);
  assert.deepEqual(staged.get(rig), { azimuth: 0.7, altitude: 0.6 });
  assert.equal(rig.azimuth, 0);
  assert.equal(rig.altitude, Math.PI / 2);

  const reset = validateMirrorCommands([
    { id: 'A', method: 'setPose', pose: { azimuth: -0.3, elevation: 0.3 } },
    { id: 'A', method: 'reset' },
    { id: 'A', method: 'setAltitude', value: -1 },
  ], [rig]);
  assert.deepEqual(reset.get(rig), { azimuth: 0, altitude: 0 });
});

test('batch updates thousands of mirrors with one buffer upload and invalidation', () => {
  let invalidations = 0;
  const fixture = createTestField(() => { invalidations += 1; });
  const { field } = fixture;
  try {
    let uploads = 0;
    const flagBuffers = field.flagBuffers.bind(field);
    field.flagBuffers = () => { uploads += 1; flagBuffers(); };
    const commands = field.rigs.flatMap((rig, index) => [
      { id: rig.id, method: 'setAzimuth', value: index / 1000 },
      { id: rig.id, method: 'setElevation', value: Math.PI / 4 },
    ]);
    assert.equal(field.applyCommands(commands), field.rigs.length);
    assert.equal(invalidations, 1);
    assert.equal(uploads, 1);
    for (let index = 0; index < field.rigs.length; index += 1) {
      assert.equal(field.rigs[index].azimuth, index / 1000);
      assert.equal(field.rigs[index].altitude, Math.PI / 4);
    }
    assertFiniteBatches(field);

    assert.equal(field.applyCommands(commands), 0);
    assert.equal(field.applyCommands([]), 0);
    assert.equal(invalidations, 1);
    assert.equal(uploads, 1);
  } finally {
    fixture.dispose();
  }
});

test('any invalid command rejects the complete callback without a partial update', () => {
  let invalidations = 0;
  const fixture = createTestField(() => { invalidations += 1; });
  const { field } = fixture;
  const rig = field.rigs[0];
  try {
    const badCommands = [
      { id: 'missing', method: 'setAzimuth', value: 0.5 },
      { id: rig.id, method: 'turn', value: 0.5 },
      { id: rig.id, method: 'setAzimuth', value: NaN },
      { id: rig.id, method: 'setAzimuth', value: Infinity },
      { id: rig.id, method: 'setAltitude', value: '0.5' },
      { id: rig.id, method: 'setElevation' },
      { id: rig.id, method: 'setPose', pose: { azimuth: 0.6, elevation: NaN } },
      { id: rig.id, method: 'setPose', pose: { altitude: 0.4, elevation: 0.5 } },
      { id: rig.id, method: 'setPose', pose: null },
      { id: rig.id, method: 'setPose' },
      null,
    ];
    const matrices = field.sectors.map((sector) => sector.meshes.map((mesh) => (
      mesh.instanceMatrix.array.slice()
    )));
    for (const bad of badCommands) {
      assert.throws(() => field.applyCommands([
        { id: rig.id, method: 'setPose', pose: { azimuth: 0.2, elevation: 0.4 } },
        bad,
      ]));
      assert.equal(rig.azimuth, 0);
      assert.equal(rig.altitude, Math.PI / 2);
    }
    assert.equal(invalidations, 0);
    field.sectors.forEach((sector, sectorIndex) => {
      sector.meshes.forEach((mesh, meshIndex) => {
        assert.deepEqual(mesh.instanceMatrix.array, matrices[sectorIndex][meshIndex]);
      });
    });
    assert.throws(() => field.applyCommands({}), /array/);
    assert.throws(() => field.applyCommands(new Array(MAX_MIRROR_COMMANDS + 1)), /at most/);
  } finally {
    fixture.dispose();
  }
});

test('editor positions are rotation-axis intersections, independent of panel pose', () => {
  const fixture = createTestField();
  const { field } = fixture;
  try {
    const rig = field.rigs[0];
    const initial = field.getMirrorSnapshots()[0];
    assert.equal(initial.pos.x, rig.root.position.x);
    assert.equal(initial.pos.z, rig.root.position.z);
    assert.ok(Math.abs(initial.pos.y - 2.66) < 1e-12);
    field.applyCommands([{ id: rig.id, method: 'setPose', pose: { azimuth: 1.1, elevation: 0.3 } }]);
    const changed = field.getMirrorSnapshots()[0];
    assert.deepEqual(changed.pos, initial.pos);
    assert.equal(changed.azimuth, 1.1);
    assert.equal(changed.altitude, 0.3);
    assert.equal(changed.elevation, 0.3);
    assert.ok(rig.getMirrorCenter().distanceTo(rig.getRotationCenter()) > 0.2);

    changed.pos.y = -100;
    assert.ok(Math.abs(field.getMirrorSnapshots()[0].pos.y - 2.66) < 1e-12);
    field.group.position.set(5, 8, -2);
    const moved = field.getMirrorSnapshots()[0];
    assert.equal(moved.pos.x, initial.pos.x + 5);
    assert.equal(moved.pos.z, initial.pos.z - 2);
    assert.ok(Math.abs(moved.pos.y - 10.66) < 1e-12);
  } finally {
    fixture.dispose();
  }
});

test('individual mirror setters accept elevation and reject invalid angles atomically', () => {
  const rig = new HeliostatRig({ id: 'A', index: 0, sector: 0, x: 0, z: 0 });
  rig.setPose({ azimuth: 0.2, elevation: 0.4 });
  assert.equal(rig.altitude, 0.4);
  for (const bad of [NaN, Infinity, '0.2', null]) {
    assert.throws(() => rig.setPose({ azimuth: 0.9, altitude: bad }));
    assert.equal(rig.azimuth, 0.2);
    assert.equal(rig.altitude, 0.4);
  }
});
