import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import RELEASE_SYNC from '@jitl/quickjs-wasmfile-release-sync';
import { createMirrorSandbox } from '../src/editor/mirror-sandbox.js';
import { SANDBOX_LIMITS, serializeSandboxError, validateConsoleEntries } from '../src/editor/sandbox-limits.js';

const mirrors = [{ id: 'H-0001', pos: { x: 4, y: 2.66, z: 12 }, azimuth: 0, elevation: Math.PI / 2 }];
const sun = { azimuth: 0.4, elevation: 0.5, timeMinutes: 400, elapsedTime: 0, deltaTime: 0.02 };
const receiver = { x: 0, y: 84, z: 0 };
const threeSource = readFileSync(createRequire(import.meta.url).resolve('three'), 'utf8');
let quickJS;
async function makeSandbox(t, source, { snapshots = mirrors, limits = SANDBOX_LIMITS, withThree = false, onLog } = {}) {
  quickJS ||= await newQuickJSWASMModuleFromVariant(RELEASE_SYNC);
  const sandbox = createMirrorSandbox(quickJS, source, snapshots, limits, { threeSource: withThree ? threeSource : undefined, onLog });
  t.after(() => sandbox.dispose());
  return sandbox;
}

test('the empty updateMirrors template runs and all inputs are guest copies', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(mirrorList, sunData, receiverTargetPos) {
    if (mirrorList[0].id !== "H-0001" || mirrorList[0].pos.y !== 2.66) throw new Error("Missing mirror position");
    if (sunData.azimuth !== 0.4 || sunData.elevation !== 0.5 || "altitude" in sunData) throw new Error("Incorrect sun radians");
    if (receiverTargetPos.y !== 84) throw new Error("Missing receiver");
    sunData.elevation = -2;
    receiverTargetPos.y = -10;
  }`);
  assert.deepEqual(sandbox.tick(mirrors, sun, receiver), []);
  assert.equal(sun.elevation, 0.5);
  assert.equal(receiver.y, 84);
});

test('a full 2045-mirror field can issue two radian commands per mirror', async t => {
  const field = Array.from({ length: 2045 }, (_, i) => ({ ...mirrors[0], id: 'H-' + i, pos: { x: i, y: 2.66, z: -i } }));
  const sandbox = await makeSandbox(t, `function updateMirrors(mirrorList, sunData) {
    for (let i = 0; i < mirrorList.length; i++) {
      mirrorList[i].setAzimuth(sunData.azimuth + i / 1000);
      mirrorList[i].setElevation(sunData.elevation);
    }
  }`, { snapshots: field, withThree: true });
  const commands = sandbox.tick(field, sun, receiver);
  assert.equal(commands.length, 4090);
  assert.deepEqual(commands[0], { id: 'H-0', method: 'setAzimuth', value: 0.4 });
  assert.deepEqual(commands.at(-1), { id: 'H-2044', method: 'setElevation', value: 0.5 });
});

test('a full field can use THREE vector reflection math and setPose for every mirror', async t => {
  const field = Array.from({ length: 2045 }, (_, i) => ({ ...mirrors[0], id: 'H-' + i, pos: { x: i - 1022, y: 2.66, z: -100 - i } }));
  const sandbox = await makeSandbox(t, `function updateMirrors(mirrorList, sunData, receiverTargetPos) {
    const directionToSun = new THREE.Vector3(
      Math.cos(sunData.elevation) * Math.sin(sunData.azimuth),
      Math.sin(sunData.elevation),
      Math.cos(sunData.elevation) * Math.cos(sunData.azimuth)
    );
    const receiver = new THREE.Vector3(receiverTargetPos.x, receiverTargetPos.y, receiverTargetPos.z);
    for (const mirror of mirrorList) {
      const directionToReceiver = receiver.clone().sub(new THREE.Vector3(mirror.pos.x, mirror.pos.y, mirror.pos.z)).normalize();
      const normal = directionToSun.clone().add(directionToReceiver).normalize();
      mirror.setPose({ azimuth: Math.atan2(normal.x, normal.z), elevation: Math.asin(normal.y) });
    }
  }`, { snapshots: field, withThree: true });
  const commands = sandbox.tick(field, sun, receiver);
  assert.equal(commands.length, 2045);
  assert.ok(commands.every(command => command.method === 'setPose' && Number.isFinite(command.pose.azimuth) && Number.isFinite(command.pose.elevation)));
});

test('elevation setters, reset, and getters preserve command order without altitude aliases', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(list) {
    const m = list[0];
    m.setAzimuth(0.2);
    if (m.getCurrentAzimuth() !== 0.2) throw new Error("Azimuth getter stale");
    if ("altitude" in m || "setAltitude" in m || "getCurrentAltitude" in m) throw new Error("Altitude alias exposed");
    m.setElevation(10);
    if (m.getCurrentElevation() !== Math.PI / 2) throw new Error("Elevation not clamped");
    m.setElevation(-1);
    if (m.getCurrentElevation() !== 0) throw new Error("Elevation not clamped");
    m.setPose({ azimuth: 0.8, elevation: 0.6 });
    if (m.azimuth !== 0.8 || m.elevation !== 0.6) throw new Error("Pose getter stale");
    m.reset();
    if (m.azimuth !== 0 || m.elevation !== Math.PI / 2) throw new Error("Reset pose incorrect");
  }`);
  assert.deepEqual(sandbox.tick(mirrors, sun, receiver), [
    { id: 'H-0001', method: 'setAzimuth', value: 0.2 },
    { id: 'H-0001', method: 'setElevation', value: 10 },
    { id: 'H-0001', method: 'setElevation', value: -1 },
    { id: 'H-0001', method: 'setPose', pose: { azimuth: 0.8, elevation: 0.6 } },
    { id: 'H-0001', method: 'reset' },
  ]);
});

