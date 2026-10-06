import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { ReceiverGlow } from '../src/scene/receiverGlow.js';

function setup(overrides = {}) {
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial({ color: '#101820', roughness: 0.81 });
  const glow = new ReceiverGlow({
    scene,
    material,
    receiverPosition: [0, 139.3, 0],
    receiverRadius: 6.38,
    receiverHeight: 18.1,
    fullPowerWatts: 20e6,
    ...overrides,
  });
  return { scene, material, glow };
}

function emittedLight(material) {
  return material.emissive.clone().multiplyScalar(material.emissiveIntensity);
}

test('a receiver receiving no power remains black and does not request idle frames', () => {
  const { scene, material, glow } = setup();
  const originalColor = material.color.clone();
  try {
    assert.equal(glow.group.parent, scene);
    assert.equal(glow.group.visible, false);
    assert.equal(emittedLight(material).getHex(), 0);
    assert.ok(material.color.equals(originalColor));
    assert.equal(glow.update(1 / 60, new THREE.PerspectiveCamera()), false);
    assert.equal(glow.setPower(0), false);
    assert.equal(glow.setPower(-1000), false);
    assert.equal(glow.update(1), false);
  } finally {
    glow.dispose();
    material.dispose();
  }
});

test('greater absorbed power produces more light while identical watts do not retrigger changes', () => {
  const { material, glow } = setup();
  try {
    let previous = emittedLight(material);
    for (const watts of [10e3, 500e3, 5e6, 10e6, 20e6]) {
      assert.equal(glow.setPower(watts), true);
      const next = emittedLight(material);
      assert.ok(next.r > previous.r && next.g > previous.g && next.b > previous.b,
        `${watts} W should visibly increase all channels of received light`);
      assert.equal(glow.group.visible, true);
      assert.equal(glow.group.userData.powerWatts, watts);
      assert.equal(glow.setPower(watts), false);
      previous = next;
    }
    assert.ok(previous.r > 1, 'full input should produce a bright white receiver in daylight');
    assert.equal(glow.setPower(1e12), true);
    const bounded = emittedLight(material);
    assert.ok(bounded.equals(previous), 'over-range input should not cause unbounded glare');
    assert.throws(() => glow.setPower(NaN), TypeError);
    assert.throws(() => glow.setPower(Infinity), TypeError);
  } finally {
    glow.dispose();
    material.dispose();
  }
});

test('loss of input extinguishes the entire effect immediately and stops animation', () => {
  const { material, glow } = setup();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(100, 100, 100);
  camera.lookAt(glow.position);
  camera.updateMatrixWorld();
  try {
    glow.setPower(12e6);
    assert.equal(glow.update(1 / 60, camera), true);
    assert.equal(glow.update(0, camera), false);
    assert.equal(glow.update(1 / 60, camera), false);
    assert.equal(glow.update(1 / 60, camera), false);

    assert.equal(glow.setPower(0), true);
    assert.equal(glow.group.visible, false);
    assert.equal(material.emissiveIntensity, 0);
    assert.equal(material.emissive.getHex(), 0);
    assert.equal(glow.group.userData.strength, 0);
    assert.equal(glow.update(1 / 60, camera), true, 'render once to remove the glow');
    assert.equal(glow.update(1 / 60, camera), false);
  } finally {
    glow.dispose();
    material.dispose();
  }
});

test('imperceptible low-power shimmer stays idle while power and camera changes remain immediate', () => {
  const { material, glow } = setup();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(100, 100, 100);
  camera.lookAt(glow.position);
  camera.updateMatrixWorld();
  try {
    glow.setPower(31e3);
    assert.equal(glow.update(0, camera), true);
    assert.ok(material.emissiveIntensity > 0, 'low input should retain static illumination');
    assert.equal(glow.group.visible, true);
    for (let frame = 0; frame < 120; frame++) {
      assert.equal(glow.update(1 / 60, camera), false);
    }
    glow.setPower(40e3);
    assert.equal(glow.update(0, camera), true);
    assert.equal(glow.update(1 / 60, camera), false);
    camera.position.x += 1;
    camera.updateMatrixWorld();
    assert.equal(glow.update(0, camera), true);
    assert.equal(glow.update(1 / 60, camera), false);
  } finally {
    glow.dispose();
    material.dispose();
  }
});

