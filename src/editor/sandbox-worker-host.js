import { createMirrorSandbox } from './mirror-sandbox.js';
import { serializeSandboxError } from './sandbox-limits.js';

export function createSandboxWorkerHost(loadQuickJS, send, { threeSource } = {}) {
  let sandbox;
  let logs = [];
  return async function receive(message) {
    logs = [];
    try {
      if (message.type === 'init') {
        sandbox?.dispose();
        sandbox = createMirrorSandbox(await loadQuickJS(), message.source, message.mirrors, undefined, { threeSource, onLog: entry => logs.push(entry) });
        send({ type: 'ready', logs });
      } else if (message.type === 'frame' && sandbox) {
        const commands = sandbox.tick(message.mirrors, message.sunData, message.receiverTargetPos);
        send({ type: 'frame', id: message.id, commands, logs });
      } else {
        throw new Error('Invalid sandbox request.');
      }
    } catch (error) {
      send({ type: 'error', error: serializeSandboxError(error), logs });
      sandbox?.dispose();
      sandbox = undefined;
    }
  };
}
