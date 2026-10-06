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
