// Scene dimensions are in metres; sun angles are in degrees.
export const CONFIG = Object.freeze({
  paneWidth: 2.3,
  paneHeight: 3.3,
  paneThickness: 0.004,
  paneGap: 0.3,
  mirrorWidth: 4.9,
  mirrorHeight: 3.3,
  mirrorFront: 0.3,
  azimuthAxisHeight: 2.34,
  elevationAxisOffset: 0.32,
  receiverCenter: [0, 139.3, 0],
  receiverRadius: 6.38,
  receiverHeight: 18.1,
  yield: Object.freeze({
    mirrorReflectivity: 0.923, // Solar-weighted reflectance of 4 mm mirror glass.
    cleanliness: 0.97,
    shadingBlockingEfficiency: 0.93, // Field-average approximation, not ray-traced occlusion.
    receiverAbsorptance: 0.94,
    atmosphericExtinctionPerMetre: 0.00012,
    slopeErrorRadians: 0.0015, // Reflected angular error is twice the surface slope error.
    trackingErrorRadians: 0.001,
    sunAngularRadiusRadians: 0.00465,
    linkeTurbidity: 3, // Clear-sky reference atmosphere.
    siteAltitudeMetres: 0,
    integrationStepMinutes: 1,
    normalDebugLengthMetres: 12,
  }),
  fieldInnerRadius: 56,
  fieldOuterRadius: 337,
  sunTimeMinutes: 10 * 60,
  solarDay: Object.freeze({
    date: '2026-03-20', // Fixed reference day for the desert scene.
    latitude: 35,
    longitude: 0,
    marginMinutes: 30,
  }),
  detailedMirrors: 16,
  reflectionSectors: 4,
});
