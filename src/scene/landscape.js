import * as THREE from 'three';
import { canvasTexture } from '../utils/geometry.js';
import { seededRandom } from '../utils/random.js';
import { smoothstep } from '../utils/math.js';

function terrainNoise(x, z) {
  return (
    Math.sin(x * 0.0018 + Math.sin(z * 0.0024)) * 0.43 +
    Math.sin(z * 0.0039 + x * 0.0011) * 0.27 +
    Math.sin(x * 0.011 - z * 0.006) * 0.16 +
    Math.sin(z * 0.019 + x * 0.021) * 0.055
  );
}

export function createLandscape(scene, materials, layout, renderer) {
  const root = new THREE.Group();
  root.name = 'ClearDesertLandscape';
  scene.add(root);

  const random = seededRandom(2381);
  const groundTexture = canvasTexture(512, 512, (context, width, height) => {
    const imageData = context.createImageData(width, height);
    for (
      let pixelOffset = 0;
      pixelOffset < imageData.data.length;
      pixelOffset += 4
    ) {
      const brightness = 222 + (random() - 0.5) * 36;
      imageData.data[pixelOffset] = brightness;
      imageData.data[pixelOffset + 1] = brightness;
      imageData.data[pixelOffset + 2] = brightness;
      imageData.data[pixelOffset + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);

    for (let grainIndex = 0; grainIndex < 2200; grainIndex++) {
      const x = random() * width;
      const y = random() * height;
      const radius = 0.25 + random() * 1.3;
      context.fillStyle = `rgba(35,35,35,${0.1 + random() * 0.12})`;
      context.beginPath();
      context.ellipse(x, y, radius, radius * 0.62, 0, 0, Math.PI * 2);
      context.fill();
    }
  });
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(1600, 1600);
  groundTexture.anisotropy = Math.min(
    8,
    renderer.capabilities.getMaxAnisotropy(),
  );

  const groundBumpTexture = groundTexture.clone();
  groundBumpTexture.colorSpace = THREE.NoColorSpace;
  groundBumpTexture.needsUpdate = true;

  const terrainGeometry = new THREE.PlaneGeometry(12000, 12000, 320, 320);
  terrainGeometry.rotateX(-Math.PI / 2);
  const vertexPositions = terrainGeometry.attributes.position;
  const vertexColors = [];
  const gravelColor = new THREE.Color('#ae966d');
  const sandColor = new THREE.Color('#bb945f');
  const ochreColor = new THREE.Color('#c9a36c');
  const stoneColor = new THREE.Color('#8d6e53');
  const distantStoneColor = new THREE.Color('#8a8179');

  for (
    let vertexIndex = 0;
    vertexIndex < vertexPositions.count;
    vertexIndex++
  ) {
    const x = vertexPositions.getX(vertexIndex);
    const z = vertexPositions.getZ(vertexIndex);
    const distanceFromTower = Math.hypot(x, z);
    const noiseValue = terrainNoise(x, z);
    const angle = Math.atan2(z, x);
    const outsideField = smoothstep(460, 1050, distanceFromTower);
    const ridge = Math.exp(
      -Math.pow(
        (distanceFromTower - 2300 - 290 * Math.sin(angle * 5)) / 600,
        2,
      ),
    );
    const height =
      outsideField *
      (12 +
        30 * (noiseValue + 0.6) +
        ridge *
          (120 + 140 * Math.max(0, terrainNoise(x * 1.7, z * 1.7) + 0.55)));
    vertexPositions.setY(vertexIndex, height - 0.035);

    const vertexColor = gravelColor
      .clone()
      .multiplyScalar(0.93 + terrainNoise(x * 4, z * 4) * 0.14);
    const fieldEdge = smoothstep(
      layout.outerRadius + 27,
      layout.outerRadius + 160,
      distanceFromTower,
    );
    const desertColor = sandColor
      .clone()
      .lerp(
        ochreColor,
        smoothstep(-0.38, 0.35, terrainNoise(x * 2.3, z * 2.3)),
      );
    desertColor.lerp(stoneColor, smoothstep(120, 265, height) * 0.7);
    desertColor.lerp(
      distantStoneColor,
      smoothstep(2000, 5800, distanceFromTower) * 0.16,
    );
    vertexColor.lerp(desertColor, fieldEdge);
    vertexColors.push(vertexColor.r, vertexColor.g, vertexColor.b);
  }

  terrainGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(vertexColors, 3),
  );
  terrainGeometry.computeVertexNormals();
  const ground = new THREE.Mesh(
    terrainGeometry,
    new THREE.MeshStandardMaterial({
      map: groundTexture,
      bumpMap: groundBumpTexture,
      bumpScale: 0.028,
      roughness: 1,
      vertexColors: true,
    }),
  );
  ground.name = 'GradedEarthAndDesertRidges';
  ground.receiveShadow = true;
  root.add(ground);

  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    materials.rock,
    1800,
  );
  const instanceTransform = new THREE.Object3D();
  for (let rockIndex = 0; rockIndex < rocks.count; rockIndex++) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * (layout.outerRadius + 65);
    const size = 0.025 + Math.pow(random(), 4) * 0.15;
    instanceTransform.position.set(
      Math.cos(angle) * radius,
      size * 0.13 - 0.025,
      Math.sin(angle) * radius,
    );
    instanceTransform.rotation.set(random(), random() * 6, random());
    instanceTransform.scale.set(size * 1.4, size * 0.6, size);
    instanceTransform.updateMatrix();
    rocks.setMatrixAt(rockIndex, instanceTransform.matrix);
  }
  rocks.name = 'GravelStones';
  rocks.receiveShadow = true;
  root.add(rocks);

  const desertScrub = materials.scrub.clone();
  desertScrub.color.set('#8a7858');
  desertScrub.name = 'DryDesertScrub';
  const bushes = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    desertScrub,
    240,
  );
  for (let bushIndex = 0; bushIndex < bushes.count; bushIndex++) {
    const angle = random() * Math.PI * 2;
    const radius = layout.outerRadius + 39 + random() * 68;
    const size = 0.1 + random() * 0.24;
    instanceTransform.position.set(
      Math.cos(angle) * radius,
      size * 0.46 - 0.025,
      Math.sin(angle) * radius,
    );
    instanceTransform.rotation.set(0, random() * 6, 0);
    instanceTransform.scale.set(size * 1.5, size, size * 1.3);
    instanceTransform.updateMatrix();
    bushes.setMatrixAt(bushIndex, instanceTransform.matrix);
    bushes.setColorAt(
      bushIndex,
      new THREE.Color().setHSL(
        0.095 + random() * 0.045,
        0.13 + random() * 0.14,
        0.55 + random() * 0.18,
      ),
    );
  }
  bushes.name = 'SparseDesertScrub';
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  root.add(bushes);

  const contactShadowTexture = canvasTexture(
    64,
    64,
    (context, width, height) => {
      const gradient = context.createRadialGradient(
        width / 2,
        height / 2,
        4,
        width / 2,
        height / 2,
        width / 2,
      );
      gradient.addColorStop(0, 'rgba(13,20,22,.8)');
      gradient.addColorStop(0.4, 'rgba(13,20,22,.4)');
      gradient.addColorStop(1, 'rgba(13,20,22,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
    },
  );
  const pierContactShadows = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    }),
    layout.positions.length,
  );
  layout.positions.forEach((position, mirrorIndex) => {
    instanceTransform.position.set(position.x, -0.014, position.z);
    instanceTransform.rotation.set(-Math.PI / 2, 0, 0);
    instanceTransform.scale.set(1, 1, 1);
    instanceTransform.updateMatrix();
    pierContactShadows.setMatrixAt(mirrorIndex, instanceTransform.matrix);
  });
  pierContactShadows.name = 'PierContactShadows';
  root.add(pierContactShadows);

  return { root, ground };
}
