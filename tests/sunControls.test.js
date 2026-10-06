import assert from 'node:assert/strict';
import test from 'node:test';
import { bindSunControls } from '../src/app/sunControls.js';
import { CONFIG } from '../src/scene/config.js';
import { getSolarDay, getSunPosition, formatSolarTime } from '../src/utils/solarTime.js';

function mountControls(t) {
  const previousDocument = globalThis.document;
  const elements = new Map();
  for (const id of ['sun-time', 'time-value', 'sun-daylight', 'sun-day-context', 'sun-azimuth', 'sun-altitude', 'azimuth-value', 'altitude-value']) {
    let value = '';
    const listeners = new Map();
    const attributes = new Map();
    elements.set(id, {
      textContent: '',
      // Reproduce the browser's whole-minute snapping at the time slider.
      get value() { return value; },
      set value(next) { value = String(id === 'sun-time' ? Math.round(Number(next)) : next); },
      setAttribute(name, next) { attributes.set(name, next); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(name, handler) { listeners.set(name, handler); },
      removeEventListener(name) { listeners.delete(name); },
      listeners,
    });
  }
  globalThis.document = { getElementById: id => elements.get(id) };
  const controls = bindSunControls(() => {});
  t.after(() => {
    controls.dispose();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  return { controls, elements };
}

test('fractional automatic sunrise and sunset keep the solar time readout', t => {
  const { controls, elements } = mountControls(t);
  const day = getSolarDay(CONFIG.solarDay);
  for (const time of [day.sunrise, 600.25, day.sunset]) {
    const position = getSunPosition(time, day);
    controls.sync(position.azimuth, position.altitude, time);
    assert.equal(elements.get('time-value').textContent, formatSolarTime(time));
    assert.equal(elements.get('sun-time').getAttribute('aria-valuetext'), `${formatSolarTime(time)} solar time`);
  }
});

test('explicit manual sun angles always mark time as overridden', t => {
  const { controls, elements } = mountControls(t);
  const position = getSunPosition(CONFIG.sunTimeMinutes, getSolarDay(CONFIG.solarDay));
  controls.sync(position.azimuth, position.altitude, null);
  assert.equal(elements.get('time-value').textContent, 'Manual');
  assert.ok(elements.get('sun-time').getAttribute('aria-valuetext').includes('manually overridden'));
});
