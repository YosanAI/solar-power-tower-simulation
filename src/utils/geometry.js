import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const vectorFromArray = (coordinates) => new THREE.Vector3(...coordinates);

/** Batch physical parts into one mesh per material. */
export class Parts {
  constructor() {
    this.groups = new Map();
  }

  add(
    geometry,
    material,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
  ) {
    const orientation = rotation.isQuaternion
      ? rotation
      : new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation));
    const transform = new THREE.Matrix4().compose(
      vectorFromArray(position),
      orientation,
      vectorFromArray(scale),
    );
    geometry.applyMatrix4(transform);

    if (!geometry.attributes.uv) {
      geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(
          new Float32Array(geometry.attributes.position.count * 2),
          2,
        ),
      );
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();

    const nonIndexedGeometry = geometry.index
      ? geometry.toNonIndexed()
      : geometry;
    if (nonIndexedGeometry !== geometry) geometry.dispose();
    if (!this.groups.has(material)) this.groups.set(material, []);
    this.groups.get(material).push(nonIndexedGeometry);
    return this;
  }

  box(material, position, size, rotation = [0, 0, 0]) {
    return this.add(
      new THREE.BoxGeometry(...size),
      material,
      position,
      rotation,
    );
  }

  cylinder(
    material,
    position,
    top,
    bottom,
    height,
    segments = 16,
    rotation = [0, 0, 0],
    open = false,
  ) {
    return this.add(
      new THREE.CylinderGeometry(top, bottom, height, segments, 1, open),
      material,
      position,
      rotation,
    );
  }

  sphere(material, position, radius = 1, scale = [1, 1, 1], detail = 10) {
    return this.add(
      new THREE.SphereGeometry(
        radius,
        detail,
        Math.max(5, Math.round(detail * 0.6)),
      ),
      material,
      position,
      [0, 0, 0],
      scale,
    );
  }

  beam(material, start, end, width = 0.08, depth = width) {
    const startPoint = vectorFromArray(start);
    const endPoint = vectorFromArray(end);
    const direction = endPoint.clone().sub(startPoint);
    const length = direction.length();
    if (length < 1e-7) return this;

    const orientation = new THREE.Quaternion().setFromUnitVectors(
      UP_AXIS,
      direction.divideScalar(length),
    );
    return this.add(
      new THREE.BoxGeometry(width, length, depth),
      material,
      startPoint.add(endPoint).multiplyScalar(0.5).toArray(),
      orientation,
    );
  }

  pipe(material, start, end, radius = 0.08, segments = 10) {
    const startPoint = vectorFromArray(start);
    const endPoint = vectorFromArray(end);
    const direction = endPoint.clone().sub(startPoint);
    const length = direction.length();
    if (length < 1e-7) return this;

    const orientation = new THREE.Quaternion().setFromUnitVectors(
      UP_AXIS,
      direction.divideScalar(length),
    );
    return this.add(
      new THREE.CylinderGeometry(radius, radius, length, segments),
      material,
      startPoint.add(endPoint).multiplyScalar(0.5).toArray(),
      orientation,
    );
  }

  curve(material, points, radius = 0.035, segments = 24) {
    return this.add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map(vectorFromArray)),
        segments,
        radius,
        6,
        false,
      ),
      material,
    );
  }

  torus(
    material,
    position,
    radius,
    tube = 0.04,
    rotation = [Math.PI / 2, 0, 0],
    segments = 64,
  ) {
    return this.add(
      new THREE.TorusGeometry(radius, tube, 6, segments),
      material,
      position,
      rotation,
    );
  }

  geometry() {
    const result = [];
    for (const [key, geometries] of this.groups) {
      const mergedGeometry = mergeGeometries(geometries, false);
      if (!mergedGeometry) throw new Error(`Could not merge material: ${key}`);
      result.push({ key, geometry: mergedGeometry });
      geometries.forEach((geometry) => geometry.dispose());
    }
    this.groups.clear();
    return result;
  }

  build(parent, materials, prefix = 'Structure') {
    const meshes = [];
    for (const { key, geometry } of this.geometry()) {
      const mesh = new THREE.Mesh(geometry, materials[key]);
      mesh.name = `${prefix}/${key}`;
      mesh.castShadow = !['glass', 'light', 'label', 'ground'].includes(key);
      mesh.receiveShadow = true;
      parent.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
}

export function ringRail(
  parts,
  center,
  radius,
  y,
  material = 'steel',
  segments = 48,
  height = 1.1,
) {
  const [centerX, centerZ] = center;
  for (let segmentIndex = 0; segmentIndex < segments; segmentIndex++) {
    const startAngle = (segmentIndex / segments) * Math.PI * 2;
    const endAngle = ((segmentIndex + 1) / segments) * Math.PI * 2;
    const start = [
      centerX + Math.cos(startAngle) * radius,
      y,
      centerZ + Math.sin(startAngle) * radius,
    ];
    const end = [
      centerX + Math.cos(endAngle) * radius,
      y,
      centerZ + Math.sin(endAngle) * radius,
    ];
    parts.pipe(material, start, [start[0], y + height, start[2]], 0.033, 6);
    for (const railHeight of [0.52, height]) {
      parts.pipe(
        material,
        [start[0], y + railHeight, start[2]],
        [end[0], y + railHeight, end[2]],
        0.029,
        6,
      );
    }
  }
}

export function boxRail(
  parts,
  x,
  z,
  width,
  depth,
  y,
  material = 'steel',
  height = 1.1,
) {
  const corners = [
    [x - width / 2, z - depth / 2],
    [x + width / 2, z - depth / 2],
    [x + width / 2, z + depth / 2],
    [x - width / 2, z + depth / 2],
  ];

  for (let edgeIndex = 0; edgeIndex < 4; edgeIndex++) {
    const start = corners[edgeIndex];
    const end = corners[(edgeIndex + 1) % 4];
    const postIntervals = Math.ceil(
      Math.hypot(end[0] - start[0], end[1] - start[1]) / 2.8,
    );
    for (let postIndex = 0; postIndex <= postIntervals; postIndex++) {
      const postX =
        start[0] + ((end[0] - start[0]) * postIndex) / postIntervals;
      const postZ =
        start[1] + ((end[1] - start[1]) * postIndex) / postIntervals;
      parts.pipe(
        material,
        [postX, y, postZ],
        [postX, y + height, postZ],
        0.045,
        6,
      );
    }
    for (const railHeight of [0.53, height]) {
      parts.pipe(
        material,
        [start[0], y + railHeight, start[1]],
        [end[0], y + railHeight, end[1]],
        0.037,
        6,
      );
    }
  }
}

export function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function signTexture(
  text,
  small = '',
  background = '#e9e5d9',
  foreground = '#29322e',
) {
  return canvasTexture(1024, 256, (context, width, height) => {
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.fillStyle = foreground;
    context.font = '600 90px Arial';
    context.fillText(text, 48, 119);
    context.font = '500 35px Arial';
    context.fillText(small, 50, 199);
  });
}

/** Circular elbow tangent to the adjacent straight pipe runs. */
class PipeArc extends THREE.Curve {
  constructor(center, start, axis, angle) {
    super();
    this.center = center;
    this.radial = start.clone().sub(center);
    this.axis = axis;
    this.angle = angle;
  }

  getPoint(progress, target = new THREE.Vector3()) {
    return target
      .copy(this.radial)
      .applyAxisAngle(this.axis, this.angle * progress)
      .add(this.center);
  }
}

export function roundedPipePath(points, bendRadius = 1.4) {
  if (points.length < 2)
    throw new Error('A pipe needs at least two endpoints.');
  const routePoints = points.map((point) => new THREE.Vector3(...point));
  const path = new THREE.CurvePath();
  let cursor = routePoints[0];

  for (let pointIndex = 1; pointIndex < routePoints.length - 1; pointIndex++) {
    const corner = routePoints[pointIndex];
    const incoming = corner.clone().sub(routePoints[pointIndex - 1]);
    const outgoing = routePoints[pointIndex + 1].clone().sub(corner);
    const incomingLength = incoming.length();
    const outgoingLength = outgoing.length();
    incoming.normalize();
    outgoing.normalize();

    const angle = Math.acos(
      THREE.MathUtils.clamp(incoming.dot(outgoing), -1, 1),
    );
    if (angle < 1e-5) continue;
    if (angle > Math.PI - 1e-4)
      throw new Error('A pipe route cannot reverse direction at one vertex.');

    const trim = Math.min(
      bendRadius * Math.tan(angle / 2),
      incomingLength * 0.4,
      outgoingLength * 0.4,
    );
    const radius = trim / Math.tan(angle / 2);
    const start = corner.clone().addScaledVector(incoming, -trim);
    const end = corner.clone().addScaledVector(outgoing, trim);
    const axis = new THREE.Vector3()
      .crossVectors(incoming, outgoing)
      .normalize();
    const center = start
      .clone()
      .addScaledVector(
        new THREE.Vector3().crossVectors(axis, incoming),
        radius,
      );
    if (cursor.distanceTo(start) > 1e-6)
      path.add(new THREE.LineCurve3(cursor, start));
    path.add(new PipeArc(center, start, axis, angle));
    cursor = end;
  }

  if (cursor.distanceTo(routePoints.at(-1)) > 1e-6) {
    path.add(new THREE.LineCurve3(cursor, routePoints.at(-1)));
  }
  return path;
}

export function routedPipe(
  parts,
  material,
  points,
  radius = 0.35,
  bendRadius = 1.4,
) {
  const path = roundedPipePath(points, bendRadius);
  const segments = Math.min(
    2400,
    Math.max(48, Math.ceil(path.getLength() / 0.16)),
  );
  parts.add(
    new THREE.TubeGeometry(path, segments, radius, 12, false),
    material,
  );
  return path;
}
