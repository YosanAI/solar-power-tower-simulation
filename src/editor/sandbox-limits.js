// Adapted from YosanAI/cram-gun-simulater's editor sandbox. A callback controls
// the complete heliostat field, so its heap/stack/job/command budgets are larger.
export const SANDBOX_LIMITS = Object.freeze({
  executionMs: 1000,
  libraryMs: 5000,
  memoryBytes: 256 * 1024 * 1024,
  stackBytes: 2 * 1024 * 1024,
  sourceLength: 256 * 1024,
  mirrorsPerFrame: 10_000,
  commandsPerFrame: 65_536,
  consoleEntries: 64,
  consoleEntriesPerSecond: 200,
  consoleCharacters: 8000,
  consoleArguments: 32,
  promiseJobs: 4096,
  startupMs: 15_000,
  responseMs: 5000,
});

export const CONSOLE_LEVELS = Object.freeze(['log', 'info', 'warn', 'error', 'debug']);
export const CONSOLE_METHODS = Object.freeze([
  ...CONSOLE_LEVELS, 'dir', 'table', 'assert', 'count', 'countReset', 'time', 'timeLog', 'timeEnd',
  'trace', 'group', 'groupCollapsed', 'groupEnd', 'clear',
]);

export function validateConsoleEntries(entries = []) {
  if (!Array.isArray(entries) || entries.length > SANDBOX_LIMITS.consoleEntries || entries.some(entry =>
    !entry || !CONSOLE_LEVELS.includes(entry.level) || typeof entry.message !== 'string' ||
    entry.message.length > SANDBOX_LIMITS.consoleCharacters)) {
    throw new TypeError('Invalid sandbox console output.');
  }
}

export function serializeSandboxError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 100),
    message: String(error?.message || error || 'Unknown script error.').slice(0, 2000),
    line: Number.isInteger(error?.line) && error.line > 0 ? error.line : undefined,
    column: Number.isInteger(error?.column) && error.column > 0 ? error.column : undefined,
  };
}
