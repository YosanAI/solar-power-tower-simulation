import { CONFIG } from './config.js';
import { sunDirection } from '../utils/math.js';

// Aim once when constructing the scene; sun controls do not move the mirrors.
export function initialMirrorPose(x, z) {
  const directionToSun = sunDirection(CONFIG.sunAzimuth, CONFIG.sunAltitude);
  const directionToReceiver = [
    -x,
    CONFIG.receiverCenter[1] -
      CONFIG.azimuthAxisHeight -
      CONFIG.elevationAxisOffset,
    -z,
  ];
  const receiverDistance = Math.hypot(...directionToReceiver);
  const mirrorNormal = directionToReceiver.map(
    (component, axis) => component / receiverDistance + directionToSun[axis],
  );

  return {
    azimuth: Math.atan2(mirrorNormal[0], mirrorNormal[2]),
    altitude: Math.atan2(
      mirrorNormal[1],
      Math.hypot(mirrorNormal[0], mirrorNormal[2]),
    ),
  };
}

export function createFieldLayout() {
  const positions = [];
  const rings = [];
  let radius = CONFIG.fieldInnerRadius;
  let row = 0;
  let count = 0;

  while (radius <= CONFIG.fieldOuterRadius) {
    if (row % 2 === 0) {
      count =
        Math.floor((2 * Math.PI * radius) / (7.6 + radius * 0.012) / 4) * 4;
    }

    const phase = row % 2 ? Math.PI / count : 0;
    rings.push({ radius, count, phase });

    for (let mirrorIndex = 0; mirrorIndex < count; mirrorIndex++) {
      const angle = (mirrorIndex / count) * Math.PI * 2 + phase;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;

      // Keep the mirrors' full swept envelopes clear of roads and the power block.
      if (
        Math.abs(x) < 9 ||
        Math.abs(z) < 7.5 ||
        (x > 24 && x < 180 && z > 27 && z < 224)
      ) {
        continue;
      }

      positions.push({
        id: `H-${String(positions.length + 1).padStart(4, '0')}`,
        x,
        z,
        row,
        angle,
        sector: Math.floor(
          ((angle + Math.PI / 4) % (Math.PI * 2)) / (Math.PI / 2),
        ),
      });
    }

    radius += 7.8 + radius * 0.026;
    row++;
  }

  return { positions, rings, outerRadius: rings.at(-1).radius };
}
