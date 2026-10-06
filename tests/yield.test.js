import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { CONFIG } from '../src/scene/config.js';
import { clearSkyDni, beamCapture, sunUnitDirection, evaluateMirrorYield } from '../src/physics/yieldModel.js';
import { YieldTracker } from '../src/app/yieldTracker.js';
import { HeliostatRig } from '../src/scene/heliostats.js';
import { getSolarDay, getSunPosition } from '../src/utils/solarTime.js';
import { radians } from '../src/utils/math.js';

const sun = { azimuth: 0, elevation: Math.PI / 4 };
const target = { x: 0, y: 139.3, z: 0 };
const center = [0, 3, 200];
const normalize = values => { const length = Math.hypot(...values); return values.map(value => value / length); };
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function geometry(offset = 0, backwards = false) {
  let direction = normalize([target.x + offset - center[0], target.y - center[1], target.z - center[2]]);
  if (backwards) direction = direction.map(value => -value);
  const light = sunUnitDirection(sun);
  const normal = normalize(light.map((value, axis) => value + direction[axis]));
  const azimuth = Math.atan2(normal[0], normal[2]);
  const elevation = Math.atan2(normal[1], Math.hypot(normal[0], normal[2]));
  return {
    center, normal,
    right: [Math.cos(azimuth), 0, -Math.sin(azimuth)],
    up: [-Math.sin(azimuth) * Math.sin(elevation), Math.cos(elevation), -Math.cos(azimuth) * Math.sin(elevation)],
  };
}

function rigFromGeometry(value) {
  return {
    getMirrorCenter: vector => vector.fromArray(value.center),
    getNormal: vector => vector.fromArray(value.normal),
    elevationPivot: { matrixWorld: new THREE.Matrix4().makeBasis(new THREE.Vector3(...value.right), new THREE.Vector3(...value.up), new THREE.Vector3(...value.normal)) },
  };
}

test('clear-sky DNI is realistic at reference noon, weak near the horizon and zero at night', () => {
  assert.equal(clearSkyDni(-0.1, CONFIG.yield, CONFIG.solarDay.date), 0);
  assert.equal(clearSkyDni(0, CONFIG.yield, CONFIG.solarDay.date), 0);
  const noon = clearSkyDni(55 * Math.PI / 180, CONFIG.yield, CONFIG.solarDay.date);
  assert.ok(noon > 850 && noon < 1000);
  assert.ok(clearSkyDni(5 * Math.PI / 180, CONFIG.yield, CONFIG.solarDay.date) < noon / 3);
  const hazy = { ...CONFIG.yield, linkeTurbidity: 6 };
  assert.ok(clearSkyDni(55 * Math.PI / 180, hazy, CONFIG.solarDay.date) < noon);
  assert.throws(() => clearSkyDni(NaN, CONFIG.yield, CONFIG.solarDay.date), /finite/);
});

test('reflection follows the law of reflection and aims at the receiver', () => {
  const ideal = geometry();
  const result = evaluateMirrorYield(ideal, sun, target, CONFIG, 900);
  const desired = normalize([target.x - center[0], target.y - center[1], target.z - center[2]]);
  result.reflected.forEach((value, axis) => close(value, desired[axis]));
  close(result.missDistanceMetres, 0);
  assert.ok(result.intercept > 0.99);
  assert.ok(result.absorbedWatts > 0 && result.absorbedWatts < result.incidentWatts);
  assert.ok(Math.hypot(...ideal.normal.map((value, axis) => value - desired[axis])) > 0.1);
});

test('capture decreases smoothly with offset and becomes exactly zero beyond the finite tolerance', () => {
  const results = [0, 2, 4, 6, 9, 14, 30].map(offset => evaluateMirrorYield(geometry(offset), sun, target, CONFIG, 900));
  for (let index = 1; index < results.length - 1; index += 1) {
    assert.ok(results[index].intercept < results[index - 1].intercept);
    assert.ok(results[index].absorbedWatts < results[index - 1].absorbedWatts);
  }
  assert.equal(results.at(-1).absorbedWatts, 0);
  close(beamCapture(4, 6.38, 1), beamCapture(-4, 6.38, 1));
  assert.equal(beamCapture(9.38, 6.38, 1), 0);
  assert.ok(beamCapture(9.37, 6.38, 1) < 1e-5);
  assert.throws(() => beamCapture(0, 1, 0), /positive/);
});

test('back faces, away-facing reflected rays and nighttime yield no receiver power', () => {
  const away = evaluateMirrorYield(geometry(0, true), sun, target, CONFIG, 900);
  assert.equal(away.absorbedWatts, 0);
  assert.ok(away.incidentWatts > 0, 'illuminated misses stay in the capture-fraction denominator');
  const back = geometry();
  back.normal = back.normal.map(value => -value);
  assert.equal(evaluateMirrorYield(back, sun, target, CONFIG, 900).absorbedWatts, 0);
  assert.equal(evaluateMirrorYield(geometry(), { azimuth: 0, elevation: -0.1 }, target, CONFIG, 0).absorbedWatts, 0);
});

