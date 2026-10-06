import * as THREE from 'three';
import { Parts, routedPipe } from '../../utils/geometry.js';
import { PIPE_ROUTES } from './pipe-layout.js';

const UP_AXIS = new THREE.Vector3(0, 1, 0);

function flange(parts, point, direction, radius, band) {
  const centerPoint = new THREE.Vector3(...point),
    pipeDirection = new THREE.Vector3(...direction).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(
    UP_AXIS,
    pipeDirection,
  );
  parts.add(
    new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 0.12, 20),
    'brightSteel',
    point,
    orientation,
  );
  if (band)
    parts.add(
      new THREE.CylinderGeometry(radius * 1.015, radius * 1.015, 0.45, 16),
      band,
      centerPoint.clone().addScaledVector(pipeDirection, 0.55).toArray(),
      orientation,
    );
  const tangentAxis = new THREE.Vector3(
    Math.abs(pipeDirection.y) > 0.9 ? 1 : 0,
    Math.abs(pipeDirection.y) > 0.9 ? 0 : 1,
    0,
  )
    .cross(pipeDirection)
    .normalize();
  const bitangentAxis = pipeDirection.clone().cross(tangentAxis).normalize();
  for (let boltIndex = 0; boltIndex < 8; boltIndex++) {
    const boltAngle = (boltIndex / 8) * Math.PI * 2,
      boltPosition = centerPoint
        .clone()
        .addScaledVector(tangentAxis, Math.cos(boltAngle) * radius * 1.16)
        .addScaledVector(bitangentAxis, Math.sin(boltAngle) * radius * 1.16);
    parts.add(
      new THREE.CylinderGeometry(0.035, 0.035, 0.19, 6),
      'darkSteel',
      boltPosition.toArray(),
      orientation,
    );
  }
}
function rackFrame(parts, x, z, width, height, alongX = false) {
  const footingHeight = 0.45;
  const supportPositions = alongX
    ? [
        [x, z - width / 2],
        [x, z + width / 2],
      ]
    : [
        [x - width / 2, z],
        [x + width / 2, z],
      ];
  for (const [supportX, supportZ] of supportPositions) {
    parts.box('foundation', [supportX, 0.18, supportZ], [0.9, 0.36, 0.9]);
    parts.box('steel', [supportX, height / 2, supportZ], [0.16, height, 0.18]);
  }
  parts.box(
    'steel',
    [x, height, z],
    alongX ? [0.21, 0.23, width + 0.25] : [width + 0.25, 0.23, 0.21],
  );
  // Bracing stops at the rack beam, below the insulated pipe bore.
  parts.beam(
    'steel',
    [supportPositions[0][0], footingHeight, supportPositions[0][1]],
    [supportPositions[1][0], height - 0.2, supportPositions[1][1]],
    0.065,
  );
}
export function createPipework(scene, materials) {
  const root = new THREE.Group();
  root.name = 'ConnectedExteriorPipework';
  scene.add(root);
  const parts = new Parts();
  for (const route of PIPE_ROUTES) {
    const routePath = routedPipe(
      parts,
      'tank',
      route.points,
      route.radius,
      Math.max(1.1, route.radius * 3.2),
    );
    // Flanges and colour bands on straight runs only; none at floating ends.
    for (let runIndex = 0; runIndex < route.points.length - 1; runIndex++) {
      const runStart = new THREE.Vector3(...route.points[runIndex]),
        runEnd = new THREE.Vector3(...route.points[runIndex + 1]);
      const runDelta = runEnd.clone().sub(runStart),
        runLength = runDelta.length();
      if (runLength < 7) continue;
      const runDirection = runDelta.normalize();
      const flangeCount = runLength > 40 ? Math.ceil(runLength / 14) : 1;
      for (let flangeIndex = 0; flangeIndex < flangeCount; flangeIndex++) {
        const flangeFraction = (flangeIndex + 1) / (flangeCount + 1),
          flangePosition = runStart
            .clone()
            .addScaledVector(runDirection, runLength * flangeFraction);
        flange(
          parts,
          flangePosition.toArray(),
          runDirection.toArray(),
          route.radius,
          route.band,
        );
      }
    }
    root.userData.routes ??= [];
    root.userData.routes.push({
      name: route.name,
      radius: route.radius,
      endpoints: [route.points[0], route.points.at(-1)],
      samples: routePath.getPoints(240).map((sample) => sample.toArray()),
    });
  }
  // Tower-mounted guides; the two full-height lines end inside the head casing.
  for (let y = 10; y < 124; y += 9) {
    const x = 8.82 - ((y - 6.4) / (126.6 - 6.4)) * 2.7;
    for (const z of [-1.2, 1.2]) {
      parts.beam('steel', [x - 0.93, y, z], [x + 0.47, y, z], 0.12, 0.1);
      parts.torus(
        'darkSteel',
        [x, y, z],
        z > 0 ? 0.43 : 0.37,
        0.029,
        [Math.PI / 2, 0, 0],
        16,
      );
    }
  }
  // Portal racks supporting two physically separated parallel lanes.
  for (const z of [10, 22, 34]) {
    rackFrame(parts, 29.8, z, 6.0, 5.85);
    parts.box('steel', [31.6, 6.62, z], [0.22, 1.52, 0.2]);
    parts.box('steel', [31.6, 7.34, z], [1.12, 0.17, 0.2]);
  }
  for (const x of [43, 56, 73, 89]) {
    rackFrame(parts, x, 46, 7.0, 5.85, true);
    parts.box('steel', [x, 6.6, 44], [0.18, 1.5, 0.2]);
    parts.box('steel', [x, 7.31, 44], [0.2, 0.18, 1.05]);
  }
  for (const x of [88, 106, 126, 140])
    rackFrame(parts, x, 101.5, 6.0, 5.87, true);
  // Vessel-to-vessel runs, seated directly in their end nozzles.
  routedPipe(
    parts,
    'tank',
    [
      [130.5, 17.5, 74],
      [130.5, 17.5, 79.5],
    ],
    0.27,
    1.1,
  );
  routedPipe(
    parts,
    'tank',
    [
      [130.5, 6.7, 83.5],
      [130.5, 6.7, 89],
    ],
    0.27,
    1.1,
  );
  // Condenser steam header closes at a dished end and branches into each bank.
  parts.sphere('tank', [44, 16.3, 185], 0.63, [0.32, 1, 1]);
  for (let runIndex = 0; runIndex < 5; runIndex++) {
    const x = 50.8 + runIndex * 13.6;
    routedPipe(
      parts,
      'tank',
      [
        [x, 16.3, 185],
        [x, 14.0, 185],
      ],
      0.26,
      1,
    );
    parts.cylinder('tank', [x, 14.05, 185], 0.45, 0.45, 0.24, 16);
    flange(parts, [x, 15.2, 185], [0, 1, 0], 0.26);
  }
  // A closed condensate manifold below the fin-bank eaves.
  parts.pipe('tank', [44.4, 10.75, 175], [111.3, 10.75, 175], 0.22, 12);
  parts.sphere('tank', [44.4, 10.75, 175], 0.22, [0.4, 1, 1]);
  for (let runIndex = 0; runIndex < 5; runIndex++) {
    const x = 50.8 + runIndex * 13.6;
    parts.pipe('tank', [x, 10.75, 175], [x, 11.08, 175], 0.15, 10);
  }
  // Pipe shoes / stanchions for turbine and condenser exterior lines.
  for (const z of [150, 161, 180]) {
    rackFrame(parts, 118, z, 4.2, z > 170 ? 15.54 : 12.05);
  }
  for (const z of [92, 103]) rackFrame(parts, 119, z, 3.2, 11.18);
  parts.build(root, materials, 'InsulatedPipework');
  return root;
}