test('visible shimmer follows elapsed time at most 24 times per second without waking an idle scene', () => {
  const { material, glow } = setup();
  try {
    glow.setPower(15e6);
    assert.equal(glow.update(0), true, 'power changes should render immediately');
    let uniformUpdates = 0;
    for (let frame = 0; frame < 120; frame++) {
      const previousTime = glow.time;
      assert.equal(glow.update(1 / 120), false,
        'shimmer should only appear when another scene change already requires rendering');
      if (glow.time !== previousTime) uniformUpdates += 1;
    }
    assert.ok(uniformUpdates > 0);
    assert.ok(uniformUpdates <= 24, `expected at most 24 shimmer updates, got ${uniformUpdates}`);
    assert.ok(Math.abs(glow.time - 1) < 0.05,
      'throttled shimmer should still advance by elapsed time rather than animation frame count');
    assert.equal(glow.update(0), false);
    assert.equal(glow.update(0), false);
  } finally {
    glow.dispose();
    material.dispose();
  }
});

test('local glare respects depth, excludes reflection probes and shadows, and follows view angle', () => {
  const { material, glow } = setup();
  const probe = new THREE.Camera();
  const camera = new THREE.PerspectiveCamera();
  camera.layers.enable(30);
  try {
    glow.setPower(15e6);
    for (const mesh of glow.group.children) {
      assert.equal(mesh.layers.test(probe.layers), false);
      assert.equal(mesh.layers.test(camera.layers), true);
      assert.equal(mesh.material.depthTest, true);
      assert.equal(mesh.material.depthWrite, false);
      assert.equal(mesh.castShadow, false);
      assert.equal(mesh.receiveShadow, false);
    }
    camera.position.copy(glow.position).add(new THREE.Vector3(0, 0, 100));
    camera.lookAt(glow.position);
    camera.updateMatrixWorld();
    glow.update(0, camera);
    const sideViewHeight = glow.corona.scale.y;

    camera.position.copy(glow.position).add(new THREE.Vector3(0, 100, 0));
    camera.lookAt(glow.position);
    camera.updateMatrixWorld();
    assert.equal(glow.update(0, camera), true);
    assert.ok(glow.corona.scale.y < sideViewHeight,
      'the halo should shorten with the projected cylinder when viewed from above');
    assert.ok(Math.abs(glow.corona.scale.x - glow.corona.scale.y) < 0.01,
      'an overhead halo should be round rather than a standing light column');
    assert.ok(glow.corona.quaternion.toArray().every(Number.isFinite));
  } finally {
    glow.dispose();
    material.dispose();
  }
});

test('disposal frees all owned resources once and leaves the shared receiver material alive', () => {
  const { scene, material, glow } = setup();
  let geometryDisposals = 0;
  let glowMaterialDisposals = 0;
  let receiverMaterialDisposals = 0;
  for (const mesh of glow.group.children) {
    mesh.geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
    mesh.material.addEventListener('dispose', () => { glowMaterialDisposals += 1; });
  }
  material.addEventListener('dispose', () => { receiverMaterialDisposals += 1; });
  glow.setPower(15e6);
  glow.dispose();
  glow.dispose();
  assert.equal(glow.group.parent, null);
  assert.equal(scene.children.length, 0);
  assert.equal(geometryDisposals, 2);
  assert.equal(glowMaterialDisposals, 2);
  assert.equal(receiverMaterialDisposals, 0);
  assert.equal(material.emissiveIntensity, 1);
  assert.equal(material.emissive.getHex(), 0);
  assert.equal(glow.setPower(10e6), false);
  assert.equal(glow.update(1 / 60), false);
  material.dispose();
});