test('pane area excludes the gap, power scales with area, and optical errors reduce capture', () => {
  const value = geometry();
  const result = evaluateMirrorYield(value, sun, target, CONFIG, 900);
  const cosine = value.normal.reduce((sum, element, axis) => sum + element * sunUnitDirection(sun)[axis], 0);
  close(result.incidentWatts / (900 * cosine), 15.18);
  assert.ok(result.absorbedWatts / result.incidentWatts > 0.7 && result.absorbedWatts / result.incidentWatts < 0.85);
  const poorOptics = { ...CONFIG, yield: { ...CONFIG.yield, slopeErrorRadians: 0.02 } };
  assert.ok(evaluateMirrorYield(value, sun, target, poorOptics, 900).intercept < result.intercept);
  const doubleHeight = { ...CONFIG, paneHeight: CONFIG.paneHeight * 2 };
  close(evaluateMirrorYield(value, sun, target, doubleHeight, 900).incidentWatts, result.incidentWatts * 2);
});

test('energy uses simulated solar hours and preserves a stopped day until the next successful run', () => {
  const tracker = new YieldTracker([rigFromGeometry(geometry())], target, CONFIG, { sunrise: 360, sunset: 1080 }, 12);
  tracker.updateSun(sun);
  const power = tracker.getState().powerWatts;
  tracker.beginRun();
  tracker.updateSun(sun); // Manual, fixed sun for an analytic energy integral.
  tracker.advanceTo(6);
  close(tracker.getState().energyWh, power * 6);
  tracker.advanceTo(12);
  close(tracker.getState().energyWh, power * 12);
  close(tracker.getState().energyMWh, power * 12 / 1e6);
  tracker.advanceTo(12);
  tracker.advanceTo(3);
  close(tracker.getState().energyWh, power * 12);
  tracker.endRun();
  tracker.updateSun({ azimuth: 1, elevation: 0.3 });
  tracker.advanceTo(12);
  close(tracker.getState().energyWh, power * 12);
  tracker.beginRun();
  assert.equal(tracker.getState().energyWh, 0);
  assert.throws(() => tracker.advanceTo(13), /simulated day/);
});

test('new mirror commands cannot earn energy retroactively, and individual refreshes preserve other records', () => {
  const firstGeometry = geometry();
  const first = rigFromGeometry(firstGeometry);
  const second = rigFromGeometry(geometry());
  const tracker = new YieldTracker([first, second], target, CONFIG, { sunrise: 360, sunset: 1080 }, 12);
  tracker.updateSun(sun);
  tracker.beginRun();
  tracker.updateSun(sun);
  const initialPower = tracker.getState().powerWatts;
  tracker.advanceTo(6);
  const secondRecord = tracker.records[1];
  Object.assign(firstGeometry, geometry(30));
  first.elevationPivot.matrixWorld.makeBasis(new THREE.Vector3(...firstGeometry.right), new THREE.Vector3(...firstGeometry.up), new THREE.Vector3(...firstGeometry.normal));
  tracker.refresh(first);
  assert.equal(tracker.records[1], secondRecord);
  assert.equal(tracker.records[0].absorbedWatts, 0);
  close(tracker.getState().powerWatts, secondRecord.absorbedWatts);
  close(tracker.getState().energyWh, initialPower * 6);
  tracker.advanceTo(12);
  close(tracker.getState().energyWh, initialPower * 6 + secondRecord.absorbedWatts * 6);
});

test('automatic-day quadrature matches fine sampling even when a callback skips hours', () => {
  const day = getSolarDay(CONFIG.solarDay);
  const rig = new HeliostatRig({ id: 'test', x: 0, z: 200, index: 0, sector: 0 });
  const desired = new THREE.Vector3(target.x, target.y, target.z).sub(rig.getRotationCenter()).normalize();
  const light = new THREE.Vector3(0, Math.sin(55 * Math.PI / 180), Math.cos(55 * Math.PI / 180));
  const normal = desired.add(light).normalize();
  rig.setPose({ azimuth: Math.atan2(normal.x, normal.z), elevation: Math.atan2(normal.y, Math.hypot(normal.x, normal.z)) });
  const fineConfig = { ...CONFIG, yield: { ...CONFIG.yield, integrationStepMinutes: 0.05 } };
  const trackers = [CONFIG, fineConfig].map(config => {
    const tracker = new YieldTracker([rig], target, config, day, 12);
    tracker.updateSun(sun);
    tracker.beginRun();
    return tracker;
  });
  trackers.forEach(tracker => tracker.advanceTo(12));
  const [coarse, fine] = trackers.map(tracker => tracker.getState().energyWh);
  assert.ok(fine > 1000 && fine < 15000, 'a stationary noon pose captures a limited part of the day');
  assert.ok(Math.abs(coarse - fine) / fine < 0.002, `integration error ${(coarse - fine) / fine}`);
  assert.equal(trackers[0].getState().powerWatts, trackers[1].getState().powerWatts, 'integration does not move the visible sun or mirror');
});

