import { SANDBOX_LIMITS, validateConsoleEntries, serializeSandboxError } from './sandbox-limits.js';

export const DAY_DURATION_SECONDS = 12;

export const DEFAULT_CODE = `function updateMirrors(mirrorList /* Mirror[] */, sunData /* {azimuth, elevation} */, receiverTargetPos /* {x, y, z} */) {
  // Angles are radians. mirror.pos is {x, y, z}.
  // receiverTargetPos is the tower receiver position.
  // Uncomment to try the example.
  /*
  for (const mirror of mirrorList) {
    const azimuth = mirror.getCurrentAzimuth() + 0.03;
    mirror.setAzimuth(azimuth);
    mirror.setElevation(Math.sin(azimuth));
  }
  */
}
`;

const defaultWorker = () => new Worker(new URL('./sandbox.worker.js', import.meta.url), { type: 'module' });

/** Reference worker lifecycle, adapted to bounded whole-field day playback. */
export function createSimulationRunner(api, {
  onStateChange = () => {},
  onError = () => {},
  onStart = () => {},
  onStop = () => {},
  onLog = entry => console[entry.level]('[updateMirrors]', entry.message),
  createWorker = defaultWorker,
  startupTimeoutMs = SANDBOX_LIMITS.startupMs,
  responseTimeoutMs = SANDBOX_LIMITS.responseMs,
} = {}) {
  let worker = null;
  let ready = false;
  let started = false;
  let pendingId = null;
  let nextId = 0;
  let watchdog;
  let elapsedTime = 0;
  let lastSentTime = 0;
  let finalFrame = false;
  let sunDirty = false;
  let updatingSun = false;
  let consoleWindow = 0;
  let consoleCount = 0;

  function stop(phase = 'stopped') {
    clearTimeout(watchdog);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
    worker = null;
    ready = false;
    started = false;
    pendingId = null;
    sunDirty = false;
    onStop();
    onStateChange(false, phase);
  }

  function fail(error) {
    stop();
    onError(error);
  }

  function armWatchdog(instance, milliseconds) {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (worker !== instance) return;
      const error = new Error('The script sandbox stopped responding and was terminated.');
      error.name = 'TimeoutError';
      fail(error);
    }, milliseconds);
  }

  function receive(instance, message) {
    if (worker !== instance) return;
    try {
      validateConsoleEntries(message?.logs);
      const now = Date.now();
      if (now - consoleWindow >= 1000) { consoleWindow = now; consoleCount = 0; }
      for (const entry of message?.logs || []) {
        if (consoleCount >= SANDBOX_LIMITS.consoleEntriesPerSecond) break;
        consoleCount++;
        onLog(entry);
      }
      if (message?.type === 'error') {
        const detail = serializeSandboxError(message.error);
        const error = new Error(detail.message);
        Object.assign(error, detail);
        fail(error);
      } else if (message?.type === 'ready' && !ready) {
        clearTimeout(watchdog);
        ready = true;
        onStateChange(true, 'running');
      } else if (message?.type === 'frame' && ready && pendingId !== null && message.id === pendingId) {
        // applyMirrorCommands validates and stages the entire batch before mutation.
        api.applyMirrorCommands(message.commands);
        clearTimeout(watchdog);
        pendingId = null;
        if (!started) {
          started = true;
          onStart();
        }
        if (finalFrame) stop('complete');
      } else {
        throw new Error('Invalid response from the script sandbox.');
      }
    } catch (error) {
      fail(error);
    }
  }

  return {
    run(source) {
      stop();
      elapsedTime = 0;
      lastSentTime = 0;
      nextId = 0;
      finalFrame = false;
      consoleWindow = Date.now();
      consoleCount = 0;
      try {
        if (typeof source !== 'string' || source.length > SANDBOX_LIMITS.sourceLength) {
          throw new RangeError('Script must be at most ' + SANDBOX_LIMITS.sourceLength / 1024 + 'K characters.');
        }
        const instance = createWorker();
        worker = instance;
        instance.onmessage = event => receive(instance, event.data);
        instance.onerror = event => {
          event.preventDefault?.();
          if (worker === instance) fail(new Error(event.message || 'The script sandbox crashed.'));
        };
        instance.onmessageerror = () => {
          if (worker === instance) fail(new Error('The script sandbox sent unreadable data.'));
        };
        onStateChange(true, 'starting');
        armWatchdog(instance, startupTimeoutMs);
        instance.postMessage({ type: 'init', source, mirrors: api.getMirrorSnapshots() });
        return true;
      } catch (error) {
        fail(error);
        return false;
      }
    },
    stop: () => stop(),
    tick(deltaTime) {
      if (!worker || !ready || !Number.isFinite(deltaTime) || deltaTime < 0) return;
      // Use visible elapsed seconds, so the duration remains meaningful at low FPS.
      if (started) elapsedTime = Math.min(DAY_DURATION_SECONDS, elapsedTime + deltaTime);
      // Never queue work behind slow code; the next callback sees the latest time.
      if (pendingId !== null) return;
      if (started && elapsedTime === lastSentTime && !sunDirty) return;
      const instance = worker;
      const day = api.getSolarDay();
      finalFrame = started && elapsedTime >= DAY_DURATION_SECONDS;
      try {
        // Explicit manual sun edits get one callback before automatic playback resumes.
        if (!started || !sunDirty || finalFrame) {
          updatingSun = true;
          try {
            api.setSunTime(day.sunrise + (day.sunset - day.sunrise) * (elapsedTime / DAY_DURATION_SECONDS));
          } finally { updatingSun = false; }
        }
        sunDirty = false;
        const sunData = {
          ...api.getSunData(),
          elapsedTime,
          deltaTime: elapsedTime - lastSentTime,
        };
        lastSentTime = elapsedTime;
        pendingId = ++nextId;
        armWatchdog(instance, responseTimeoutMs);
        instance.postMessage({
          type: 'frame', id: pendingId,
          mirrors: api.getMirrorSnapshots(),
          sunData,
          receiverTargetPos: api.getReceiverTargetPos(),
        });
      } catch (error) {
        fail(error);
      }
    },
    sunChanged() { if (worker && !updatingSun) sunDirty = true; },
    isRunning: () => worker !== null,
    getTime: () => elapsedTime,
  };
}
