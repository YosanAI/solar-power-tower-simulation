export const radians = (value) => (value * Math.PI) / 180;
export const degrees = (value) => (value * 180) / Math.PI;

export const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

export function smoothstep(minimum, maximum, value) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function sunDirection(azimuth, altitude) {
  const azimuthRadians = radians(azimuth);
  const altitudeRadians = radians(altitude);
  const horizontalProjection = Math.cos(altitudeRadians);

  return [
    Math.sin(azimuthRadians) * horizontalProjection,
    Math.sin(altitudeRadians),
    Math.cos(azimuthRadians) * horizontalProjection,
  ];
}
