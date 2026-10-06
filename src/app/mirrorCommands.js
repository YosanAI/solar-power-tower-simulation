import { clamp } from '../utils/math.js';

// A full field can issue several angle commands per mirror in one callback.
export const MAX_MIRROR_COMMANDS = 65_536;

/** Normalize the API's radian angles without changing the supplied rig. */
export function normalizeMirrorPose(currentPose, pose = {}) {
  if (!pose || typeof pose !== 'object' || Array.isArray(pose)) {
    throw new TypeError('Mirror pose must be an object containing radian angles.');
  }
  if (
    pose.altitude !== undefined &&
    pose.elevation !== undefined &&
    pose.altitude !== pose.elevation
  ) {
    throw new TypeError('Mirror altitude and elevation must agree when both are supplied.');
  }
  const azimuth = pose.azimuth === undefined ? currentPose.azimuth : pose.azimuth;
  const altitude = pose.altitude === undefined
    ? (pose.elevation === undefined ? currentPose.altitude : pose.elevation)
    : pose.altitude;
  if (!Number.isFinite(azimuth) || !Number.isFinite(altitude)) {
    throw new TypeError('Rig angles must be finite radians.');
  }
  return { azimuth, altitude: clamp(altitude, 0, Math.PI / 2) };
}

/**
 * Validate a whole sandbox response before the field changes. Successive
 * commands for a mirror are resolved against its staged pose, preserving order.
 */
export function validateMirrorCommands(commands, rigsOrById) {
  if (!Array.isArray(commands)) {
    throw new TypeError('Mirror commands must be an array.');
  }
  if (commands.length > MAX_MIRROR_COMMANDS) {
    throw new RangeError(`A mirror update may contain at most ${MAX_MIRROR_COMMANDS} commands.`);
  }
  const byId = rigsOrById instanceof Map
    ? rigsOrById
    : new Map(rigsOrById.map((rig) => [rig.id, rig]));
  const stagedPoses = new Map();

  for (const command of commands) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new TypeError('Each mirror command must be an object.');
    }
    const rig = byId.get(command.id);
    if (!rig) throw new RangeError(`Unknown mirror: ${String(command.id)}`);
    const currentPose = stagedPoses.get(rig) || rig;
    let pose;
    switch (command.method) {
      case 'setAzimuth':
        pose = { azimuth: command.value };
        break;
      case 'setAltitude':
      case 'setElevation':
        pose = { altitude: command.value };
        break;
      case 'setPose':
        pose = command.pose;
        if (pose === undefined) {
          throw new TypeError('setPose requires a pose object.');
        }
        break;
      case 'reset':
        pose = rig.initialPose;
        break;
      default:
        throw new TypeError(`Unknown mirror method: ${String(command.method)}`);
    }
    // A missing setter value is invalid; partial setPose calls remain supported.
    if (
      ['setAzimuth', 'setAltitude', 'setElevation'].includes(command.method) &&
      !Number.isFinite(command.value)
    ) {
      throw new TypeError('Rig angles must be finite radians.');
    }
    stagedPoses.set(rig, normalizeMirrorPose(currentPose, pose));
  }
  return stagedPoses;
}