test('the example increments azimuth by 0.03 and sets elevation to its sine each callback', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(mirrorList) {
    for (const mirror of mirrorList) {
      const azimuth = mirror.getCurrentAzimuth() + 0.03;
      mirror.setAzimuth(azimuth);
      mirror.setElevation(Math.sin(azimuth));
    }
  }`);
  let snapshot = mirrors;
  for (let i = 1; i <= 3; i++) {
    const commands = sandbox.tick(snapshot, sun, receiver);
    const azimuth = snapshot[0].azimuth + 0.03;
    assert.deepEqual(commands, [
      { id: 'H-0001', method: 'setAzimuth', value: azimuth },
      { id: 'H-0001', method: 'setElevation', value: Math.sin(azimuth) },
    ]);
    snapshot = [{ ...snapshot[0], azimuth, elevation: Math.sin(azimuth) }];
  }
});

test('script state and cached mirror references persist and refresh each callback', async t => {
  const sandbox = await makeSandbox(t, `let previous, ticks = 0;
  function updateMirrors(list) {
    ticks++;
    if (!previous) previous = list[0];
    if (previous !== list[0]) throw new Error("Mirror identity changed");
    if (ticks === 2 && (previous.getCurrentAzimuth() !== 0.7 || previous.pos.y !== 9)) throw new Error("Cached data stale");
    previous.setPose({ azimuth: ticks / 10 });
  }`);
  assert.equal(sandbox.tick(mirrors, sun, receiver)[0].pose.azimuth, 0.1);
  assert.equal(sandbox.tick([{ ...mirrors[0], azimuth: 0.7, pos: { x: 4, y: 9, z: 12 } }], sun, receiver)[0].pose.azimuth, 0.2);
});

test('unchanged snapshots restore host angles and user array changes cannot corrupt subsequent lists', async t => {
  const field = [...mirrors, { ...mirrors[0], id: 'H-0002' }];
  const sandbox = await makeSandbox(t, `function updateMirrors(list) {
    if (list.length !== 2 || list[0].id !== "H-0001" || list[1].id !== "H-0002") throw new Error("Private order corrupted");
    for (const m of list) {
      if (m.getCurrentAzimuth() !== 0 || m.getCurrentElevation() !== Math.PI / 2) throw new Error("Host snapshot stale");
      m.setPose({ azimuth: 0.2, elevation: 0.4 });
    }
    list.reverse(); list.pop(); list[0] = null;
  }`, { snapshots: field });
  assert.equal(sandbox.tick(field, sun, receiver).length, 2);
  assert.equal(sandbox.tick(field, sun, receiver).length, 2);
});

test('async callbacks and local Promise jobs finish before commands are returned', async t => {
  const sandbox = await makeSandbox(t, `async function updateMirrors(list) {
    await Promise.resolve();
    list[0].setAzimuth(0.3);
    await Promise.resolve();
    list[0].setElevation(0.7);
  }`);
  assert.deepEqual(sandbox.tick(mirrors, sun, receiver), [
    { id: 'H-0001', method: 'setAzimuth', value: 0.3 },
    { id: 'H-0001', method: 'setElevation', value: 0.7 },
  ]);
});

test('guest THREE is the complete library and cannot escape into browser or Node', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(list) {
    const point = new THREE.Vector3(1, 2, 3).applyMatrix4(new THREE.Matrix4().makeTranslation(3, 0, 1));
    if (point.x !== 4 || point.z !== 4 || !THREE.BufferGeometry || !THREE.Sphere || !THREE.Quaternion) throw new Error("THREE missing");
    for (const fn of [list[0].setAzimuth, THREE.Vector3, console.log, Math.sin]) {
      const root = fn.constructor("return globalThis")();
      for (const key of ["window", "document", "fetch", "XMLHttpRequest", "WebSocket", "localStorage", "indexedDB", "postMessage", "Worker", "importScripts", "process", "require", "setTimeout", "__queueMirrorCommand"]) {
        if (typeof root[key] !== "undefined") throw new Error("Host leak: " + key);
      }
    }
    THREE.Vector3.prototype.sandboxPollution = true;
    Object.prototype.sandboxPollution = true;
    list[0].setAzimuth(point.x);
  }`, { withThree: true });
  assert.deepEqual(sandbox.tick(mirrors, sun, receiver), [{ id: 'H-0001', method: 'setAzimuth', value: 4 }]);
  assert.equal({}.sandboxPollution, undefined);
  const hostThree = await import('three');
  assert.equal(hostThree.Vector3.prototype.sandboxPollution, undefined);
});

