import * as THREE from 'three';
import { clearSkyDni, evaluateMirrorYield, sunUnitDirection } from '../physics/yieldModel.js';
import { getSunPosition } from '../utils/solarTime.js';
import { clamp, radians } from '../utils/math.js';

const IDEAL_REFERENCE_STEP_MINUTES = 5;

/** Aim the reflecting face at the receiver, accounting for its pivot offset. */
function idealGeometry(pivot, sun, target, frontOffset) {
  let center = pivot;
  let normal;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const aim = [target.x - center[0], target.y - center[1], target.z - center[2]];
    const distance = Math.hypot(...aim);
    normal = aim.map((value, axis) => value / distance + sun[axis]);
    const length = Math.hypot(...normal);
    normal = normal.map(value => value / length);
    center = pivot.map((value, axis) => value + frontOffset * normal[axis]);
  }
  const horizontal = Math.hypot(normal[0], normal[2]);
  const right = horizontal > 1e-9 ? [normal[2] / horizontal, 0, -normal[0] / horizontal] : [1, 0, 0];
  const up = [normal[1] * right[2], normal[2] * right[0] - normal[0] * right[2], -normal[1] * right[0]];
  return { center, normal, right, up };
}

/** Receiver optics and a per-run ledger integrated over real solar hours. */
export class YieldTracker {
  constructor(rigs, target, config, solarDay, durationSeconds) {
    this.rigs = rigs;
    this.target = target;
    this.config = config;
    this.solarDay = solarDay;
    this.dayHours = (solarDay.sunset - solarDay.sunrise) / 60;
    this.durationSeconds = durationSeconds;
    this.records = new Array(rigs.length);
    this.geometries = new Array(rigs.length);
    this.sunData = null;
    this.dni = 0;
    this.powerWatts = 0;
    this.energyWh = 0;
    this.idealEnergyWh = 0;
    this.idealPowerWatts = 0;
    this.peakPowerWatts = 0;
    this.idealDayPowerCache = new Map();
    this.active = false;
    this.playback = false;
    this.lastElapsedTime = 0;
    this.vector = new THREE.Vector3();
    this.indexByRig = new Map(rigs.map((rig, index) => [rig, index]));
    this.pivots = rigs.map(rig => {
      if (rig.getRotationCenter) return rig.getRotationCenter(this.vector).toArray();
      const geometry = this.geometry(rig);
      return geometry.center.map((value, axis) => value - config.mirrorFront * geometry.normal[axis]);
    });
  }

  geometry(rig) {
    const center = rig.getMirrorCenter(this.vector).toArray();
    const normal = rig.getNormal(this.vector).toArray();
    const right = this.vector.setFromMatrixColumn(rig.elevationPivot.matrixWorld, 0).normalize().toArray();
    const up = this.vector.setFromMatrixColumn(rig.elevationPivot.matrixWorld, 1).normalize().toArray();
    return { center, normal, right, up };
  }

  updateSun(sunData, { playback = false } = {}) {
    this.sunData = { azimuth: sunData.azimuth, elevation: sunData.elevation };
    this.playback = playback;
    this.sunDirection = sunUnitDirection(sunData);
    this.dni = clearSkyDni(sunData.elevation, this.config.yield, this.config.solarDay.date);
    if (this.active && !playback) this.idealPowerWatts = this.idealPower(this.sunData, this.dni, this.sunDirection);
    this.refresh();
  }

  idealPower(sunData, dni, direction) {
    if (dni <= 0 || sunData.elevation <= 0) return 0;
    return this.pivots.reduce((total, pivot) => total + evaluateMirrorYield(
      idealGeometry(pivot, direction, this.target, this.config.mirrorFront),
      sunData, this.target, this.config, dni, direction,
    ).absorbedWatts, 0);
  }

