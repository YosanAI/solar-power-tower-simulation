import * as THREE from 'three';
import { clearSkyDni, evaluateMirrorYield, sunUnitDirection } from '../physics/yieldModel.js';
import { getSunPosition } from '../utils/solarTime.js';
import { radians } from '../utils/math.js';

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
    this.active = false;
    this.playback = false;
    this.lastElapsedTime = 0;
    this.vector = new THREE.Vector3();
    this.indexByRig = new Map(rigs.map((rig, index) => [rig, index]));
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
    this.refresh();
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
  }

  beginRun() {
    this.energyWh = 0;
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
      }
    } else {
      // A manual sun edit remains fixed until the next automatic playback update.
      this.energyWh += this.powerWatts * solarHours;
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
      captureFraction: incident ? captured / incident : 0,
      contributingMirrors: this.records.filter(item => item?.absorbedWatts > 0).length,
      dniWattsPerSquareMetre: this.dni,
      mirrorAreaSquareMetres: 2 * this.config.paneWidth * this.config.paneHeight,
      unit: 'MWh thermal', active: this.active,
    };
  }
}
