import * as THREE from 'three';
import { Parts, ringRail } from '../../utils/geometry.js';
import { addSign } from './signs.js';

export function createTower(scene, materials) {
  const root = new THREE.Group();
  root.name = 'CentralReceiverTower';
  scene.add(root);
  const parts = new Parts();
  parts.box('foundation', [0, 0.18, 0], [23, 0.36, 23]);
  parts.cylinder('foundation', [0, 0.9, 0], 8.8, 9.4, 1.35, 64);
  parts.cylinder('concrete', [0, 63.45, 0], 5.15, 7.75, 124.8, 64);
  // Slip-form lift joints and a reinforced head, rather than a monolithic pole.
  parts.cylinder('foundation', [0, 125.2, 0], 6.25, 5.35, 1.65, 64);
  parts.cylinder('darkSteel', [0, 127.1, 0], 6.55, 6.55, 2.2, 48);
  parts.cylinder('white', [0, 129.3, 0], 6.72, 6.72, 1.55, 64);
  parts.cylinder('absorber', [0, 139.3, 0], 6.38, 6.38, 18.1, 96);
  // An external cylindrical receiver, with vertical absorber tubes.
  for (let segmentIndex = 0; segmentIndex < 160; segmentIndex++) {
    const angle = (segmentIndex / 160) * Math.PI * 2;
    parts.cylinder(
      'absorber',
      [Math.sin(angle) * 6.43, 139.3, Math.cos(angle) * 6.43],
      0.091,
      0.091,
      17.95,
      7,
    );
  }
  for (let segmentIndex = 0; segmentIndex < 16; segmentIndex++) {
    const angle = (segmentIndex / 16) * Math.PI * 2;
    parts.box(
      'darkSteel',
      [Math.sin(angle) * 6.53, 139.3, Math.cos(angle) * 6.53],
      [0.075, 18.18, 0.1],
      [0, angle, 0],
    );
  }
  for (const y of [130.08, 148.52])
    parts.torus('darkSteel', [0, y, 0], 6.42, 0.23, [Math.PI / 2, 0, 0], 96);
  parts.cylinder('white', [0, 149.22, 0], 6.85, 6.85, 1.1, 64);
  parts.cylinder('roof', [0, 150.04, 0], 5.4, 8.03, 0.61, 64);
  parts.cylinder('roof', [0, 150.425, 0], 6.35, 6.35, 0.15, 64);
  parts.torus(
    'brightSteel',
    [0, 149.76, 0],
    7.85,
    0.1,
    [Math.PI / 2, 0, 0],
    80,
  );
  // Service decks remain separate from the hot receiver surface.
  parts.add(
    new THREE.RingGeometry(6.6, 8.45, 64),
    'steel',
    [0, 128.34, 0],
    [-Math.PI / 2, 0, 0],
  );
  ringRail(parts, [0, 0], 8.27, 128.36, 'steel', 48);
  ringRail(parts, [0, 0], 6.14, 150.5, 'steel', 40);
  for (let segmentIndex = 0; segmentIndex < 16; segmentIndex++) {
    const angle = (segmentIndex / 16) * Math.PI * 2,
      cosine = Math.cos(angle),
      sine = Math.sin(angle);
    parts.beam(
      'steel',
      [cosine * 5.4, 123.8, sine * 5.4],
      [cosine * 8.2, 128.25, sine * 8.2],
      0.19,
    );
  }
  // Riser/downcomer geometry is authored as complete connected routes in pipework.js.
  // Access door, electrical cabinets, utility plinths, bollards.
  parts.box('darkSteel', [0, 2.3, 7.74], [1.95, 3.5, 0.12]);
  parts.box('white', [0, 2.28, 7.83], [1.66, 3.21, 0.09]);
  parts.box('darkSteel', [0.53, 2.15, 7.91], [0.07, 0.29, 0.04]);
  parts.box('steel', [0, 4.45, 8.28], [3.55, 0.1, 1.65]);
  for (const x of [-2.4, 2.4])
    parts.cylinder('warning', [x, 0.7, 9.1], 0.11, 0.11, 1.1, 10);
  for (const x of [-5.3, -3.8])
    parts.box('white', [x, 1.35, 7.0], [1.08, 2.0, 0.7]);
  // Service elevator enclosure and occasional maintenance landings on rear.
  for (let y = 9; y < 120; y += 16) {
    const shaftRadius = 7.75 - (2.6 * y) / 126;
    parts.box('steel', [-shaftRadius - 0.35, y, 0], [0.77, 0.1, 1.75]);
    parts.pipe(
      'steel',
      [-shaftRadius - 0.78, y, -0.75],
      [-shaftRadius - 0.78, y + 1.1, -0.75],
      0.04,
      6,
    );
    parts.pipe(
      'steel',
      [-shaftRadius - 0.78, y, 0.75],
      [-shaftRadius - 0.78, y + 1.1, 0.75],
      0.04,
      6,
    );
  }
  // Roof crane, observation cameras and meteorological mast (not the receiver).
  parts.cylinder('steel', [-3.15, 152.4, 0], 0.24, 0.32, 3.8, 16);
  parts.beam('steel', [-3.15, 154.3, 0], [-9.7, 153.95, 0], 0.16);
  parts.beam('steel', [-3.15, 155.05, 0], [-9.7, 153.95, 0], 0.045);
  parts.pipe('rubber', [-9.45, 153.96, 0], [-9.45, 150.8, 0], 0.018, 6);
  parts.cylinder('steel', [1.5, 153.8, 1.4], 0.075, 0.1, 6.6, 12);
  parts.pipe('steel', [1.5, 155.1, 1.4], [3.6, 155.1, 1.4], 0.041, 8);
  parts.sphere('white', [3.6, 155.18, 1.4], 0.19, [1, 0.52, 1]);
  parts.cylinder('darkSteel', [3.6, 155.03, 1.4], 0.24, 0.24, 0.045, 16);
  parts.pipe('steel', [1.5, 157.06, 1.4], [1.5, 157.5, 1.4], 0.022, 6);
  for (let segmentIndex = 0; segmentIndex < 3; segmentIndex++) {
    const angle = (segmentIndex / 3) * Math.PI * 2;
    const x = 1.5 + Math.cos(angle) * 0.55,
      z = 1.4 + Math.sin(angle) * 0.55;
    parts.pipe('steel', [1.5, 157.35, 1.4], [x, 157.35, z], 0.018, 6);
    parts.sphere('white', [x, 157.35, z], 0.12, [1, 0.75, 1]);
  }
  for (const x of [-4.5, 4.5]) {
    parts.pipe('steel', [x, 150.6, 1], [x, 152.0, 1], 0.04, 6);
    parts.box('white', [x, 152.12, 1.12], [0.26, 0.2, 0.5]);
    parts.cylinder('glass', [x, 152.12, 1.39], 0.073, 0.073, 0.025, 12, [
      Math.PI / 2,
      0,
      0,
    ]);
    parts.sphere('redLight', [x, 151.7, -2.4], 0.16);
  }
  parts.build(root, materials, 'Tower');

  addSign(
    root,
    'RECEIVER',
    'HIGH TEMPERATURE  /  AUTHORISED ACCESS',
    [0, 5.4, 7.75],
    2.25,
    0.56,
  );
  root.userData = {
    kind: 'molten-salt external receiver tower',
    receiverCenter: [0, 139.3, 0],
    representation: 'architectural exterior',
  };
  return {
    root,
    receiver: new THREE.Vector3(0, 139.3, 0),
    mast: new THREE.Vector3(1.5, 157.4, 1.4),
  };
}
