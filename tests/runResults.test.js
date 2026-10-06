import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionResults, getStarRating } from '../src/app/runResultsModel.js';

test('five-star ratings reflect tracking performance with no stars for zero yield', () => {
  assert.equal(getStarRating(100, 0), 0);
  for (const [efficiency, stars] of [[0, 1], [24.999, 1], [25, 2], [49.999, 2], [50, 3], [74.999, 3], [75, 4], [89.999, 4], [90, 5], [100, 5], [120, 5]]) {
    assert.equal(getStarRating(efficiency, 1e6), stars, `${efficiency}%`);
  }
});

test('results use day totals and peak power rather than the sunset instantaneous reading', () => {
  const state = { energyWh: 150e6, idealEnergyWh: 160e6, peakPowerWatts: 18e6, powerWatts: 0 };
  const result = createSessionResults().complete(state);
  assert.equal(result.energyMWh, 150);
  assert.equal(result.idealEnergyMWh, 160);
  assert.equal(result.efficiencyPercent, 93.75);
  assert.equal(result.peakPowerMW, 18);
  assert.equal(result.stars, 5);
  state.energyWh = 0;
  state.peakPowerWatts = 0;
  assert.equal(result.energyMWh, 150, 'completed results are a frozen snapshot');
  assert.ok(Object.isFrozen(result));
});

test('only strictly higher scores break the in-memory record, and a new app instance resets it', () => {
  const session = createSessionResults();
  const run = score => session.complete({ energyWh: score * 1e6, idealEnergyWh: 200e6, peakPowerWatts: 20e6 });
  assert.equal(run(0).isNewHighScore, false);
  assert.equal(run(100).isNewHighScore, true);
  const lower = run(80);
  assert.equal(lower.isNewHighScore, false);
  assert.equal(lower.highScoreMWh, 100);
  assert.equal(run(100).isNewHighScore, false);
  const better = run(101);
  assert.equal(better.isNewHighScore, true);
  assert.equal(better.highScoreMWh, 101);
  assert.equal(session.getHighScoreWh(), 101e6);
  assert.equal(createSessionResults().getHighScoreWh(), 0);
});

test('zero and invalid readings never create NaN percentages or bogus records', () => {
  const session = createSessionResults();
  const result = session.complete({ energyWh: NaN, idealEnergyWh: 0, peakPowerWatts: Infinity });
  assert.equal(result.energyMWh, 0);
  assert.equal(result.efficiencyPercent, 0);
  assert.equal(result.peakPowerMW, 0);
  assert.equal(result.stars, 0);
  assert.equal(result.isNewHighScore, false);
  assert.equal(session.complete({ energyWh: 101, idealEnergyWh: 100 }).efficiencyPercent, 100);
});

test('star thresholds agree with the efficiency precision shown to the player', () => {
  const result = createSessionResults().complete({ energyWh: 899.6, idealEnergyWh: 1000 });
  assert.equal(result.efficiencyPercent.toFixed(1), '90.0');
  assert.equal(result.stars, 5);
});