test('captured mirror APIs keep working after guest prototype and global poisoning', async t => {
  const sandbox = await makeSandbox(t, `let ticks = 0;
  function updateMirrors(list) {
    if (++ticks === 1) {
      JSON.parse = () => { throw new Error("Poisoned JSON"); };
      Reflect.apply = () => { throw new Error("Poisoned apply"); };
      Object.freeze = () => { throw new Error("Poisoned freeze"); };
      Number.isFinite = () => false;
      Math.min = Math.max = () => { throw new Error("Poisoned math"); };
      Object.prototype.toString = () => "bad";
      Promise.resolve = () => { throw new Error("Poisoned resolve"); };
    }
    list[0].setPose({ azimuth: ticks, elevation: 0.4 });
  }`);
  assert.equal(sandbox.tick(mirrors, sun, receiver)[0].pose.azimuth, 1);
  assert.equal(sandbox.tick(mirrors, sun, receiver)[0].pose.azimuth, 2);
});

test('private command records serialize safely despite malicious prototype and toJSON hooks', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(list) {
    const loop = function () { while (true) {} };
    Object.prototype.toJSON = loop;
    Array.prototype.toJSON = loop;
    String.prototype.toJSON = loop;
    Number.prototype.toJSON = loop;
    Array.prototype.push = loop;
    Object.create = Object.setPrototypeOf = JSON.stringify = loop;
    const pose = { azimuth: 0.2, elevation: 0.4, toJSON: loop };
    list[0].setPose(pose);
    list[0].setAzimuth(0.3);
  }`, { limits: { ...SANDBOX_LIMITS, executionMs: 100 } });
  const expected = [
    { id: 'H-0001', method: 'setPose', pose: { azimuth: 0.2, elevation: 0.4 } },
    { id: 'H-0001', method: 'setAzimuth', value: 0.3 },
  ];
  assert.deepEqual(sandbox.tick(mirrors, sun, receiver), expected);
  assert.deepEqual(sandbox.tick(mirrors, sun, receiver), expected);
});

test('malicious pose getters are interrupted within the callback deadline before a batch escapes', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(list) {
    list[0].setAzimuth(0.5);
    list[0].setPose({ get elevation() { while (true) {} } });
  }`, { limits: { ...SANDBOX_LIMITS, executionMs: 40 } });
  assert.throws(() => sandbox.tick(mirrors, sun, receiver), error => error.name === 'TimeoutError');
});

test('the actual 65536 command quota stops a flood wholly inside the guest', async t => {
  const sandbox = await makeSandbox(t, `function updateMirrors(list) {
    for (let i=0;i<${SANDBOX_LIMITS.commandsPerFrame + 1};i++) list[0].setAzimuth(0.1);
  }`);
  assert.throws(() => sandbox.tick(mirrors, sun, receiver), /Too many mirror commands/);
});

test('invalid angles, poses, callback types, and bad snapshots are rejected', async t => {
  for (const expression of ['m.setAzimuth(NaN)', 'm.setElevation(Infinity)', 'm.setElevation("1")', 'm.setPose(null)', 'm.setPose([])', 'm.setPose({altitude:0.3})', 'm.setPose({altitude:0.3,elevation:0.4})']) {
    const sandbox = await makeSandbox(t, 'function updateMirrors(list) { const m = list[0]; ' + expression + '; }');
    assert.throws(() => sandbox.tick(mirrors, sun, receiver), /finite|pose|altitude is not supported/);
  }
  for (const source of ['function* updateMirrors() {}', 'async function* updateMirrors() {}', 'const updateMirrors = 7']) {
    await assert.rejects(makeSandbox(t, source), /Define function|not a generator/);
  }
  const sandbox = await makeSandbox(t, 'function updateMirrors() {}');
  assert.throws(() => sandbox.tick([mirrors[0], mirrors[0]], sun, receiver), /unique/);
  assert.throws(() => sandbox.tick([{ ...mirrors[0], azimuth: NaN }], sun, receiver), /finite/);
  assert.throws(() => sandbox.tick([{ id: 'H-0001', pos: mirrors[0].pos, azimuth: 0, altitude: 0.2 }], sun, receiver), /finite/);
  assert.throws(() => sandbox.tick(mirrors, { elevation: 0.2 }, receiver), /Sun angles/);
  assert.throws(() => sandbox.tick(mirrors, { azimuth: 0.4, altitude: 0.5 }, receiver), /Sun angles/);
});