test('ideal tracking earns full efficiency and preserves the day peak after sunset and stop', () => {
  const tracker = new YieldTracker([rigFromGeometry(geometry())], target, CONFIG, { sunrise: 360, sunset: 1080 }, 12);
  tracker.updateSun(sun);
  tracker.beginRun();
  tracker.updateSun(sun);
  const power = tracker.getState().powerWatts;
  tracker.advanceTo(12);
  const result = tracker.getState();
  assert.ok(result.idealEnergyWh > 0);
  close(result.efficiencyPercent, 100, 1e-6);
  close(result.peakPowerWatts, power);
  close(result.peakPowerMW, power / 1e6);
  tracker.endRun();
  tracker.updateSun({ azimuth: 0, elevation: -0.1 });
  assert.equal(tracker.getState().powerWatts, 0);
  close(tracker.getState().peakPowerWatts, power);
  close(tracker.getState().idealEnergyWh, result.idealEnergyWh);
  tracker.beginRun();
  assert.equal(tracker.getState().peakPowerWatts, 0);
  assert.equal(tracker.getState().idealEnergyWh, 0);
});

test('efficiency compares the whole day with an independent ideal field, rather than the final capture fraction', () => {
  const badGeometry = geometry(30);
  const good = rigFromGeometry(geometry());
  const bad = rigFromGeometry(badGeometry);
  const tracker = new YieldTracker([good, bad], target, CONFIG, { sunrise: 360, sunset: 1080 }, 12);
  tracker.updateSun(sun);
  tracker.beginRun();
  tracker.updateSun(sun);
  const referencePower = tracker.idealPowerWatts;
  tracker.advanceTo(6);
  assert.ok(Math.abs(tracker.getState().efficiencyPercent - 50) < 0.05);
  Object.assign(badGeometry, geometry());
  bad.elevationPivot.matrixWorld.makeBasis(new THREE.Vector3(...badGeometry.right), new THREE.Vector3(...badGeometry.up), new THREE.Vector3(...badGeometry.normal));
  tracker.refresh(bad);
  assert.equal(tracker.idealPowerWatts, referencePower, 'correcting a mirror does not change the denominator');
  tracker.advanceTo(12);
  const state = tracker.getState();
  assert.ok(Math.abs(state.efficiencyPercent - 75) < 0.05);
  assert.ok(state.captureFraction > 0.99, 'a perfect final pose does not erase the missed morning');
  close(state.peakPowerWatts, state.powerWatts);
});

test('cached ideal-day energy matches minute-by-minute optics and is reused on subsequent runs', () => {
  const day = getSolarDay(CONFIG.solarDay);
  const tracker = new YieldTracker([rigFromGeometry(geometry())], target, CONFIG, day, 12);
  tracker.updateSun(sun);
  let referenceWh = 0;
  const steps = Math.ceil(day.sunset - day.sunrise);
  const hoursPerStep = (day.sunset - day.sunrise) / 60 / steps;
  for (let step = 0; step < steps; step += 1) {
    const angles = getSunPosition(day.sunrise + (step + 0.5) / steps * (day.sunset - day.sunrise), day);
    const data = { azimuth: radians(angles.azimuth), elevation: radians(angles.elevation) };
    referenceWh += tracker.idealPower(data, clearSkyDni(data.elevation, CONFIG.yield, CONFIG.solarDay.date), sunUnitDirection(data)) * hoursPerStep;
  }
  const evaluate = tracker.idealPower.bind(tracker);
  let evaluations = 0;
  tracker.idealPower = (...args) => { evaluations += 1; return evaluate(...args); };
  tracker.beginRun();
  tracker.advanceTo(12);
  const first = tracker.getState().idealEnergyWh;
  assert.ok(Math.abs(first - referenceWh) / referenceWh < 0.002, 'cached reference differs by less than 0.2%');
  assert.ok(evaluations < steps / 3, 'benchmark traces are not repeated for every integration sample');
  tracker.beginRun();
  const afterBegin = evaluations;
  tracker.advanceTo(12);
  assert.equal(evaluations, afterBegin, 'the next day reuses the entire ideal power curve');
  close(tracker.getState().idealEnergyWh, first);
});
