/** Instanced batches share resources, so dispose each resource only once. */
export function disposeSceneResources(scene, materialPalette) {
  const geometries = new Set();
  const materials = new Set(Object.values(materialPalette));
  const textures = new Set();

  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) {
      for (const material of [object.material].flat()) {
        materials.add(material);
      }
    }
  });

  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
  }

  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
}