test('promise failures and command/job quotas discard the entire callback', async t => {
  for (const [body, expected] of [
    ['m.setAzimuth(0.2); throw new Error("after command");', /after command/],
    ['m.setAzimuth(0.2); return Promise.reject(new Error("async fault"));', /async fault/],
    ['return new Promise(() => {});', /did not settle/],
    ['for (let i=0;i<4;i++) m.reset();', /Too many mirror commands/],
    ['m.reset(); function loop() { Promise.resolve().then(loop); } loop();', /Promise jobs|execution limit/],
  ]) {
    const sandbox = await makeSandbox(t, 'function updateMirrors(list) { const m = list[0]; ' + body + ' }', { limits: { ...SANDBOX_LIMITS, commandsPerFrame: 3, promiseJobs: 32 } });
    assert.throws(() => sandbox.tick(mirrors, sun, receiver), expected);
  }
});

test('compile/runtime errors map to the editor source and error payloads are bounded', async t => {
  await assert.rejects(makeSandbox(t, 'function updateMirrors() {\n const a = ;\n}'), error => error.name === 'SyntaxError' && error.line === 2);
  const sandbox = await makeSandbox(t, 'function updateMirrors() {\n\n throw new Error("line three");\n}');
  assert.throws(() => sandbox.tick(mirrors, sun, receiver), error => error.message === 'line three' && error.line === 3);
  await assert.rejects(makeSandbox(t, ' '.repeat(SANDBOX_LIMITS.sourceLength + 1)), /at most/);
  assert.equal(serializeSandboxError(new Error('x'.repeat(10000))).message.length, 2000);
});

test('console formatting, quotas, levels, timers, and error logs match the reference', async t => {
  const logs = [];
  const sandbox = await makeSandbox(t, `console.info("starting");
  function updateMirrors(list) {
    const circle = { id: 1 }; circle.self = circle;
    console.log(circle, undefined, 42n);
    console.warn("warning");
    console.error(new Error("diagnostic"));
    console.count("tick");
    console.time("step"); console.timeEnd("step");
    for (let i=0;i<100;i++) console.log("x".repeat(20000));
    list[0].reset();
  }`, { onLog: entry => logs.push(entry) });
  assert.equal(logs[0].message, 'starting');
  sandbox.tick(mirrors, sun, receiver);
  assert.equal(logs[1].message, '{"id":1,"self":"[Circular]"} undefined 42n');
  assert.equal(logs[2].level, 'warn');
  assert.match(logs[3].message, /Error: diagnostic/);
  assert.equal(logs.length, SANDBOX_LIMITS.consoleEntries + 1);
  assert.equal(logs.at(-1).message.length, SANDBOX_LIMITS.consoleCharacters);
  sandbox.tick(mirrors, sun, receiver);
  assert.equal(logs.length, 2 * SANDBOX_LIMITS.consoleEntries + 1);
  assert.throws(() => validateConsoleEntries([{ level: 'constructor', message: 'bad' }]), /Invalid/);
});

test('guest heap and interrupt limits reject runaway code', async t => {
  const sandbox = await makeSandbox(t, 'function updateMirrors() { const large = "x".repeat(8 * 1024 * 1024); }', { limits: { ...SANDBOX_LIMITS, memoryBytes: 1024 * 1024 } });
  assert.throws(() => sandbox.tick(mirrors, sun, receiver), /memory/i);
  await assert.rejects(makeSandbox(t, 'while (true) {} function updateMirrors() {}', { limits: { ...SANDBOX_LIMITS, executionMs: 40 } }), error => error.name === 'TimeoutError');
});

test('a runtime infinite loop stays in a real worker and preserves the host heartbeat', async t => {
  const worker = new Worker(new URL('../test-support/editor-worker.mjs', import.meta.url), { execArgv: [] });
  t.after(() => worker.terminate());
  const next = () => new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  const ready = next();
  worker.postMessage({ type: 'init', source: 'function updateMirrors() { while (true) {} }', mirrors });
  assert.equal((await ready).type, 'ready');
  let heartbeat = false;
  setTimeout(() => { heartbeat = true; }, 10);
  const response = next();
  worker.postMessage({ type: 'frame', id: 1, mirrors, sunData: sun, receiverTargetPos: receiver });
  const result = await response;
  assert.equal(heartbeat, true);
  assert.equal(result.type, 'error');
  assert.equal(result.error.name, 'TimeoutError');
  assert.equal(result.commands, undefined);
});
