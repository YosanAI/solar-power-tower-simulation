import * as SunCalc from 'suncalc';
import { clamp } from './math.js';

const MINUTE_MS = 60 * 1000;
const SOLAR_NOON = 12 * 60;
const MINIMUM_ALTITUDE = -10;
const MAXIMUM_ALTITUDE = 89;

function atSolarMinute(minutes, { originTime }) {
  return new Date(originTime + minutes * MINUTE_MS);
}

/** Convert SunCalc 2's north-based degrees to the scene's south-based degrees. */
export function getSunPosition(minutes, day) {
  const { azimuth, altitude } = SunCalc.getPosition(
    atSolarMinute(minutes, day),
    day.latitude,
    day.longitude,
  );
  return {
    azimuth: azimuth - 180, // +Z south; negative azimuth in the morning.
    altitude: clamp(altitude, MINIMUM_ALTITUDE, MAXIMUM_ALTITUDE),
  };
}

/** SunCalc supplies the events; noon anchors the slider's local solar clock. */
export function getSolarDay({ date, latitude, longitude, marginMinutes }) {
  // Pick an instant near local solar noon without using the browser's timezone.
  const referenceNoon = new Date(
    Date.parse(`${date}T12:00:00Z`) - longitude * 4 * MINUTE_MS,
  );
  const times = SunCalc.getTimes(referenceNoon, latitude, longitude);

  if (
    !times.sunrise || !times.sunset ||
    !Number.isFinite(times.sunrise.valueOf()) ||
    !Number.isFinite(times.sunset.valueOf())
  ) {
    throw new RangeError('The configured solar day must have sunrise and sunset.');
  }

  const originTime = times.solarNoon.valueOf() - SOLAR_NOON * MINUTE_MS;
  const day = {
    latitude,
    longitude,
    originTime,
    sunrise: (times.sunrise.valueOf() - originTime) / MINUTE_MS,
    sunset: (times.sunset.valueOf() - originTime) / MINUTE_MS,
  };
  let start = Math.ceil(Math.max(0, day.sunrise - marginMinutes));
  let end = Math.floor(Math.min(1439, day.sunset + marginMinutes));

  // Keep the requested margins within the renderer's limit using SunCalc itself.
  const altitudeAt = (minutes) => SunCalc.getPosition(
    atSolarMinute(minutes, day), latitude, longitude,
  ).altitude;
  while (start < day.sunrise && altitudeAt(start) < MINIMUM_ALTITUDE) start += 1;
  while (end > day.sunset && altitudeAt(end) < MINIMUM_ALTITUDE) end -= 1;

  return { ...day, start, end };
}

export function formatSolarTime(minutes) {
  const wholeMinutes = Math.round(minutes);
  const hours = Math.floor(wholeMinutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(wholeMinutes % 60).padStart(2, '0')}`;
}
