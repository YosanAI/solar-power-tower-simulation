import * as THREE from 'three';
import { canvasTexture } from '../utils/geometry.js';
import { seededRandom } from '../utils/random.js';

export function createMaterials(renderer) {
  const random = seededRandom(72);
  const concreteTexture = canvasTexture(512, 1024, (context, width, height) => {
    context.fillStyle = '#d3d5d2';
    context.fillRect(0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    for (
      let pixelOffset = 0;
      pixelOffset < imageData.data.length;
      pixelOffset += 4
    ) {
      const brightnessVariation = (random() - 0.5) * 12;
      for (let colorChannel = 0; colorChannel < 3; colorChannel++) {
        imageData.data[pixelOffset + colorChannel] += brightnessVariation;
      }
    }
    context.putImageData(imageData, 0, 0);

    for (let y = 0; y < height; y += 23) {
      context.fillStyle = 'rgba(35,42,46,.13)';
      context.fillRect(0, y, width, 1);
    }

    for (let streakIndex = 0; streakIndex < 320; streakIndex++) {
      context.fillStyle = `rgba(53,62,66,${random() * 0.06})`;
      context.fillRect(
        random() * width,
        random() * height,
        1 + random() * 2,
        5 + random() * 35,
      );
    }
  });
  concreteTexture.wrapS = concreteTexture.wrapT = THREE.RepeatWrapping;
  concreteTexture.anisotropy = Math.min(
    8,
    renderer.capabilities.getMaxAnisotropy(),
  );

  const galvanisedTexture = canvasTexture(
    256,
    256,
    (context, width, height) => {
      context.fillStyle = '#e4e6e5';
      context.fillRect(0, 0, width, height);

      for (let flakeIndex = 0; flakeIndex < 1100; flakeIndex++) {
        const x = random() * width;
        const y = random() * height;
        const radius = 1 + random() * 7;
        context.fillStyle = `rgba(70,84,89,${random() * 0.13})`;
        context.beginPath();

        for (let vertexIndex = 0; vertexIndex < 5; vertexIndex++) {
          context.lineTo(
            x + Math.cos(vertexIndex * 1.2566) * radius,
            y + Math.sin(vertexIndex * 1.2566) * radius,
          );
        }

        context.closePath();
        context.fill();
      }
    },
  );
  galvanisedTexture.wrapS = galvanisedTexture.wrapT = THREE.RepeatWrapping;

  const standardMaterial = (color, roughness = 0.7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  return {
    concrete: new THREE.MeshStandardMaterial({
      map: concreteTexture,
      roughness: 0.9,
    }),
    foundation: standardMaterial('#aeb0aa', 0.93),
    steel: new THREE.MeshStandardMaterial({
      color: '#d3dbe0',
      map: galvanisedTexture,
      roughness: 0.31,
      metalness: 0.88,
    }),
    brightSteel: standardMaterial('#e6eaed', 0.22, 1),
    darkSteel: standardMaterial('#303c43', 0.43, 0.7),
    back: standardMaterial('#839396', 0.72, 0.12),
    mirror: new THREE.MeshStandardMaterial({
      color: '#fafcfb',
      metalness: 1,
      roughness: 0.035,
      envMapIntensity: 1.05,
      side: THREE.FrontSide,
    }),
    edge: standardMaterial('#4f847d', 0.24, 0.25),
    rubber: standardMaterial('#121a21', 0.94),
    white: standardMaterial('#e4e8e9', 0.55, 0.12),
    tank: standardMaterial('#bcc6ca', 0.33, 0.82),
    roof: standardMaterial('#264954', 0.51, 0.55),
    wall: standardMaterial('#b7c7cc', 0.8),
    blue: standardMaterial('#145c90', 0.42, 0.35),
    warning: standardMaterial('#f1b321', 0.47, 0.15),
    hotBand: standardMaterial('#b83722', 0.5, 0.1),
    coldBand: standardMaterial('#136ca5', 0.5, 0.1),
    absorber: standardMaterial('#101820', 0.81, 0.2),
    glass: standardMaterial('#143f55', 0.1, 0.9),
    road: standardMaterial('#a29271', 0.97),
    asphalt: standardMaterial('#343d42', 0.97),
    rock: standardMaterial('#6d6558', 1),
    scrub: standardMaterial('#536633', 1),
    light: new THREE.MeshBasicMaterial({ color: '#ffeac7', toneMapped: false }),
    redLight: new THREE.MeshBasicMaterial({
      color: '#d82b12',
      toneMapped: false,
    }),
  };
}
