import assert from 'node:assert/strict';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { DAY_DURATION_SECONDS, DEFAULT_CODE, createSimulationRunner } from '../src/editor/simulation.js';
import { SANDBOX_LIMITS } from '../src/editor/sandbox-limits.js';
import { validateMirrorCommands } from '../src/app/mirrorCommands.js';

const waitFor = async (predicate, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Simulation test timed out.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

function createHarness(t, { realWorker = false, mirrorCount = 2, ...overrides } = {}) {
  const rigs = Array.from({ length: mirrorCount }, (_, index) => ({
    id: `H-${index}`,
    pos: { x: index, y: 2.66, z: -100 - index },
    azimuth: 0,
    elevation: Math.PI / 2,
    initialPose: { azimuth: 0, elevation: Math.PI / 2 },
  }));
  const byId = new Map(rigs.map((rig) => [rig.id, rig]));
  const commands = [];
  const sunTimes = [];
  const errors = [];
  const logs = [];
  const phases = [];
  const workers = [];
  const threads = [];
  const events = [];
  let starts = 0;
  let sun = { azimuth: 0.9, elevation: 0.4, timeMinutes: 600 };
  const api = {
    getMirrorSnapshots: () => rigs.map((rig) => ({
      id: rig.id, pos: { ...rig.pos }, azimuth: rig.azimuth,
      elevation: rig.elevation,
    })),
    applyMirrorCommands(batch) {
      const staged = validateMirrorCommands(batch, byId);
      for (const [rig, pose] of staged) Object.assign(rig, pose);
      commands.push(batch);
      events.push('apply');
    },
    getSolarDay: () => ({ sunrise: 360, sunset: 1080 }),
    setSunTime(minutes) {
      sunTimes.push(minutes);
      const progress = (minutes - 360) / 720;
      sun = {
        azimuth: progress * Math.PI,
        elevation: Math.sin(progress * Math.PI),
        timeMinutes: minutes,
      };
      // Match the system callback dispatched by programmatic sun updates.
      runner.sunChanged();
    },
    getSunData: () => ({ ...sun }),
    getReceiverTargetPos: () => ({ x: 0, y: 139.3, z: 0 }),
  };
  const createWorker = () => {
    const instance = {
      messages: [], terminated: 0,
      postMessage(data) {
        this.messages.push(data);
        this.thread?.postMessage(data);
      },
      terminate() {
        this.terminated += 1;
        events.push('terminate');
        if (this.thread) void this.thread.terminate();
      },
      deliver(data) { this.onmessage?.({ data }); },
    };
    if (realWorker) {
      const thread = new Worker(new URL('../test-support/editor-worker.mjs', import.meta.url), { execArgv: [] });
      instance.thread = thread;
      threads.push(thread);
      thread.on('message', (data) => instance.onmessage?.({ data }));
      thread.on('error', (error) => instance.onerror?.({ message: error.message }));
    }
    workers.push(instance);
    return instance;
  };
  const runner = createSimulationRunner(api, {
    createWorker,
    onStateChange: (_, phase) => { phases.push(phase); events.push(phase); },
    onError: (error) => errors.push(error),
    onLog: (entry) => logs.push(entry),
    onStart: () => { starts += 1; events.push('start'); },
    ...overrides,
  });
  t.after(async () => {
    runner.stop();
    await Promise.all(threads.map((thread) => thread.terminate()));
  });
  return {
    runner, api, rigs, commands, sunTimes, errors, logs, phases, workers, events,
    get starts() { return starts; },
    ready() { workers.at(-1).deliver({ type: 'ready' }); },
    respond(batch = []) {
      const instance = workers.at(-1);
      const frame = instance.messages.at(-1);
      instance.deliver({ type: 'frame', id: frame.id, commands: batch });
    },
    manualSun(data) { sun = { ...sun, ...data }; runner.sunChanged(); },
    async run(source = DEFAULT_CODE) {
      const previousErrors = errors.length;
      runner.run(source);
      await waitFor(() => phases.at(-1) === 'running' || errors.length > previousErrors);
      return errors.length === previousErrors;
    },
    async step(delta) {
      const previousCommands = commands.length;
      runner.tick(delta);
      await waitFor(() => commands.length > previousCommands || !runner.isRunning());
    },
  };
}

test('the documented JavaScript starter compiles and its example increments azimuth with sine elevation', async (t) => {
  const h = createHarness(t, { realWorker: true });
  assert.match(DEFAULT_CODE, /mirrorList \/\* Mirror\[\] \*\//);
  assert.match(DEFAULT_CODE, /receiverTargetPos \/\* \{x, y, z\} \*\//);
  assert.doesNotMatch(DEFAULT_CODE, /altitude|round|rotation.axis/i);
  assert.equal(await h.run(DEFAULT_CODE), true);
  await h.step(0);
  assert.deepEqual(h.commands, [[]], 'the example remains opt-in');
  assert.deepEqual(h.rigs.map((rig) => rig.azimuth), [0, 0]);

  const example = DEFAULT_CODE.replace('  /*\n', '').replace('  */\n', '');
  assert.equal(await h.run(example), true);
  await h.step(0);
  for (const mirror of h.rigs) {
    assert.equal(mirror.azimuth, 0.03);
    assert.equal(mirror.elevation, Math.sin(0.03));
  }
  await h.step(0.1);
  for (const mirror of h.rigs) {
    assert.equal(mirror.azimuth, 0.06);
    assert.equal(mirror.elevation, Math.sin(0.06));
  }
  assert.deepEqual(h.errors, []);
});

test('compilation does not move the sun and the first successful callback starts at sunrise', (t) => {
  const h = createHarness(t);
  h.runner.tick(1);
  assert.equal(h.runner.getTime(), 0);
  assert.equal(h.runner.run(DEFAULT_CODE), true);
  assert.equal(h.starts, 0);
  h.ready();
  assert.deepEqual(h.sunTimes, []);
  assert.equal(h.starts, 0);
  h.runner.tick(10);
  const first = h.workers[0].messages.at(-1);
  assert.equal(first.sunData.timeMinutes, 360);
  assert.equal(first.sunData.elapsedTime, 0);
  assert.equal(first.sunData.deltaTime, 0);
  assert.equal(h.runner.getTime(), 0);
  h.runner.tick(10);
  assert.equal(h.workers[0].messages.length, 2, 'first callback is not queued twice');
  assert.equal(h.runner.getTime(), 0, 'startup latency does not consume the simulated day');
  h.respond();
  assert.equal(h.starts, 1);
  h.runner.tick(1);
  h.respond();
  assert.equal(h.starts, 1);
  assert.equal(h.runner.getTime(), 1);
  assert.deepEqual(h.errors, []);
});

test('every Run lasts exactly 12 seconds and sunset commands apply before completion', (t) => {
  assert.equal(DAY_DURATION_SECONDS, 12);
  const h = createHarness(t);
  h.runner.run(DEFAULT_CODE);
  h.ready();
  h.runner.tick(0.1);
  h.respond();
  h.runner.tick(6);
  assert.equal(h.workers[0].messages.at(-1).sunData.timeMinutes, 720);
  h.respond();
  h.runner.tick(10);
  const final = h.workers[0].messages.at(-1);
  assert.equal(final.sunData.timeMinutes, 1080);
  assert.equal(final.sunData.elapsedTime, 12);
  assert.equal(final.sunData.deltaTime, 6);
  assert.equal(h.runner.isRunning(), true, 'sunset response is still pending');
  h.respond([{ id: 'H-0', method: 'setPose', pose: { azimuth: 0.6, elevation: 0.7 } }]);
  assert.equal(h.rigs[0].azimuth, 0.6);
  assert.equal(h.rigs[0].elevation, 0.7);
  assert.equal(h.runner.isRunning(), false);
  assert.equal(h.runner.getTime(), 12);
  assert.deepEqual(h.events.slice(-3), ['apply', 'terminate', 'complete']);
  h.runner.tick(2);
  assert.equal(h.commands.length, 3);

  h.runner.run(DEFAULT_CODE);
  h.ready();
  h.runner.tick(1);
  h.respond();
  h.runner.tick(6);
  assert.equal(h.workers[1].messages.at(-1).sunData.timeMinutes, 720);
  assert.equal(h.runner.getTime(), 6);
});

test('slow callbacks have backpressure and the next callback sees accumulated visible time', (t) => {
  const h = createHarness(t);
  h.runner.run(DEFAULT_CODE);
  h.ready();
  h.runner.tick(0.01);
  h.respond();
  h.runner.tick(0.2);
  h.runner.tick(0.3);
  h.runner.tick(0.4);
  assert.equal(h.workers[0].messages.length, 3, 'only one second callback can be in flight');
  assert.ok(Math.abs(h.runner.getTime() - 0.9) < 1e-12);
  h.respond();
  h.runner.tick(0.1);
  const next = h.workers[0].messages.at(-1);
  assert.ok(Math.abs(next.sunData.elapsedTime - 1) < 1e-12);
  assert.ok(Math.abs(next.sunData.deltaTime - 0.8) < 1e-12);
  assert.equal(next.sunData.timeMinutes, 420);
  h.respond();
  h.runner.tick(0);
  assert.equal(h.workers[0].messages.length, 4, 'zero time without a sun change executes no extra code');
});

test('manual sun changes receive one current-sun callback before playback resumes', (t) => {
  const h = createHarness(t);
  h.runner.run(DEFAULT_CODE);
  h.ready();
  h.runner.tick(0);
  h.respond();
  h.runner.tick(1);
  h.respond();
  h.manualSun({ azimuth: 0.55, elevation: 0.44, timeMinutes: 555 });
  h.runner.tick(0);
  const manual = h.workers[0].messages.at(-1);
  assert.equal(manual.sunData.azimuth, 0.55);
  assert.equal(manual.sunData.elevation, 0.44);
  assert.equal(manual.sunData.timeMinutes, 555);
  assert.deepEqual(h.sunTimes, [360, 420], 'manual callback must not overwrite the edited sun');
  h.respond();
  h.runner.tick(1);
  assert.equal(h.workers[0].messages.at(-1).sunData.timeMinutes, 480);
  assert.equal(h.runner.getTime(), 2);
});

test('Stop and restart discard old responses and restart the elapsed clock', (t) => {
  const h = createHarness(t);
  h.runner.run(DEFAULT_CODE);
  h.ready();
  h.runner.tick(0);
  h.respond();
  h.runner.tick(2);
  const oldMessage = h.workers[0].onmessage;
  h.runner.stop();
  assert.equal(h.workers[0].terminated, 1);
  const before = h.commands.length;
  h.runner.tick(4);
  assert.equal(h.commands.length, before);
  h.runner.run(DEFAULT_CODE);
  assert.equal(h.runner.getTime(), 0);
  oldMessage({ data: {
    type: 'frame', id: 2, commands: [{ id: 'H-0', method: 'setAzimuth', value: 99 }],
    logs: [{ level: 'log', message: 'stale' }],
  } });
  assert.equal(h.commands.length, before);
  assert.equal(h.rigs[0].azimuth, 0);
  assert.deepEqual(h.logs, []);
  h.ready();
  h.runner.tick(0);
  h.respond();
  assert.equal(h.starts, 2);
  assert.equal(h.workers[1].messages.at(-1).sunData.elapsedTime, 0);
});

test('invalid whole-field responses leave all mirrors unchanged and prevent onStart', (t) => {
  const h = createHarness(t);
  h.runner.run(DEFAULT_CODE);
  h.ready();
  h.runner.tick(0);
  h.respond([
    { id: 'H-0', method: 'setAzimuth', value: 0.3 },
    { id: 'H-1', method: 'constructor', value: 'bad' },
  ]);
  assert.deepEqual(h.rigs.map((rig) => rig.azimuth), [0, 0]);
  assert.deepEqual(h.commands, []);
  assert.equal(h.starts, 0);
  assert.equal(h.runner.isRunning(), false);
  assert.match(h.errors[0].message, /Unknown mirror method/);
});

test('invalid inputs, startup failures, and cancellation cannot start playback', (t) => {
  const h = createHarness(t);
  assert.equal(h.runner.run(null), false);
  assert.equal(h.runner.run(' '.repeat(SANDBOX_LIMITS.sourceLength + 1)), false);
  assert.equal(h.workers.length, 0);
  h.runner.run(DEFAULT_CODE);
  h.workers[0].deliver({ type: 'error', error: { name: 'SyntaxError', message: 'Invalid script', line: 2 } });
  assert.equal(h.errors.at(-1).name, 'SyntaxError');
  assert.equal(h.errors.at(-1).line, 2);
  assert.equal(h.starts, 0);
  assert.deepEqual(h.sunTimes, []);

  h.runner.run(DEFAULT_CODE);
  const cancelled = h.workers[1].onmessage;
  h.runner.stop();
  cancelled({ data: { type: 'ready' } });
  assert.equal(h.starts, 0);
  assert.equal(h.runner.isRunning(), false);
});

test('startup and response watchdogs terminate unresponsive workers without starting', async (t) => {
  const startup = createHarness(t, { startupTimeoutMs: 20 });
  startup.runner.run(DEFAULT_CODE);
  await waitFor(() => startup.errors.length, 2000);
  assert.equal(startup.errors[0].name, 'TimeoutError');
  assert.equal(startup.workers[0].terminated, 1);
  assert.equal(startup.starts, 0);
  assert.deepEqual(startup.sunTimes, []);

  const response = createHarness(t, { responseTimeoutMs: 20 });
  response.runner.run(DEFAULT_CODE);
  response.ready();
  response.runner.tick(0);
  await waitFor(() => response.errors.length, 2000);
  assert.equal(response.errors[0].name, 'TimeoutError');
  assert.equal(response.workers[0].terminated, 1);
  assert.equal(response.starts, 0);
  assert.deepEqual(response.commands, []);
});

test('a real 2045-mirror worker retains THREE state, refreshes inputs, and resets on Run', async (t) => {
  const h = createHarness(t, { realWorker: true, mirrorCount: 2045 });
  const source = `
    const direction = new THREE.Vector3();
    const receiver = new THREE.Vector3();
    let ticks = 0, firstMirror;
    function updateMirrors(mirrorList, sunData, receiverTargetPos) {
      ticks++;
      if (!firstMirror) firstMirror = mirrorList[0];
      if (firstMirror !== mirrorList[0]) throw new Error("Cached mirror changed");
      receiver.set(receiverTargetPos.x, receiverTargetPos.y, receiverTargetPos.z);
      if (receiver.y !== 139.3 || mirrorList.length !== 2045) throw new Error("Missing field inputs");
      if (ticks === 2 && firstMirror.getCurrentAzimuth() !== 0.01) throw new Error("Stale mirror snapshot");
      direction.set(Math.sin(sunData.azimuth), Math.sin(sunData.elevation), Math.cos(sunData.azimuth));
      for (let i = 0; i < mirrorList.length; i++) {
        mirrorList[i].setPose({ azimuth: sunData.azimuth + ticks / 100 + i / 10000, elevation: 0.3 });
      }
      console.log(ticks, mirrorList.length, direction.length(), sunData.elapsedTime, sunData.deltaTime);
    }
  `;
  assert.equal(await h.run(source), true);
  assert.deepEqual(h.sunTimes, []);
  await h.step(0.02);
  assert.equal(h.commands[0].length, 2045);
  assert.equal(h.rigs[0].azimuth, 0.01);
  assert.equal(h.rigs[2044].azimuth, 0.01 + 2044 / 10000);
  assert.equal(h.starts, 1);
  assert.equal(h.runner.getTime(), 0);
  await h.step(6);
  assert.equal(h.rigs[0].azimuth, Math.PI / 2 + 0.02);
  assert.equal(h.logs[0].message, '1 2045 1 0 0');
  assert.match(h.logs[1].message, /^2 2045 .* 6 6$/);
  await h.step(6);
  assert.equal(h.rigs[0].azimuth, Math.PI + 0.03);
  assert.equal(h.runner.isRunning(), false);
  assert.equal(h.phases.at(-1), 'complete');

  assert.equal(await h.run(source), true);
  await h.step(0.02);
  assert.equal(h.rigs[0].azimuth, 0.01);
  assert.equal(h.starts, 2);
  assert.equal(h.runner.getTime(), 0);
  assert.deepEqual(h.errors, []);
});

test('real compile and runtime errors carry editor lines and discard queued commands', async (t) => {
  const h = createHarness(t, { realWorker: true });
  assert.equal(await h.run('function updateMirrors() {\n const a = ;\n}'), false);
  assert.equal(h.errors[0].name, 'SyntaxError');
  assert.equal(h.errors[0].line, 2);
  assert.equal(h.starts, 0);
  assert.deepEqual(h.sunTimes, []);
  assert.equal(await h.run('function updateMirrors(list) {\n list[0].setAzimuth(0.4);\n throw new Error("after command");\n}'), true);
  await h.step(0.02);
  assert.equal(h.errors.at(-1).message, 'after command');
  assert.equal(h.errors.at(-1).line, 3);
  assert.equal(h.rigs[0].azimuth, 0);
  assert.deepEqual(h.commands, []);
  assert.equal(h.starts, 0);
  assert.equal(h.runner.isRunning(), false);
  assert.equal(await h.run(DEFAULT_CODE), true);
  await h.step(0.02);
  assert.equal(h.starts, 1);
  assert.deepEqual(h.commands, [[]]);
});
