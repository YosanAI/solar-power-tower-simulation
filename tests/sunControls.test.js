import assert from 'node:assert/strict';
import test from 'node:test';
import { getSunControlState } from '../src/app/sunControls.js';
import { CONFIG } from '../src/scene/config.js';
import { getSolarDay, getSunPosition, formatSolarTime } from '../src/utils/solarTime.js';
import { radians } from '../src/utils/math.js';

test('GUI time readout preserves exact automatic sunrise and sunset', () => {
  const day = getSolarDay(CONFIG.solarDay);
  for (const timeMinutes of [day.sunrise, 600.25, day.sunset]) {
    const sun = getSunPosition(timeMinutes, day);
    const state = getSunControlState({ azimuth: radians(sun.azimuth), elevation: radians(sun.elevation), timeMinutes });
    assert.equal(state.timeLabel, formatSolarTime(timeMinutes));
    assert.equal(state.timeMinutes, timeMinutes);
    assert.equal(state.elevation, radians(sun.elevation));
    assert.ok(!Object.hasOwn(state, 'altitude'));
  }
});

test('manual sun angles preserve the last slider time and show Manual', () => {
  const state = getSunControlState({ azimuth: 0.2, elevation: 0.8 }, 500);
  assert.equal(state.timeLabel, 'Manual');
  assert.equal(state.timeMinutes, 500);
  assert.deepEqual(state, { timeLabel: 'Manual', timeMinutes: 500, azimuth: 0.2, elevation: 0.8 });
  assert.throws(() => getSunControlState({ azimuth: 0, elevation: NaN }), /finite radians/);
});
