import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { YieldDebug } from '../src/scene/yieldDebug.js';
import { CONFIG } from '../src/scene/config.js';
import { evaluateMirrorYield } from '../src/physics/yieldModel.js';

function record(overrides = {}) {
  return {
    center: new THREE.Vector3(10, 3, -20),
    normal: new THREE.Vector3(0, 1, 0),
    sunDirection: new THREE.Vector3(0.6, 0.8, 0),
    reflected: new THREE.Vector3(0, 0, -1),
    distanceMetres: 250,
    ...overrides,
  };
}

function endpoints(lines, index = 0) {
  const position = lines.geometry.attributes.position;
  return [
    new THREE.Vector3().fromBufferAttribute(position, index * 2),
    new THREE.Vector3().fromBufferAttribute(position, index * 2 + 1),
  ];
}

function closeVector(actual, expected) {
  assert.ok(actual.distanceTo(expected) < 1e-5,
    `${actual.toArray()} should equal ${expected.toArray()}`);
}

test('debug rays start hidden and use three colored batches on a dedicated camera layer', () => {
  const scene = new THREE.Scene();
  const debug = new YieldDebug(scene, 1000, 10);
  try {
    assert.equal(debug.enabled, false);
    assert.equal(debug.group.visible, false);
    assert.equal(debug.group.parent, scene);
    assert.equal(debug.group.children.length, 3);
    assert.equal(debug.lines.incidence.material.color.getHex(), 0xffd54f);
    assert.equal(debug.lines.reflection.material.color.getHex(), 0xff4040);
    assert.equal(debug.lines.normal.material.color.getHex(), 0x39d5ff);

    const probeCamera = new THREE.Camera();
    const viewCamera = new THREE.Camera();
    viewCamera.layers.enable(31);
    for (const lines of Object.values(debug.lines)) {
      assert.ok(lines.isLineSegments);
      assert.equal(lines.geometry.attributes.position.count, 2000);
      assert.equal(lines.geometry.drawRange.count, 0);
      assert.equal(lines.layers.test(probeCamera.layers), false);
      assert.equal(lines.layers.test(viewCamera.layers), true);
      assert.equal(lines.castShadow, false);
    }
  } finally {
    debug.dispose();
  }
});

test('incident light reaches each mirror and reflected misses retain the full receiver distance', () => {
  const debug = new YieldDebug(new THREE.Scene(), 2, 12);
  const records = [
    record(),
    record({ center: new THREE.Vector3(-30, 4, 60),
      reflected: new THREE.Vector3(-3, 0, 0), distanceMetres: 400 }),
  ];
  try {
    debug.setEnabled(true, records);
    assert.equal(debug.enabled, true);
    assert.equal(debug.group.visible, true);

    records.forEach((item, index) => {
      const [incidentStart, incidentEnd] = endpoints(debug.lines.incidence, index);
      closeVector(incidentEnd, item.center);
      closeVector(incidentStart.clone().sub(incidentEnd),
        item.sunDirection.clone().normalize().multiplyScalar(item.distanceMetres));

      const [reflectedStart, reflectedEnd] = endpoints(debug.lines.reflection, index);
      closeVector(reflectedStart, item.center);
      assert.ok(Math.abs(reflectedStart.distanceTo(reflectedEnd) - item.distanceMetres) < 1e-5);
      closeVector(reflectedEnd.clone().sub(reflectedStart).normalize(),
        item.reflected.clone().normalize());

      const [normalStart, normalEnd] = endpoints(debug.lines.normal, index);
      closeVector(normalStart, item.center);
      closeVector(normalEnd.clone().sub(normalStart), item.normal.clone().multiplyScalar(12));
    });

    for (const lines of Object.values(debug.lines)) {
      assert.equal(lines.geometry.drawRange.count, 4);
    }
  } finally {
    debug.dispose();
  }
});

test('updates while hidden use the latest sun and mirror pose without stale segments', () => {
  const debug = new YieldDebug(new THREE.Scene(), 2, 8);
  try {
    debug.setEnabled(true, [record(), record()]);
    debug.setEnabled(false);
    const next = record({ sunDirection: new THREE.Vector3(1, 0, 0),
      reflected: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(1, 0, 0) });
    debug.update([next]);
    assert.equal(debug.group.visible, false);
    debug.setEnabled(true);
    closeVector(endpoints(debug.lines.incidence)[0], new THREE.Vector3(260, 3, -20));
    closeVector(endpoints(debug.lines.reflection)[1], new THREE.Vector3(10, 253, -20));
    closeVector(endpoints(debug.lines.normal)[1], new THREE.Vector3(18, 3, -20));
    for (const lines of Object.values(debug.lines)) {
      assert.equal(lines.geometry.drawRange.count, 2);
    }
    debug.update([]);
    for (const lines of Object.values(debug.lines)) {
      assert.equal(lines.geometry.drawRange.count, 0);
    }
  } finally {
    debug.dispose();
  }
});

test('physics model array records produce finite debug geometry with the actual ray directions', () => {
  const debug = new YieldDebug(new THREE.Scene(), 1, CONFIG.yield.normalDebugLengthMetres);
  const sunData = { azimuth: 0.4, elevation: 0.8 };
  const target = new THREE.Vector3(...CONFIG.receiverCenter);
  const result = evaluateMirrorYield({
    center: [100, 3, -100],
    normal: [0, 1, 0],
    right: [1, 0, 0],
    up: [0, 0, -1],
  }, sunData, target, CONFIG, 900);
  try {
    debug.setEnabled(true, [result]);
    for (const lines of Object.values(debug.lines)) {
      assert.ok(lines.geometry.attributes.position.array.every(Number.isFinite));
    }
    const center = new THREE.Vector3(...result.center);
    const [incidentStart, incidentEnd] = endpoints(debug.lines.incidence);
    closeVector(incidentEnd, center);
    closeVector(incidentStart.clone().sub(incidentEnd).normalize(),
      new THREE.Vector3(...result.sunDirection));
    const [reflectedStart, reflectedEnd] = endpoints(debug.lines.reflection);
    closeVector(reflectedStart, center);
    assert.ok(Math.abs(reflectedEnd.distanceTo(reflectedStart) - result.distanceMetres) < 1e-5);
    closeVector(reflectedEnd.clone().sub(reflectedStart).normalize(),
      new THREE.Vector3(...result.reflected));
    closeVector(endpoints(debug.lines.normal)[1],
      center.clone().addScaledVector(new THREE.Vector3(...result.normal), CONFIG.yield.normalDebugLengthMetres));

    for (const value of ['false', 0, null, undefined]) {
      assert.throws(() => debug.setEnabled(value), TypeError);
      assert.equal(debug.group.visible, true);
    }
  } finally {
    debug.dispose();
  }
});

test('disposing debug rays removes the group and frees every geometry and material', () => {
  const scene = new THREE.Scene();
  const debug = new YieldDebug(scene, 1, 8);
  let disposedGeometries = 0;
  let disposedMaterials = 0;
  for (const lines of Object.values(debug.lines)) {
    lines.geometry.addEventListener('dispose', () => { disposedGeometries += 1; });
    lines.material.addEventListener('dispose', () => { disposedMaterials += 1; });
  }
  debug.dispose();
  assert.equal(debug.group.parent, null);
  assert.equal(scene.children.length, 0);
  assert.equal(disposedGeometries, 3);
  assert.equal(disposedMaterials, 3);
});
