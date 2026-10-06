import { CONFIG } from './config.js';

// Mirror normals start straight up; sun controls do not move the mirrors.
export function initialMirrorPose() {
  return {
    azimuth: 0,
    elevation: Math.PI / 2,
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
