import { SANDBOX_LIMITS } from './sandbox-limits.js';
import { sandboxGlobalsSource } from './sandbox-globals.js';

/** User JavaScript runs in a separate QuickJS heap, never in the browser realm. */
export function createMirrorSandbox(QuickJS, source, initialMirrors, limits = SANDBOX_LIMITS, { threeSource, onLog = () => {} } = {}) {
  if (typeof source !== 'string' || source.length > limits.sourceLength) {
    throw new RangeError('Script must be at most ' + limits.sourceLength / 1024 + 'K characters.');
  }
  let knownIds;
  function copyMirrors(snapshots) {
    if (!Array.isArray(snapshots) || snapshots.length > limits.mirrorsPerFrame) {
      throw new RangeError('A callback may contain at most ' + limits.mirrorsPerFrame + ' mirrors.');
    }
    const ids = new Set();
    const copies = snapshots.map(mirror => {
      if (!mirror || typeof mirror.id !== 'string' || !mirror.id || mirror.id.length > 256 || ids.has(mirror.id)) {
        throw new TypeError('Each mirror must have a unique, nonempty string id.');
      }
      ids.add(mirror.id);
      const altitude = mirror.altitude ?? mirror.elevation;
      if (!mirror.pos || ![mirror.pos.x, mirror.pos.y, mirror.pos.z, mirror.azimuth, altitude].every(Number.isFinite)) {
        throw new TypeError('Mirror positions and angles must be finite numbers.');
      }
      // Compact transport avoids repeating property names for thousands of rigs.
      // The guest reconstructs the public {id, pos, azimuth, altitude} API.
      return [mirror.id, mirror.pos.x, mirror.pos.y, mirror.pos.z, mirror.azimuth, altitude];
    });
    knownIds = ids;
    return copies;
  }
  copyMirrors(initialMirrors);
  let previousSnapshots;

  function encodeSnapshots(snapshots) {
    if (!previousSnapshots || snapshots.length !== previousSnapshots.length || snapshots.some((row, i) => row[0] !== previousSnapshots[i][0])) {
      return [0, snapshots];
    }
    const changes = [];
    for (let i = 0; i < snapshots.length; i++) {
      const row = snapshots[i];
      const previous = previousSnapshots[i];
      const positionChanged = row[1] !== previous[1] || row[2] !== previous[2] || row[3] !== previous[3];
      if (positionChanged || row[4] !== previous[4] || row[5] !== previous[5]) {
        const change = [i, row[4], row[5]];
        if (positionChanged) change.push(row[1], row[2], row[3]);
        changes.push(change);
      }
    }
    return [1, changes];
  }

  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  const vm = runtime.newContext();
  let deadline = Infinity;
  let interrupted = false;
  let logCount = 0;
  let callback;
  let invoke;
  let collect;
  let disposed = false;

  runtime.setInterruptHandler(() => {
    if (Date.now() >= deadline) interrupted = true;
    return interrupted;
  });

  function unwrap(result) {
    if (!result.error) return result.value;
    let detail;
    try { detail = vm.dump(result.error); } finally { result.error.dispose(); }
    const error = new Error(typeof detail === 'object' && detail ? detail.message || 'Script error.' : String(detail));
    error.name = detail?.name || 'Error';
    const location = /update-mirrors\.js:(\d+)(?::(\d+))?/.exec(detail?.stack || '');
    // The strict-function wrapper adds one line before the editor's source.
    if (location) {
      error.line = Math.max(1, Number(location[1]) - 1);
      if (location[2]) error.column = Number(location[2]);
    }
    throw error;
  }

  function bounded(operation, milliseconds = limits.executionMs) {
    interrupted = false;
    deadline = Date.now() + milliseconds;
    try {
      const result = operation();
      if (interrupted) throw new Error('Execution interrupted.');
      return result;
    } catch (error) {
      if (interrupted) {
        const timeout = new Error('Script exceeded the ' + milliseconds + ' ms execution limit.');
        timeout.name = 'TimeoutError';
        throw timeout;
      }
      throw error;
    } finally { deadline = Infinity; }
  }

  function addFunction(name, implementation) {
    const handle = vm.newFunction(name, implementation);
    try { vm.setProp(vm.global, name, handle); } finally { handle.dispose(); }
  }

  function drainJobs() {
    let jobs = 0;
    while (runtime.hasPendingJob()) {
      if (++jobs > limits.promiseJobs) throw new RangeError('Too many Promise jobs in one callback.');
      unwrap(runtime.executePendingJobs(1));
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    callback?.dispose();
    invoke?.dispose();
    collect?.dispose();
    vm.dispose();
    runtime.dispose();
  }

  try {
    addFunction('__reserveConsoleEntry', () => logCount++ < limits.consoleEntries ? vm.true : vm.false);
    addFunction('__writeConsoleEntry', (level, message) => {
      onLog({ level: vm.getString(level), message: vm.getString(message).slice(0, limits.consoleCharacters) });
    });
    addFunction('__sandboxNow', () => vm.newNumber(globalThis.performance?.now() ?? Date.now()));
    bounded(() => unwrap(vm.evalCode(sandboxGlobalsSource(limits), 'sandbox-globals.js')).dispose());

    if (threeSource) {
      // Load the complete installed THREE into the guest, without host objects.
      bounded(() => unwrap(vm.evalCode(
        'globalThis.THREE = (function (exports) {\n' + threeSource + '\n;return exports; })({});',
        'three.cjs',
      )).dispose(), limits.libraryMs);
    }

    // The reference forwards every command through a native bridge. Queue the
    // whole field inside QuickJS instead, then transfer one JSON batch after the
    // callback and its Promise jobs succeed. Captured intrinsics and private
    // records with null prototypes prevent user toJSON hooks from altering it.
    const helpers = bounded(() => unwrap(vm.evalCode(`
      (function () {
        "use strict";
        const apply = Reflect.apply, tag = Object.prototype.toString;
        const Fail = TypeError, RangeFail = RangeError, parse = JSON.parse, stringify = JSON.stringify;
        const freeze = Object.freeze, create = Object.create, setPrototype = Object.setPrototypeOf;
        const push = Array.prototype.push, slice = Array.prototype.slice;
        const finite = Number.isFinite, min = Math.min, max = Math.max, halfPi = Math.PI / 2;
        const P = Promise, resolve = P.resolve;
        const mirrors = create(null), states = create(null);
        let commands, active = false, activeIds = create(null), orderedMirrors;
        function angle(value) {
          if (typeof value !== "number" || !finite(value)) throw new Fail("Angle must be a finite number in radians.");
          return value;
        }
        function altitude(value) { return min(halfPi, max(0, value)); }
        function queue(id, method, az, alt, el) {
          if (!active) throw new Fail("Mirror commands must be called inside updateMirrors.");
          if (commands.length >= ${limits.commandsPerFrame}) throw new RangeFail("Too many mirror commands in one callback.");
          if (activeIds[id] !== true) throw new RangeFail("Unknown mirror: " + id);
          const command = create(null);
          command.id = id;
          command.method = method;
          if (method === "setPose") {
            const pose = create(null);
            if (az !== undefined) pose.azimuth = az;
            if (alt !== undefined) pose.altitude = alt;
            if (el !== undefined) pose.elevation = el;
            command.pose = pose;
          } else if (method !== "reset") command.value = az;
          apply(push, commands, [command]);
        }
        function mirrorFor(snapshot) {
          const id = snapshot[0];
          let state = states[id];
          if (!state) {
            state = states[id] = { azimuth: 0, altitude: halfPi, sourceAzimuth: 0, sourceAltitude: halfPi, pos: null };
            mirrors[id] = freeze({
              id,
              get pos() { return state.pos; },
              get azimuth() { return state.azimuth; },
              get altitude() { return state.altitude; },
              get elevation() { return state.altitude; },
              setAzimuth(value) { angle(value); queue(id, "setAzimuth", value); state.azimuth = value; },
              setAltitude(value) { angle(value); queue(id, "setAltitude", value); state.altitude = altitude(value); },
              setElevation(value) { angle(value); queue(id, "setElevation", value); state.altitude = altitude(value); },
              setPose(pose) {
                if (!pose || typeof pose !== "object" || apply(tag, pose, []) === "[object Array]") throw new Fail("Mirror pose must be an object containing radian angles.");
                const az = pose.azimuth, alt = pose.altitude, el = pose.elevation;
                if (az !== undefined) angle(az);
                if (alt !== undefined) angle(alt);
                if (el !== undefined) angle(el);
                if (alt !== undefined && el !== undefined && alt !== el) throw new Fail("Mirror altitude and elevation must agree when both are supplied.");
                queue(id, "setPose", az, alt, el);
                if (az !== undefined) state.azimuth = az;
                if (alt !== undefined || el !== undefined) state.altitude = altitude(alt === undefined ? el : alt);
              },
              reset() { queue(id, "reset"); state.azimuth = 0; state.altitude = halfPi; },
              getCurrentAzimuth() { return state.azimuth; },
              getCurrentAltitude() { return state.altitude; },
              getCurrentElevation() { return state.altitude; },
            });
          }
          state.azimuth = state.sourceAzimuth = snapshot[4];
          state.altitude = state.sourceAltitude = snapshot[5];
          if (!state.pos || state.pos.x !== snapshot[1] || state.pos.y !== snapshot[2] || state.pos.z !== snapshot[3]) {
            state.pos = freeze({ x: snapshot[1], y: snapshot[2], z: snapshot[3] });
          }
          return mirrors[id];
        }
        function invoke(fn, mirrorsJson, sunJson, receiverJson, validateOnly) {
          const kind = apply(tag, fn, []);
          if (kind !== "[object Function]" && kind !== "[object AsyncFunction]") throw new Fail("updateMirrors must be a function, not a generator.");
          if (validateOnly) return;
          commands = [];
          setPrototype(commands, null);
          const packet = parse(mirrorsJson);
          const changes = packet[1];
          if (packet[0] === 0) {
            activeIds = create(null);
            orderedMirrors = changes;
            setPrototype(orderedMirrors, null);
            for (let i = 0; i < orderedMirrors.length; i++) {
              activeIds[orderedMirrors[i][0]] = true;
              orderedMirrors[i] = mirrorFor(orderedMirrors[i]);
            }
          } else {
            for (let i = 0; i < changes.length; i++) {
              const change = changes[i];
              const state = states[orderedMirrors[change[0]].id];
              state.sourceAzimuth = change[1];
              state.sourceAltitude = change[2];
              if (change.length === 6) state.pos = freeze({ x: change[3], y: change[4], z: change[5] });
            }
          }
          // Queued setters update getters immediately within a callback. At the
          // next callback restore the supplied host pose, even if its snapshot
          // is identical to the previous input and therefore has no wire delta.
          for (let i = 0; i < orderedMirrors.length; i++) {
            const state = states[orderedMirrors[i].id];
            state.azimuth = state.sourceAzimuth;
            state.altitude = state.sourceAltitude;
          }
          active = true;
          // Give user code its own ordinary array. Private ordering stays intact
          // if that code sorts, replaces, or removes items from its copy.
          const list = apply(slice, orderedMirrors, []);
          const result = apply(fn, undefined, [list, parse(sunJson), parse(receiverJson)]);
          return apply(resolve, P, [result]);
        }
        function collect(discard) {
          active = false;
          if (discard) { commands = undefined; return; }
          const json = stringify(commands);
          // 256-char ids can require six JSON chars each; 2048 chars/command
          // also covers its finite numeric values, method, and object keys.
          if (json.length > ${limits.commandsPerFrame * 2048 + 2}) throw new RangeFail("Mirror command batch is too large.");
          commands = undefined;
          return json;
        }
        return { invoke, collect };
      })()
    `, 'sandbox-internal.js')));
    try {
      invoke = vm.getProp(helpers, 'invoke');
      collect = vm.getProp(helpers, 'collect');
    } finally { helpers.dispose(); }
    callback = bounded(() => unwrap(vm.evalCode(
      '(function () { "use strict";\n' + source +
      '\n;return typeof updateMirrors === "function" ? updateMirrors : null; })()',
      'update-mirrors.js',
    )));
    if (vm.typeof(callback) !== 'function') throw new TypeError('Define function updateMirrors(mirrorList, sunData, receiverTargetPos).');
    bounded(() => unwrap(vm.callFunction(invoke, vm.undefined, callback, vm.undefined, vm.undefined, vm.undefined, vm.true)).dispose());
    bounded(drainJobs);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    tick(mirrorSnapshots, sunData, receiverTargetPos) {
      if (disposed) throw new Error('The sandbox has been stopped.');
      const mirrors = copyMirrors(mirrorSnapshots);
      const mirrorPacket = encodeSnapshots(mirrors);
      if (!sunData || !Number.isFinite(sunData.azimuth) || !Number.isFinite(sunData.elevation ?? sunData.altitude)) {
        throw new TypeError('Sun angles must be finite radians.');
      }
      if (!receiverTargetPos || ![receiverTargetPos.x, receiverTargetPos.y, receiverTargetPos.z].every(Number.isFinite)) {
        throw new TypeError('Receiver target position must be finite.');
      }
      const elevation = sunData.elevation ?? sunData.altitude;
      const sun = { azimuth: sunData.azimuth, elevation, altitude: elevation };
      for (const key of ['timeMinutes', 'elapsedTime', 'deltaTime']) {
        if (sunData[key] !== undefined) {
          if (!Number.isFinite(sunData[key])) throw new TypeError('Sun time values must be finite.');
          sun[key] = sunData[key];
        }
      }
      const receiver = { x: receiverTargetPos.x, y: receiverTargetPos.y, z: receiverTargetPos.z };
      logCount = 0;
      const handles = [];
      let json;
      try {
        for (const value of [mirrorPacket, sun, receiver]) handles.push(vm.newString(JSON.stringify(value)));
        bounded(() => {
          const result = unwrap(vm.callFunction(invoke, vm.undefined, callback, ...handles, vm.false));
          try {
            drainJobs();
            const state = vm.getPromiseState(result);
            if (state.type === 'pending') throw new TypeError('updateMirrors returned a Promise that did not settle within this callback.');
            unwrap(state).dispose();
          } finally { result.dispose(); }
          // Serialization stays under the same deadline as the callback.
          const batch = unwrap(vm.callFunction(collect, vm.undefined, vm.false));
          try { json = vm.getString(batch); } finally { batch.dispose(); }
        });
        if (json.length > limits.commandsPerFrame * 2048 + 2) throw new RangeError('Mirror command batch is too large.');
        const commands = JSON.parse(json);
        if (!Array.isArray(commands) || commands.length > limits.commandsPerFrame || commands.some(command => !knownIds.has(command.id))) {
          throw new TypeError('Invalid sandbox command batch.');
        }
        previousSnapshots = mirrors;
        return commands;
      } catch (error) {
        previousSnapshots = undefined;
        // No command leaves the guest on a failed callback. Discard also
        // deactivates saved mirror methods before a subsequent direct tick.
        try { bounded(() => unwrap(vm.callFunction(collect, vm.undefined, vm.true)).dispose()); } catch {}
        throw error;
      } finally {
        for (const handle of handles) handle.dispose();
      }
    },
    dispose,
  };
}
