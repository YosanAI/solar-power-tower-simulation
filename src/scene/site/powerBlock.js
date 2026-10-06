import * as THREE from 'three';
import { Parts, ringRail, boxRail } from '../../utils/geometry.js';
import { addSign } from './signs.js';
import { createPipework } from './pipework.js';

function createStorageTank(parts, x, z, name) {
  parts.cylinder('foundation', [x, 0.28, z], 13.55, 13.55, 0.55, 64);
  parts.cylinder('tank', [x, 6.7, z], 12.35, 12.35, 12.35, 64);
  parts.cylinder('tank', [x, 13.04, z], 1.5, 12.48, 0.52, 64);
  parts.cylinder('steel', [x, 13.41, z], 1.0, 1.0, 0.23, 24);
  for (let y = 2; y < 13; y += 2.08)
    parts.torus(
      'brightSteel',
      [x, y, z],
      12.38,
      0.026,
      [Math.PI / 2, 0, 0],
      64,
    );
  for (let componentIndex = 0; componentIndex < 48; componentIndex++) {
    const angle = (componentIndex / 48) * Math.PI * 2;
    parts.pipe(
      'brightSteel',
      [x + Math.cos(angle) * 12.375, 0.6, z + Math.sin(angle) * 12.375],
      [x + Math.cos(angle) * 12.375, 12.9, z + Math.sin(angle) * 12.375],
      0.013,
      4,
    );
  }
  parts.add(
    new THREE.RingGeometry(11.7, 12.6, 64),
    'steel',
    [x, 13.02, z],
    [-Math.PI / 2, 0, 0],
  );
  ringRail(parts, [x, z], 12.02, 13.02, 'steel', 40);
  // Roof access stair stringers, steps and handrails around a partial helix.
  const stepCount = 48,
    startAngle = -0.6,
    endAngle = 1.4;
  for (let componentIndex = 0; componentIndex < stepCount; componentIndex++) {
    const stepProgress = componentIndex / (stepCount - 1),
      angle = startAngle + (endAngle - startAngle) * stepProgress,
      stairRadius = 13.08,
      y = 0.6 + stepProgress * 12.5;
    parts.box(
      'steel',
      [x + Math.sin(angle) * stairRadius, y, z + Math.cos(angle) * stairRadius],
      [1.35, 0.085, 0.49],
      [0, angle, 0],
    );
    if (componentIndex % 3 === 0)
      for (const railRadius of [12.47, 13.68])
        parts.pipe(
          'steel',
          [
            x + Math.sin(angle) * railRadius,
            y,
            z + Math.cos(angle) * railRadius,
          ],
          [
            x + Math.sin(angle) * railRadius,
            y + 1.05,
            z + Math.cos(angle) * railRadius,
          ],
          0.035,
          6,
        );
    if (componentIndex > 0) {
      const previousAngle =
          startAngle +
          ((endAngle - startAngle) * (componentIndex - 1)) / (stepCount - 1),
        previousStepHeight =
          0.6 + ((componentIndex - 1) / (stepCount - 1)) * 12.5;
      for (const railRadius of [12.47, 13.68]) {
        parts.pipe(
          'steel',
          [
            x + Math.sin(previousAngle) * railRadius,
            previousStepHeight + 1.05,
            z + Math.cos(previousAngle) * railRadius,
          ],
          [
            x + Math.sin(angle) * railRadius,
            y + 1.05,
            z + Math.cos(angle) * railRadius,
          ],
          0.03,
          6,
        );
        parts.beam(
          'steel',
          [
            x + Math.sin(previousAngle) * railRadius,
            previousStepHeight - 0.08,
            z + Math.cos(previousAngle) * railRadius,
          ],
          [
            x + Math.sin(angle) * railRadius,
            y - 0.08,
            z + Math.cos(angle) * railRadius,
          ],
          0.07,
          0.13,
        );
      }
    }
  }
}
export function createPowerBlock(scene, materials) {
  const root = new THREE.Group();
  root.name = 'PowerBlockAndThermalStorage';
  scene.add(root);
  const parts = new Parts();
  parts.box('asphalt', [100, 0.04, 127], [146, 0.09, 180]);
  // Tank bund: floor, containment walls, hot and cold insulated tanks.
  parts.box('foundation', [80, 0.07, 77], [72, 0.14, 42]);
  for (const x of [44, 116])
    parts.box('foundation', [x, 0.7, 77], [0.55, 1.4, 42]);
  for (const z of [56, 98])
    parts.box('foundation', [80, 0.7, z], [72, 1.4, 0.55]);
  createStorageTank(parts, 62.5, 77, 'HOT');
  createStorageTank(parts, 97.5, 77, 'COLD');
  // Connected pipe lanes and their supporting racks are built separately.
  // Turbine / generator hall with cladding, roof vents and service doors.
  parts.box('foundation', [84, 0.25, 133], [48, 0.5, 31]);
  parts.box('wall', [84, 8.8, 133], [44, 17, 27]);
  parts.box('roof', [84, 17.6, 133], [45, 0.42, 28.3]);
  for (let x = 63; x <= 105; x += 1.1) {
    parts.box('white', [x, 8.8, 146.53], [0.075, 16.8, 0.05]);
    parts.box('white', [x, 8.8, 119.47], [0.075, 16.8, 0.05]);
  }
  for (const x of [71, 84, 97]) {
    parts.box('darkSteel', [x, 3.55, 146.61], [6.2, 6.6, 0.08]);
    parts.box('roof', [x, 3.55, 146.68], [5.9, 6.4, 0.05]);
    for (let y = 0.6; y < 7; y += 0.4)
      parts.box('steel', [x, y, 146.73], [5.85, 0.025, 0.028]);
    parts.box('white', [x, 18.4, 133], [5.3, 1.55, 4.0]);
    for (let componentIndex = 0; componentIndex < 5; componentIndex++)
      parts.box(
        'darkSteel',
        [x - 2 + componentIndex, 18.6, 135.02],
        [0.55, 0.65, 0.03],
      );
  }
  // Steam generator steelwork and insulated vertical heat exchangers.
  for (const x of [124, 137])
    for (const z of [68, 95]) parts.box('steel', [x, 10, z], [0.38, 20, 0.38]);
  for (const y of [4, 10, 16, 20]) {
    parts.box('steel', [130.5, y, 68], [13.5, 0.3, 0.3]);
    parts.box('steel', [130.5, y, 95], [13.5, 0.3, 0.3]);
    for (const x of [124, 137])
      parts.box('steel', [x, y, 81.5], [0.3, 0.3, 27]);
  }
  for (const x of [124, 137])
    for (const z of [68, 82]) {
      parts.beam('steel', [x, 0, z], [x, 10, z + 13], 0.14);
      parts.beam('steel', [x, 10, z], [x, 20, z + 13], 0.14);
    }
  for (const z of [72, 81.5, 91]) {
    parts.cylinder('tank', [130.5, 11.6, z], 2.5, 2.5, 15, 24);
    parts.sphere('tank', [130.5, 19.05, z], 2.5, [1, 0.42, 1]);
    parts.sphere('tank', [130.5, 4.1, z], 2.5, [1, 0.42, 1]);
    for (const offsetX of [-1.3, 1.3])
      for (const offsetZ of [-1.3, 1.3]) {
        parts.cylinder(
          'steel',
          [130.5 + offsetX, 2.22, z + offsetZ],
          0.16,
          0.16,
          4.0,
          12,
        );
        parts.box(
          'foundation',
          [130.5 + offsetX, 0.22, z + offsetZ],
          [0.85, 0.44, 0.85],
        );
      }
  }
  // Open service catwalks flank the vessels; no solid floor cuts through them.
  for (const x of [124.9, 136.1]) {
    parts.box('steel', [x, 16.15, 81.5], [1.3, 0.14, 28]);
    boxRail(parts, x, 81.5, 1.3, 28, 16.23);
  }
  for (const z of [68, 95])
    parts.box('steel', [130.5, 16.15, z], [12.5, 0.14, 1.2]);

  // Air-cooled condenser: elevated A-frame fin banks, fans UNDER the banks.
  const condenserX = 78,
    condenserZ = 185;
  for (const x of [44, 57.6, 71.2, 84.8, 98.4, 112])
    for (const z of [175, 195]) {
      parts.box('steel', [x, 5.3, z], [0.28, 10.6, 0.28]);
      parts.box('foundation', [x, 0.22, z], [1.7, 0.44, 1.7]);
    }
  for (const z of [175, 195]) {
    parts.box('steel', [78, 10.6, z], [70, 0.36, 0.32]);
    for (let x = 44; x < 112; x += 13.6)
      parts.beam('steel', [x, 1.8, z], [x + 13.6, 10.5, z], 0.14);
  }
  for (const sign of [-1, 1]) {
    parts.box(
      'roof',
      [78, 12.56, 185 + sign * 5.1],
      [69.2, 0.28, 10.65],
      [sign * 0.285, 0, 0],
    );
    for (let x = 44; x <= 112; x += 1.2)
      parts.beam(
        'brightSteel',
        [x, 11.05, 185 + sign * 10.2],
        [x, 14.05, 185],
        0.046,
        0.1,
      );
  }
  parts.box('steel', [78, 14.24, 183.25], [70, 0.15, 1.25]);
  boxRail(parts, 78, 183.25, 70, 1.25, 14.32, 'steel', 1.0);
  for (let bayIndex = 0; bayIndex < 5; bayIndex++) {
    const x = 50.8 + bayIndex * 13.6;
    parts.cylinder(
      'darkSteel',
      [x, 10.4, 185],
      4.25,
      4.25,
      0.6,
      28,
      [0, 0, 0],
      true,
    );
    parts.cylinder('steel', [x, 10.5, 185], 0.6, 0.6, 0.95, 16);
    for (let componentIndex = 0; componentIndex < 6; componentIndex++) {
      const angle = (componentIndex / 6) * Math.PI * 2;
      parts.box(
        'steel',
        [x + Math.cos(angle) * 2.1, 10.52, 185 + Math.sin(angle) * 2.1],
        [3.55, 0.085, 0.61],
        [0, -angle, 0.07],
      );
    }
  }

  // Control building and electrical switchyard.
  parts.box('wall', [147, 4.0, 121], [20, 8, 13]);
  parts.box('roof', [147, 8.15, 121], [21, 0.3, 14]);
  for (let bayIndex = 0; bayIndex < 5; bayIndex++)
    parts.box(
      'glass',
      [139.2 + bayIndex * 3.75, 4.6, 127.53],
      [2.5, 2.4, 0.08],
    );
  parts.box('darkSteel', [155.2, 2, 127.58], [1.65, 3.65, 0.1]);
  parts.box('foundation', [144, 0.13, 166], [41, 0.25, 52]);
  for (const z of [150, 168, 186]) {
    parts.box('darkSteel', [140, 2.1, z], [7, 3.7, 4.2]);
    parts.box('steel', [140, 4.2, z], [7.2, 0.3, 4.4]);
    for (let componentIndex = 0; componentIndex < 12; componentIndex++)
      parts.box(
        'tank',
        [136.25, 2.3, z - 1.95 + componentIndex * 0.35],
        [0.8, 2.9, 0.11],
      );
    for (const x of [138, 140, 142]) {
      parts.cylinder('white', [x, 5.5, z], 0.24, 0.31, 2.4, 12);
      for (let y = 4.5; y < 6.6; y += 0.22)
        parts.cylinder('white', [x, y, z], 0.34, 0.34, 0.055, 12);
    }
  }
  for (const z of [146, 165, 189]) {
    for (const x of [129, 160]) parts.box('steel', [x, 6, z], [0.26, 12, 0.26]);
    parts.box('steel', [144.5, 12, z], [32, 0.32, 0.32]);
    for (const x of [136, 143, 150]) {
      parts.pipe('steel', [x, 12, z], [x, 13.6, z], 0.065, 8);
      for (let y = 12.3; y < 13.6; y += 0.24)
        parts.cylinder('white', [x, y, z], 0.2, 0.2, 0.08, 10);
    }
  }
  for (const x of [136, 143, 150])
    parts.pipe('darkSteel', [x, 13.65, 146], [x, 13.65, 189], 0.04, 6);
  // A small parked service vehicle provides a familiar scale reference.
  parts.box('white', [50, 1.08, 121], [2.05, 1.07, 4.65]);
  parts.box('white', [50, 1.93, 120.3], [1.95, 0.95, 2.05]);
  parts.box('glass', [50, 2.0, 121.345], [1.72, 0.61, 0.035]);
  parts.box('glass', [50, 2.0, 119.255], [1.72, 0.61, 0.035]);
  for (const x of [48.94, 51.06])
    for (const z of [119.5, 122.5]) {
      parts.cylinder('rubber', [x, 0.58, z], 0.47, 0.47, 0.26, 16, [
        0,
        0,
        Math.PI / 2,
      ]);
      parts.cylinder(
        'steel',
        [x + (x < 50 ? -0.14 : 0.14), 0.58, z],
        0.24,
        0.24,
        0.03,
        12,
        [0, 0, Math.PI / 2],
      );
    }
  parts.build(root, materials, 'PowerBlock');
  addSign(
    root,
    'HOT SALT',
    'INSULATED THERMAL STORAGE',
    [62.5, 8.2, 89.88],
    6.6,
    1.65,
  );
  addSign(
    root,
    'COLD SALT',
    'INSULATED THERMAL STORAGE',
    [97.5, 8.2, 89.88],
    6.6,
    1.65,
  );
  addSign(
    root,
    'TURBINE HALL',
    'STEAM CYCLE  /  GENERATOR',
    [84, 12.3, 146.74],
    11,
    2.75,
  );
  addSign(root, 'CONTROL', 'OPERATIONS', [147, 7.0, 127.62], 6, 1.5);
  createPipework(scene, materials);
  return root;
}
