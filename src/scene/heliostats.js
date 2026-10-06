import * as THREE from 'three';
import { Parts } from '../utils/geometry.js';
import { clamp } from '../utils/math.js';
import { CONFIG } from './config.js';
import { initialMirrorPose } from './layout.js';

const RIG_STAGES = ['fixed', 'yaw', 'pitch'];
const HIDDEN_INSTANCE_MATRIX = new THREE.Matrix4().makeScale(0, 0, 0);

/** Six support arms tie two glass panes to a horizontal torque tube. */
function createFrameTemplate(detailed = false) {
  const fixed = new Parts();
  const yaw = new Parts();
  const pitch = new Parts();
  const cylinderSegments = detailed ? 20 : 8;

  fixed.cylinder(
    'foundation',
    [0, 0.07, 0],
    0.44,
    0.48,
    0.14,
    cylinderSegments,
  );
  fixed.cylinder('steel', [0, 0.19, 0], 0.27, 0.27, 0.075, cylinderSegments);
  fixed.cylinder('steel', [0, 1.245, 0], 0.12, 0.145, 2.08, cylinderSegments);
  fixed.cylinder(
    'darkSteel',
    [0, 2.3, 0],
    0.215,
    0.215,
    0.08,
    cylinderSegments,
  );
  fixed.box('white', [0.18, 1.58, -0.03], [0.16, 0.32, 0.24]);

  // Stationary motor and azimuth gearbox.
  fixed.box('steel', [0.24, 2.22, 0], [0.23, 0.22, 0.28]);
  fixed.cylinder(
    'darkSteel',
    [0.24, 2.22, -0.23],
    0.095,
    0.095,
    0.24,
    cylinderSegments,
    [Math.PI / 2, 0, 0],
  );
  yaw.cylinder('steel', [0, 0.045, 0], 0.225, 0.225, 0.09, cylinderSegments);
  yaw.box('steel', [0, 0.14, 0], [0.64, 0.14, 0.35]);

  for (const supportX of [-0.25, 0.25]) {
    yaw.box('steel', [supportX, 0.24, 0], [0.1, 0.25, 0.27]);
    yaw.cylinder(
      'darkSteel',
      [supportX, 0.32, 0],
      0.17,
      0.17,
      0.1,
      cylinderSegments,
      [0, 0, Math.PI / 2],
    );
    yaw.cylinder(
      'brightSteel',
      [supportX + Math.sign(supportX) * 0.063, 0.32, 0],
      0.132,
      0.132,
      0.027,
      cylinderSegments,
      [0, 0, Math.PI / 2],
    );
  }
  yaw.cylinder('steel', [0.43, 0.32, 0], 0.22, 0.22, 0.26, cylinderSegments, [
    0,
    0,
    Math.PI / 2,
  ]);
  yaw.cylinder(
    'darkSteel',
    [0.43, 0.17, -0.21],
    0.09,
    0.09,
    0.25,
    cylinderSegments,
    [Math.PI / 2, 0, 0],
  );
  pitch.cylinder('steel', [0, 0, 0], 0.1, 0.1, 4.6, cylinderSegments, [
    0,
    0,
    Math.PI / 2,
  ]);

  for (const collarX of [-2.3, 2.3, -0.34, 0.34]) {
    pitch.cylinder(
      'brightSteel',
      [collarX, 0, 0],
      0.115,
      0.115,
      0.028,
      cylinderSegments,
      [0, 0, Math.PI / 2],
    );
  }

  for (const paneCenterX of [-1.3, 1.3]) {
    for (const supportOffsetX of [-0.89, 0, 0.89]) {
      const supportX = paneCenterX + supportOffsetX;
      pitch.box('steel', [supportX, 0, 0.235], [0.048, 3.12, 0.07]);
      pitch.beam(
        'steel',
        [supportX, -1.48, 0.228],
        [supportX, 0, -0.115],
        0.031,
        0.041,
      );
      pitch.beam(
        'steel',
        [supportX, 0, -0.115],
        [supportX, 1.48, 0.228],
        0.031,
        0.041,
      );

      if (detailed) {
        pitch.box('steel', [supportX, 0, 0.075], [0.14, 0.19, 0.028]);
        for (const padY of [-1.44, -0.72, 0, 0.72, 1.44]) {
          // Bonded pads sit behind the glass backing.
          pitch.box(
            'back',
            [supportX + 0.054, padY, 0.281],
            [0.13, 0.075, 0.022],
          );
          pitch.box(
            'steel',
            [supportX + 0.036, padY, 0.252],
            [0.11, 0.04, 0.035],
          );
          pitch.cylinder(
            'brightSteel',
            [supportX, padY, 0.21],
            0.014,
            0.014,
            0.025,
            6,
            [Math.PI / 2, 0, 0],
          );
        }
      }
    }
  }

  if (detailed) {
    for (let boltIndex = 0; boltIndex < 6; boltIndex++) {
      const boltAngle = (boltIndex / 6) * Math.PI * 2;
      const boltX = Math.sin(boltAngle) * 0.219;
      const boltZ = Math.cos(boltAngle) * 0.219;
      fixed.cylinder(
        'brightSteel',
        [boltX, 0.248, boltZ],
        0.019,
        0.019,
        0.038,
        6,
      );
      fixed.cylinder(
        'darkSteel',
        [boltX, 0.224, boltZ],
        0.025,
        0.025,
        0.008,
        8,
      );
    }

    for (const flangeX of [-0.32, 0.32, 0.577]) {
      for (let boltIndex = 0; boltIndex < 6; boltIndex++) {
        const boltAngle = (boltIndex / 6) * Math.PI * 2;
        const boltRadius = flangeX > 0.5 ? 0.171 : 0.115;
        yaw.cylinder(
          'brightSteel',
          [
            flangeX,
            0.32 + Math.cos(boltAngle) * boltRadius,
            Math.sin(boltAngle) * boltRadius,
          ],
          0.014,
          0.014,
          0.02,
          6,
          [0, 0, Math.PI / 2],
        );
      }
    }

    for (let finIndex = 0; finIndex < 5; finIndex++) {
      fixed.cylinder(
        'steel',
        [0.24, 2.22, -0.32 + finIndex * 0.038],
        0.108,
        0.108,
        0.008,
        10,
        [Math.PI / 2, 0, 0],
      );
      yaw.cylinder(
        'steel',
        [0.43, 0.17, -0.3 + finIndex * 0.038],
        0.102,
        0.102,
        0.008,
        10,
        [Math.PI / 2, 0, 0],
      );
    }

    fixed.curve(
      'rubber',
      [
        [0.12, 1.45, -0.12],
        [0.17, 1.8, -0.16],
        [0.13, 2.07, -0.16],
        [0, 2.34, 0],
      ],
      0.012,
      14,
    );
    yaw.curve(
      'rubber',
      [
        [0, 0, 0],
        [-0.15, 0.12, -0.22],
        [-0.11, 0.31, -0.3],
        [0.43, 0.15, -0.28],
      ],
      0.012,
      14,
    );
    fixed.box('warning', [0.267, 1.65, -0.03], [0.006, 0.07, 0.07]);
  }

  return {
    fixed: fixed.geometry(),
    yaw: yaw.geometry(),
    pitch: pitch.geometry(),
  };
}

