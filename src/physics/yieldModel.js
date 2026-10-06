import { clamp, smoothstep } from '../utils/math.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Ineichen/Perez clear-sky DNI with pressure-corrected Kasten/Young air mass. W/m². */
export function clearSkyDni(elevation, settings, date) {
  if (!Number.isFinite(elevation)) throw new TypeError('Sun elevation must be finite.');
  if (elevation <= 0) return 0;
  const sinElevation = Math.sin(elevation);
  const degrees = elevation * 180 / Math.PI;
  const relativeAirMass = 1 / (sinElevation + 0.50572 * (degrees + 6.07995) ** -1.6364);
  const altitude = settings.siteAltitudeMetres;
  const airMass = relativeAirMass * Math.exp(-altitude / 8434.5);
  const dateMs = Date.parse(`${date}T12:00:00Z`);
  const year = new Date(dateMs).getUTCFullYear();
  const dayOfYear = Math.floor((dateMs - Date.UTC(year, 0, 1)) / 86400000) + 1;
  const extraterrestrialDni = 1361 * (1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365.25));
  const turbidity = settings.linkeTurbidity;
  const fh1 = Math.exp(-altitude / 8000);
  const fh2 = Math.exp(-altitude / 1250);
  const cg1 = 5.09e-5 * altitude + 0.868;
  const cg2 = 3.92e-5 * altitude + 0.0387;
  const ghi = cg1 * extraterrestrialDni * sinElevation * Math.exp(-cg2 * airMass * (fh1 + fh2 * (turbidity - 1)));
  const beam1 = (0.664 + 0.163 / fh1) * extraterrestrialDni * Math.exp(-0.09 * airMass * (turbidity - 1));
  const beam2 = ghi * (1 - (0.1 - 0.2 * Math.exp(-turbidity)) / (0.1 + 0.882 / fh1)) / sinElevation;
  return Math.max(0, Math.min(beam1, beam2));
}

// Abramowitz/Stegun approximation to the Gaussian CDF.
function normalCdf(value) {
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + (value < 0 ? -erf : erf));
}

/** Beam/receiver overlap: graded capture, smoothly truncated at three beam sigmas. */
export function beamCapture(offset, halfSize, sigma) {
  if (![offset, halfSize, sigma].every(Number.isFinite) || halfSize <= 0 || sigma <= 0) {
    throw new TypeError('Beam dimensions must be finite and positive.');
  }
  const distance = Math.abs(offset);
  if (distance >= halfSize + 3 * sigma) return 0;
  const overlap = normalCdf((halfSize - offset) / sigma) - normalCdf((-halfSize - offset) / sigma);
  return clamp(overlap * (1 - smoothstep(halfSize + 2 * sigma, halfSize + 3 * sigma, distance)), 0, 1);
}

export function sunUnitDirection({ azimuth, elevation }) {
  if (![azimuth, elevation].every(Number.isFinite)) throw new TypeError('Sun angles must be finite radians.');
  const horizontal = Math.cos(elevation);
  return [Math.sin(azimuth) * horizontal, Math.sin(elevation), Math.cos(azimuth) * horizontal];
}

/** Estimated optical heat absorbed by the receiver from one flat dual-pane mirror. */
export function evaluateMirrorYield(geometry, sunData, target, config, dni, sunDirection = sunUnitDirection(sunData)) {
  const { center, normal, right, up } = geometry;
  const cosine = dot(normal, sunDirection);
  // Incident propagation is -sunDirection; reflect it about the front-face normal.
  const reflected = normal.map((value, axis) => 2 * cosine * value - sunDirection[axis]);
  const toTarget = [target.x - center[0], target.y - center[1], target.z - center[2]];
  const distance = Math.hypot(...toTarget);
  const result = {
    center, normal, reflected, sunDirection, distanceMetres: distance,
    missDistanceMetres: Infinity, intercept: 0,
    incidentWatts: cosine > 0 && sunData.elevation > 0 ? Math.max(0, dni) * 2 * config.paneWidth * config.paneHeight * cosine : 0,
    absorbedWatts: 0,
  };
  if (distance <= 0) return result;
  const aim = toTarget.map(value => value / distance);
  const forward = dot(reflected, aim);
  if (forward <= 0) return result;
  // Measure the beam's miss on the receiver plane, not the infinite ray's closest point.
  const rayDistance = distance / forward;
  const miss = reflected.map((value, axis) => value * rayDistance - toTarget[axis]);
  result.missDistanceMetres = Math.hypot(...miss);
  if (cosine <= 0 || sunData.elevation <= 0 || dni <= 0) return result;

  const horizontal = Math.hypot(aim[0], aim[2]);
  const horizontalAxis = horizontal > 1e-9 ? [aim[2] / horizontal, 0, -aim[0] / horizontal] : [1, 0, 0];
  const verticalAxis = [
    aim[1] * horizontalAxis[2],
    aim[2] * horizontalAxis[0] - aim[0] * horizontalAxis[2],
    -aim[1] * horizontalAxis[0],
  ];
  const settings = config.yield;
  // Moment-matched Gaussian: finite flat-pane aperture + solar disk + optical errors.
  const angularVariance = settings.sunAngularRadiusRadians ** 2 / 4 + 4 * settings.slopeErrorRadians ** 2 + settings.trackingErrorRadians ** 2;
  const opticalVariance = rayDistance ** 2 * angularVariance;
  const varianceX = config.paneWidth ** 2 / 12 + ((config.paneWidth + config.paneGap) / 2) ** 2;
  const varianceY = config.paneHeight ** 2 / 12;
  const sigmaH = Math.sqrt(opticalVariance + varianceX * dot(right, horizontalAxis) ** 2 + varianceY * dot(up, horizontalAxis) ** 2);
  const sigmaV = Math.sqrt(opticalVariance + varianceX * dot(right, verticalAxis) ** 2 + varianceY * dot(up, verticalAxis) ** 2);
  // Rectangular approximation to the projected cylindrical receiver silhouette.
  const halfHeight = config.receiverHeight / 2 * horizontal + config.receiverRadius * Math.abs(aim[1]);
  const intercept = beamCapture(dot(miss, horizontalAxis), config.receiverRadius, sigmaH) * beamCapture(dot(miss, verticalAxis), halfHeight, sigmaV);
  const area = 2 * config.paneWidth * config.paneHeight; // The gap reflects no sunlight.
  const incidentWatts = dni * area * cosine;
  const transmission = Math.exp(-settings.atmosphericExtinctionPerMetre * rayDistance);
  const absorbedWatts = incidentWatts * settings.mirrorReflectivity * settings.cleanliness * settings.shadingBlockingEfficiency * transmission * intercept * settings.receiverAbsorptance;
  return { ...result, intercept, incidentWatts, absorbedWatts };
}
