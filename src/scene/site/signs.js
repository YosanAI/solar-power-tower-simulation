import * as THREE from 'three';
import { signTexture } from '../../utils/geometry.js';

export function addSign(
  parent,
  text,
  subtitle,
  position,
  width,
  height,
  rotation = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({
      map: signTexture(text, subtitle),
      roughness: 0.9,
    }),
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
}
