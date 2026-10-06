import assert from 'node:assert/strict';
import test from 'node:test';
import * as SunCalc from 'suncalc';
import { CONFIG } from '../src/scene/config.js';
import { sunDirection } from '../src/utils/math.js';
import { formatSolarTime, getSolarDay, getSunPosition } from '../src/utils/solarTime.js';

const settings = CONFIG.solarDay;
const solarDay = getSolarDay(settings);
const closeTo = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);

test('equinox sun rises in the east, culminates south and sets west', () => {
  const sunrise = getSunPosition(6 * 60, solarDay);
  const noon = getSunPosition(12 * 60, solarDay);
  const sunset = getSunPosition(18 * 60, solarDay);
  closeTo(sunrise.azimuth, -90, 1);
  closeTo(sunrise.elevation, 0, 1);
  closeTo(noon.azimuth, 0, 0.001);
  closeTo(noon.elevation, 55, 0.1);
  closeTo(sunset.azimuth, 90, 1);
  closeTo(sunset.elevation, 0, 1);
  closeTo(sunDirection(sunrise.azimuth, sunrise.elevation)[0], -1, 0.001);
  closeTo(sunDirection(sunset.azimuth, sunset.elevation)[0], 1, 0.001);
});

test('solar-clock conversion agrees with SunCalc at known UTC instants', () => {
  for (const hour of ['06', '10', '12', '16', '18']) {
    const instant = new Date(`2026-03-20T${hour}:00:00Z`);
    const minutes = (instant.valueOf() - solarDay.originTime) / 60000;
    const actual = getSunPosition(minutes, solarDay);
    const expected = SunCalc.getPosition(instant, settings.latitude, settings.longitude);
    closeTo(actual.azimuth, expected.azimuth - 180);
    closeTo(actual.elevation, expected.altitude);
  }
});

test('sunrise and sunset come from SunCalc and include twilight margins', () => {
  const day = solarDay;
  const times = SunCalc.getTimes(new Date('2026-03-20T12:00:00Z'), settings.latitude, settings.longitude);
  assert.equal(day.originTime + day.sunrise * 60000, times.sunrise.valueOf());
  assert.equal(day.originTime + day.sunset * 60000, times.sunset.valueOf());
  assert.equal(day.originTime + 720 * 60000, times.solarNoon.valueOf());
  assert.ok(day.sunrise - day.start > 29 && day.sunrise - day.start <= 30);
  assert.ok(day.end - day.sunset > 29 && day.end - day.sunset <= 30);
  assert.equal(formatSolarTime(day.sunrise), '05:56');
  assert.equal(formatSolarTime(day.sunset), '18:04');
  assert.equal(formatSolarTime(day.start), '05:27');
  assert.equal(formatSolarTime(day.end), '18:34');
  assert.ok(getSunPosition(day.start, solarDay).elevation < 0);
  assert.ok(getSunPosition(day.end, solarDay).elevation < 0);
});

test('every slider minute is finite, within renderer limits and moves smoothly', () => {
  const day = solarDay;
  let previous;
  for (let minutes = day.start; minutes <= day.end; minutes += 1) {
    const position = getSunPosition(minutes, solarDay);
    assert.ok(Number.isFinite(position.azimuth));
    assert.ok(Number.isFinite(position.elevation));
    assert.ok(position.azimuth >= -180 && position.azimuth <= 180);
    assert.ok(position.elevation >= -10 && position.elevation <= 89);
    if (previous) {
      assert.ok(position.azimuth > previous.azimuth);
      assert.ok(position.azimuth - previous.azimuth < 0.5);
      assert.ok(Math.abs(position.elevation - previous.elevation) < 0.25);
    }
    previous = position;
  }
});

test('large twilight margins stop before SunCalc goes below the renderer limit', () => {
  const day = getSolarDay({ ...settings, marginMinutes: 120 });
  const rawElevation = (minutes) => SunCalc.getPosition(
    new Date(day.originTime + minutes * 60000), day.latitude, day.longitude,
  ).altitude;
  const startElevation = rawElevation(day.start);
  const endElevation = rawElevation(day.end);
  assert.ok(startElevation >= -10 && startElevation < -9.7);
  assert.ok(endElevation >= -10 && endElevation < -9.7);
  assert.ok(rawElevation(day.start - 1) < -10);
  assert.ok(rawElevation(day.end + 1) < -10);
});

test('calendar dates change day length and noon elevation', () => {
  const summerDay = getSolarDay({ ...settings, date: '2026-06-21' });
  const equinoxDay = solarDay;
  closeTo(getSunPosition(720, summerDay).elevation, 78.44, 0.1);
  assert.ok(summerDay.sunrise < equinoxDay.sunrise);
  assert.ok(summerDay.sunset > equinoxDay.sunset);
});

test('days without sunrise or sunset are rejected clearly', () => {
  assert.throws(
    () => getSolarDay({ ...settings, latitude: 89, date: '2026-06-21' }),
    /must have sunrise and sunset/,
  );
});

test('near-zenith positions stay within the renderer elevation limit', () => {
  const equatorialDay = getSolarDay({ ...settings, latitude: 0 });
  assert.equal(getSunPosition(720, equatorialDay).elevation, 89);
});

test('longitude selects the same reference solar day across the date line', () => {
  for (const longitude of [-179.9, 179.9]) {
    const day = getSolarDay({ ...settings, longitude });
    const localMeanNoon = new Date(day.originTime + (720 + longitude * 4) * 60000);
    assert.equal(localMeanNoon.toISOString().slice(0, 10), settings.date);
    closeTo(getSunPosition(720, day).azimuth, 0, 0.001);
  }
});
