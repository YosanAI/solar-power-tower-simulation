import { CONFIG } from '../scene/config.js';
import { formatSolarTime } from '../utils/solarTime.js';

/** GUI data derived from the authoritative sun state, not a rounded slider. */
export function getSunControlState(sunData, previousTimeMinutes = CONFIG.sunTimeMinutes) {
  if (!Number.isFinite(sunData.azimuth) || !Number.isFinite(sunData.elevation)) {
    throw new TypeError('Sun angles must be finite radians.');
  }
  const automatic = Number.isFinite(sunData.timeMinutes);
  return {
    timeMinutes: automatic ? sunData.timeMinutes : previousTimeMinutes,
    timeLabel: automatic ? formatSolarTime(sunData.timeMinutes) : 'Manual',
    azimuth: sunData.azimuth,
    elevation: sunData.elevation,
  };
}