/** Glass stays at full detail; its back face cannot obscure the reflective face. */
function createGlazingTemplate() {
  const panes = new Parts();
  const paneWidth = CONFIG.paneWidth;
  const paneHeight = CONFIG.paneHeight;
  const frontOffset = CONFIG.mirrorFront;
  const paneThickness = CONFIG.paneThickness;

  for (const paneCenterX of [-1.3, 1.3]) {
    panes.add(new THREE.PlaneGeometry(paneWidth, paneHeight), 'mirror', [
      paneCenterX,
      0,
      frontOffset,
    ]);
    panes.add(
      new THREE.PlaneGeometry(paneWidth, paneHeight),
      'back',
      [paneCenterX, 0, frontOffset - paneThickness],
      [0, Math.PI, 0],
    );
    for (const side of [-1, 1]) {
      panes.add(
        new THREE.PlaneGeometry(paneThickness, paneHeight),
        'edge',
        [
          paneCenterX + (side * paneWidth) / 2,
          0,
          frontOffset - paneThickness / 2,
        ],
        [0, (side * Math.PI) / 2, 0],
      );
      panes.add(
        new THREE.PlaneGeometry(paneWidth, paneThickness),
        'edge',
        [paneCenterX, (side * paneHeight) / 2, frontOffset - paneThickness / 2],
        [(-side * Math.PI) / 2, 0, 0],
      );
    }
  }
  return panes.geometry();
}