  idealPowerAtTime(timeMinutes) {
    // The benchmark depends on the fixed field and reference day, not the script.
    // Cache a smooth five-minute power curve across runs instead of tracing a
    // second whole field for every frame and integration sample.
    const minutes = this.solarDay.sunset - this.solarDay.sunrise;
    const intervals = Math.ceil(minutes / IDEAL_REFERENCE_STEP_MINUTES);
    const position = clamp((timeMinutes - this.solarDay.sunrise) / minutes * intervals, 0, intervals);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, intervals);
    const sample = index => {
      if (!this.idealDayPowerCache.has(index)) {
        const angles = getSunPosition(this.solarDay.sunrise + index / intervals * minutes, this.solarDay);
        const sun = { azimuth: radians(angles.azimuth), elevation: radians(angles.elevation) };
        const dni = clearSkyDni(sun.elevation, this.config.yield, this.config.solarDay.date);
        this.idealDayPowerCache.set(index, this.idealPower(sun, dni, sunUnitDirection(sun)));
      }
      return this.idealDayPowerCache.get(index);
    };
    const first = sample(lower);
    return first + (sample(upper) - first) * (position - lower);
  }

  refresh(rig) {
    if (!this.sunData) return;
    const evaluate = index => {
      this.geometries[index] = this.geometry(this.rigs[index]);
      return evaluateMirrorYield(this.geometries[index], this.sunData, this.target, this.config, this.dni, this.sunDirection);
    };
    if (rig && this.indexByRig.has(rig)) {
      const index = this.indexByRig.get(rig);
      const oldPower = this.records[index]?.absorbedWatts || 0;
      this.records[index] = evaluate(index);
      this.powerWatts += this.records[index].absorbedWatts - oldPower;
    } else {
      this.powerWatts = 0;
      this.rigs.forEach((_, index) => {
        this.records[index] = evaluate(index);
        this.powerWatts += this.records[index].absorbedWatts;
      });
    }
    this.powerWatts = Math.max(0, this.powerWatts);
    if (this.active) this.peakPowerWatts = Math.max(this.peakPowerWatts, this.powerWatts);
  }

  beginRun() {
    this.energyWh = 0;
    this.idealEnergyWh = 0;
    this.peakPowerWatts = this.powerWatts;
    this.idealPowerWatts = this.sunData ? this.idealPower(this.sunData, this.dni, this.sunDirection) : 0;
    this.lastElapsedTime = 0;
    this.active = true;
    this.playback = true;
  }

  advanceTo(elapsedTime) {
    if (!this.active) return;
    if (!Number.isFinite(elapsedTime) || elapsedTime < 0 || elapsedTime > this.durationSeconds) {
      throw new TypeError('Yield time must be within the simulated day.');
    }
    if (elapsedTime <= this.lastElapsedTime) return;
    const solarHours = (elapsedTime - this.lastElapsedTime) / this.durationSeconds * this.dayHours;
    if (this.playback) {
      // Poses stay fixed until commands commit. Sample intervening sun positions so
      // slow callbacks cannot retroactively claim perfectly tracked elapsed hours.
      const steps = Math.ceil(solarHours * 60 / this.config.yield.integrationStepMinutes);
      for (let step = 0; step < steps; step += 1) {
        const elapsed = this.lastElapsedTime + (elapsedTime - this.lastElapsedTime) * (step + 0.5) / steps;
        const timeMinutes = this.solarDay.sunrise + elapsed / this.durationSeconds * (this.solarDay.sunset - this.solarDay.sunrise);
        const angles = getSunPosition(timeMinutes, this.solarDay);
        const sun = { azimuth: radians(angles.azimuth), elevation: radians(angles.elevation) };
        const dni = clearSkyDni(sun.elevation, this.config.yield, this.config.solarDay.date);
        const direction = sunUnitDirection(sun);
        const power = this.geometries.reduce((total, geometry) => total + evaluateMirrorYield(geometry, sun, this.target, this.config, dni, direction).absorbedWatts, 0);
        this.energyWh += power * solarHours / steps;
        this.idealEnergyWh += this.idealPowerAtTime(timeMinutes) * solarHours / steps;
        this.peakPowerWatts = Math.max(this.peakPowerWatts, power);
      }
    } else {
      // A manual sun edit remains fixed until the next automatic playback update.
      this.energyWh += this.powerWatts * solarHours;
      this.idealEnergyWh += this.idealPowerWatts * solarHours;
      this.peakPowerWatts = Math.max(this.peakPowerWatts, this.powerWatts);
    }
    this.lastElapsedTime = elapsedTime;
  }

  endRun() { this.active = false; }

  getState() {
    const incident = this.records.reduce((sum, item) => sum + (item?.incidentWatts || 0), 0);
    const captured = this.records.reduce((sum, item) => sum + (item?.incidentWatts || 0) * (item?.intercept || 0), 0);
    return {
      energyWh: this.energyWh, energyMWh: this.energyWh / 1e6,
      powerWatts: this.powerWatts, powerMW: this.powerWatts / 1e6,
      peakPowerWatts: this.peakPowerWatts, peakPowerMW: this.peakPowerWatts / 1e6,
      idealEnergyWh: this.idealEnergyWh, idealEnergyMWh: this.idealEnergyWh / 1e6,
      efficiencyPercent: this.idealEnergyWh > 0 ? clamp(this.energyWh / this.idealEnergyWh, 0, 1) * 100 : 0,
      captureFraction: incident ? captured / incident : 0,
      contributingMirrors: this.records.filter(item => item?.absorbedWatts > 0).length,
      dniWattsPerSquareMetre: this.dni,
      mirrorAreaSquareMetres: 2 * this.config.paneWidth * this.config.paneHeight,
      unit: 'MWh thermal', active: this.active,
    };
  }
}
