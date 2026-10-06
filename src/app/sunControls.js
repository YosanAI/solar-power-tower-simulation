import { CONFIG } from '../scene/config.js';
import { formatSolarTime, getSolarDay, getSunPosition } from '../utils/solarTime.js';

/** The sliders change lighting only; heliostat poses remain independent. */
export function bindSunControls(onChange) {
  const timeInput = document.getElementById('sun-time');
  const timeOutput = document.getElementById('time-value');
  const dayOutput = document.getElementById('sun-daylight');
  const dayContext = document.getElementById('sun-day-context');
  const azimuthInput = document.getElementById('sun-azimuth');
  const altitudeInput = document.getElementById('sun-altitude');
  const azimuthOutput = document.getElementById('azimuth-value');
  const altitudeOutput = document.getElementById('altitude-value');
  const day = getSolarDay(CONFIG.solarDay);

  timeInput.min = day.start;
  timeInput.max = day.end;
  timeInput.value = CONFIG.sunTimeMinutes;
  dayOutput.textContent = `Sunrise ${formatSolarTime(day.sunrise)} · Sunset ${formatSolarTime(day.sunset)}`;
  dayContext.textContent = `Solar time · ${CONFIG.solarDay.date} · ±${CONFIG.solarDay.marginMinutes} min`;

  function sync(azimuth, altitude, timeMinutes) {
    if (Number.isFinite(timeMinutes)) timeInput.value = timeMinutes;
    azimuthInput.value = azimuth;
    altitudeInput.value = altitude;
    azimuthOutput.textContent = `${azimuth.toFixed(1)}°`;
    altitudeOutput.textContent = `${altitude.toFixed(1)}°`;

    // Range inputs snap fractional playback times to their one-minute step.
    // The supplied system time remains authoritative for the readout.
    const automatic = Number.isFinite(timeMinutes);
    const time = formatSolarTime(automatic ? timeMinutes : Number(timeInput.value));
    const expected = getSunPosition(Number(timeInput.value), day);
    const followsTime = automatic || (
      timeMinutes === undefined &&
      Math.abs(azimuth - expected.azimuth) < 1e-6 &&
      Math.abs(altitude - expected.altitude) < 1e-6
    );
    timeOutput.textContent = followsTime ? time : 'Manual';
    timeInput.setAttribute('aria-valuetext', followsTime
      ? `${time} solar time`
      : `${time} solar time; sun angles manually overridden`);
  }

  function handleTimeInput() {
    const { azimuth, altitude } = getSunPosition(Number(timeInput.value), day);
    sync(azimuth, altitude);
    onChange(azimuth, altitude, Number(timeInput.value));
  }

  function handleInput() {
    const azimuth = Number(azimuthInput.value);
    const altitude = Number(altitudeInput.value);
    sync(azimuth, altitude);
    onChange(azimuth, altitude);
  }

  timeInput.addEventListener('input', handleTimeInput);
  azimuthInput.addEventListener('input', handleInput);
  altitudeInput.addEventListener('input', handleInput);
  const initialSun = getSunPosition(CONFIG.sunTimeMinutes, day);
  sync(initialSun.azimuth, initialSun.altitude);

  return {
    sync,
    dispose() {
      timeInput.removeEventListener('input', handleTimeInput);
      azimuthInput.removeEventListener('input', handleInput);
      altitudeInput.removeEventListener('input', handleInput);
    },
  };
}