function createBatches(template, count, materials, parent, label) {
  const batches = {};
  for (const stage of RIG_STAGES) {
    batches[stage] = template[stage].map(({ geometry, key }) => {
      const mesh = new THREE.InstancedMesh(geometry, materials[key], count);
      mesh.name = `${label}/${stage}/${key}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      parent.add(mesh);
      return mesh;
    });
  }
  return batches;
}

export class HeliostatRig {
  constructor(data, onChange) {
    this.id = data.id;
    this.index = data.index;
    this.sector = data.sector;
    this.root = new THREE.Group();
    this.root.name = `Heliostat/${this.id}`;
    this.root.position.set(data.x, 0, data.z);

    this.azimuthPivot = new THREE.Group();
    this.azimuthPivot.name = 'AzimuthPivot';
    this.azimuthPivot.position.y = CONFIG.azimuthAxisHeight;
    this.altitudePivot = new THREE.Group();
    this.altitudePivot.name = 'AltitudePivot';
    this.altitudePivot.position.y = CONFIG.elevationAxisOffset;
    this.root.add(this.azimuthPivot);
    this.azimuthPivot.add(this.altitudePivot);

    this.onChange = onChange;
    this.initialPose = initialMirrorPose();
    this.azimuth = this.initialPose.azimuth;
    this.altitude = this.initialPose.altitude;
    this.root.userData = {
      id: this.id,
      kind: 'dual-pane-heliostat',
      panes: 2,
      paneSize: [2.3, 3.3],
      gap: 0.3,
    };
    this.commit(false);
  }

  /** Rig angles use radians. */
  setAzimuth(radians) {
    return this.setPose({ azimuth: radians });
  }

  setAltitude(radians) {
    return this.setPose({ altitude: radians });
  }

  setElevation(radians) {
    return this.setAltitude(radians);
  }

  setPose({ azimuth = this.azimuth, altitude = this.altitude } = {}) {
    if (!Number.isFinite(azimuth) || !Number.isFinite(altitude)) {
      throw new TypeError('Rig angles must be finite radians.');
    }
    this.azimuth = azimuth;
    this.altitude = clamp(altitude, 0, Math.PI / 2);
    return this.commit();
  }

  reset() {
    return this.setPose(this.initialPose);
  }

  commit(notify = true) {
    this.azimuthPivot.rotation.y = this.azimuth;
    this.altitudePivot.rotation.x = -this.altitude;
    this.root.updateMatrixWorld(true);
    if (notify) this.onChange?.(this);
    return this;
  }

  getNormal(target = new THREE.Vector3()) {
    return target
      .set(0, 0, 1)
      .transformDirection(this.altitudePivot.matrixWorld);
  }

  getMirrorCenter(target = new THREE.Vector3()) {
    return target
      .set(0, 0, CONFIG.mirrorFront)
      .applyMatrix4(this.altitudePivot.matrixWorld);
  }
}

export class HeliostatField {
  constructor(scene, layout, materials, onChange) {
    this.group = new THREE.Group();
    this.group.name = 'RiggedHeliostatField';
    scene.add(this.group);
    this.onChange = onChange;

    this.standardFrameTemplate = createFrameTemplate(false);
    this.detailedFrameTemplate = createFrameTemplate(true);
    this.glazingTemplate = createGlazingTemplate();
    this.standardFrameBatches = createBatches(
      this.standardFrameTemplate,
      layout.positions.length,
      materials,
      this.group,
      'FieldFrame',
    );
    this.detailedFrameBatches = createBatches(
      this.detailedFrameTemplate,
      CONFIG.detailedMirrors,
      materials,
      this.group,
      'NearbyFrame',
    );
    for (const stageBatches of Object.values(this.detailedFrameBatches)) {
      for (const mesh of stageBatches) mesh.count = 0;
    }

    this.detailedInstanceIndices = new Map();
    this.sectors = [];
    for (
      let sectorIndex = 0;
      sectorIndex < CONFIG.reflectionSectors;
      sectorIndex++
    ) {
      const members = layout.positions
        .map((position, index) => ({ position, index }))
        .filter((member) => member.position.sector === sectorIndex);
      const material = materials.mirror.clone();
      material.name = `MirrorReflection/Sector${sectorIndex}`;
      const slot = new Map(
        members.map((member, index) => [member.index, index]),
      );
      const meshes = this.glazingTemplate.map(({ geometry, key }) => {
        const mesh = new THREE.InstancedMesh(
          geometry,
          key === 'mirror' ? material : materials[key],
          members.length,
        );
        mesh.name = `PermanentGlazing/${sectorIndex}/${key}`;
        mesh.castShadow = key === 'mirror';
        // Avoid self-shadow acne from the 4 mm pane.
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(mesh);
        return mesh;
      });
      this.sectors.push({ material, slot, meshes });
    }

    this.rigs = layout.positions.map(
      (position, index) =>
        new HeliostatRig({ ...position, index }, (rig) => this.updateRig(rig)),
    );
    this.byId = new Map(this.rigs.map((rig) => [rig.id, rig]));
    for (const rig of this.rigs) this.group.add(rig.root);
    for (const rig of this.rigs) this.updateRig(rig, false);
    this.flagBuffers();
  }

  matrices(rig) {
    return {
      fixed: rig.root.matrixWorld,
      yaw: rig.azimuthPivot.matrixWorld,
      pitch: rig.altitudePivot.matrixWorld,
    };
  }

  write(batches, index, matrices, hide = false) {
    for (const stage of RIG_STAGES) {
      for (const mesh of batches[stage]) {
        mesh.setMatrixAt(
          index,
          hide ? HIDDEN_INSTANCE_MATRIX : matrices[stage],
        );
      }
    }
  }

  flagBuffers() {
    for (const batches of [
      this.standardFrameBatches,
      this.detailedFrameBatches,
    ]) {
      for (const stageBatches of Object.values(batches)) {
        for (const mesh of stageBatches) mesh.instanceMatrix.needsUpdate = true;
      }
    }
    for (const sector of this.sectors) {
      for (const mesh of sector.meshes) mesh.instanceMatrix.needsUpdate = true;
    }
  }

  updateRig(rig, notify = true) {
    const matrices = this.matrices(rig);
    this.write(
      this.standardFrameBatches,
      rig.index,
      matrices,
      this.detailedInstanceIndices.has(rig.index),
    );
    if (this.detailedInstanceIndices.has(rig.index)) {
      this.write(
        this.detailedFrameBatches,
        this.detailedInstanceIndices.get(rig.index),
        matrices,
      );
    }

    const sector = this.sectors[rig.sector];
    const instanceIndex = sector.slot.get(rig.index);
    for (const mesh of sector.meshes)
      mesh.setMatrixAt(instanceIndex, matrices.pitch);
    if (notify) {
      this.flagBuffers();
      this.onChange?.();
    }
  }

  updateDetail(cameraPosition) {
    const nearestRigs = this.rigs
      .map((rig) => ({
        index: rig.index,
        distanceSquared: rig.root.position.distanceToSquared(cameraPosition),
      }))
      .filter((rig) => rig.distanceSquared < 42 * 42)
      .sort((first, second) => first.distanceSquared - second.distanceSquared)
      .slice(0, CONFIG.detailedMirrors);

    const detailKey = nearestRigs.map((rig) => rig.index).join(',');
    if (detailKey === this.detailKey) return false;
    this.detailKey = detailKey;

    const previousDetailedIndices = [...this.detailedInstanceIndices.keys()];
    this.detailedInstanceIndices.clear();
    nearestRigs.forEach((rig, instanceIndex) =>
      this.detailedInstanceIndices.set(rig.index, instanceIndex),
    );
    for (const stageBatches of Object.values(this.detailedFrameBatches)) {
      for (const mesh of stageBatches) mesh.count = nearestRigs.length;
    }

    const changedRigIndices = new Set([
      ...previousDetailedIndices,
      ...nearestRigs.map((rig) => rig.index),
    ]);
    for (const rigIndex of changedRigIndices)
      this.updateRig(this.rigs[rigIndex], false);
    this.flagBuffers();
    return true;
  }

  get(id) {
    return typeof id === 'number' ? this.rigs[id] : this.byId.get(id);
  }

  dispose() {
    for (const template of [
      this.standardFrameTemplate,
      this.detailedFrameTemplate,
    ]) {
      for (const stageParts of Object.values(template)) {
        for (const part of stageParts) part.geometry.dispose();
      }
    }
    for (const pane of this.glazingTemplate) pane.geometry.dispose();
    for (const sector of this.sectors) sector.material.dispose();
    this.group.removeFromParent();
  }
}
