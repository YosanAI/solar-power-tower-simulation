import * as THREE from 'three';
import { Parts } from '../../utils/geometry.js';
import { addSign } from './signs.js';

export function createRoads(scene, materials, layout) {
  const roadParts = new Parts(),
    roadRadius = layout.outerRadius + 21;
  roadParts.add(
    new THREE.RingGeometry(roadRadius - 3.5, roadRadius + 3.5, 180),
    'road',
    [0, 0.017, 0],
    [-Math.PI / 2, 0, 0],
  );
  roadParts.add(
    new THREE.RingGeometry(42, 48, 120),
    'road',
    [0, 0.025, 0],
    [-Math.PI / 2, 0, 0],
  );
  roadParts.box('road', [0, 0.055, 0], [8, 0.06, roadRadius * 2]);
  roadParts.box('road', [0, 0.057, 0], [roadRadius * 2, 0.065, 6]);
  roadParts.box('road', [0, 0.02, roadRadius + 95], [8, 0.025, 200]);
  for (const z of [33, 217])
    roadParts.box('road', [88, 0.045, z], [176, 0.025, 6]);
  roadParts.box('road', [175, 0.045, 125], [6, 0.025, 190]);
  const root = new THREE.Group();
  root.name = 'GradedServiceRoads';
  roadParts.build(root, materials, 'Roads');
  scene.add(root);
  // Perimeter fence with a gateway on the south approach.
  const fenceParts = new Parts(),
    fenceRadius = roadRadius + 14,
    fenceSegments = 300;
  for (let segmentIndex = 0; segmentIndex < fenceSegments; segmentIndex++) {
    const startAngle = (segmentIndex / fenceSegments) * Math.PI * 2,
      endAngle = ((segmentIndex + 1) / fenceSegments) * Math.PI * 2;
    if (
      Math.abs(Math.sin(startAngle) * fenceRadius) < 7 &&
      Math.cos(startAngle) > 0
    )
      continue;
    const start = [
        Math.sin(startAngle) * fenceRadius,
        0,
        Math.cos(startAngle) * fenceRadius,
      ],
      end = [
        Math.sin(endAngle) * fenceRadius,
        0,
        Math.cos(endAngle) * fenceRadius,
      ];
    fenceParts.pipe('steel', start, [start[0], 2.45, start[2]], 0.038, 6);
    for (const railHeight of [0.12, 2.2, 2.48])
      fenceParts.pipe(
        'steel',
        [start[0], railHeight, start[2]],
        [end[0], railHeight, end[2]],
        0.014,
        5,
      );
  }
  fenceParts.build(root, materials, 'PerimeterFence');
  for (const x of [-7, 7]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 3.1, 12),
      materials.steel,
    );
    post.position.set(x, 1.55, roadRadius + 14);
    root.add(post);
  }
  addSign(
    root,
    'SERVICE ACCESS',
    'SOLAR THERMAL FIELD',
    [10, 2.25, roadRadius + 13],
    8,
    2,
  );
  return root;
}
