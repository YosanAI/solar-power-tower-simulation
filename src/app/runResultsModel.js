import { clamp } from '../utils/math.js';

const nonnegative = value => Number.isFinite(value) ? Math.max(0, value) : 0;
const RATING_LABELS = ['No captured energy', 'Keep refining', 'Getting aligned', 'Good tracking', 'Strong tracking', 'Excellent tracking'];

/** Ratings reward the share of the same field's ideal-tracking energy captured. */
export function getStarRating(efficiencyPercent, energyWh) {
  if (nonnegative(energyWh) === 0) return 0;
  const efficiency = clamp(nonnegative(efficiencyPercent), 0, 100);
  if (efficiency >= 90) return 5;
  if (efficiency >= 75) return 4;
  if (efficiency >= 50) return 3;
  if (efficiency >= 25) return 2;
  return 1;
}

/** App-lifetime records. Nothing is written to browser storage. */
export function createSessionResults() {
  let highScoreWh = 0;
  return {
    complete(state) {
      const energyWh = nonnegative(state.energyWh);
      const idealEnergyWh = nonnegative(state.idealEnergyWh);
      const efficiencyPercent = energyWh > 0
        ? clamp(idealEnergyWh > 0 ? energyWh / idealEnergyWh * 100 : nonnegative(state.efficiencyPercent), 0, 100)
        : 0;
      const peakPowerWatts = nonnegative(state.peakPowerWatts);
      const isNewHighScore = energyWh > highScoreWh;
      highScoreWh = Math.max(highScoreWh, energyWh);
      // Match the displayed precision so, for example, 90.0% earns five stars.
      const stars = getStarRating(Math.round(efficiencyPercent * 10) / 10, energyWh);
      return Object.freeze({
        energyWh, energyMWh: energyWh / 1e6,
        idealEnergyMWh: idealEnergyWh / 1e6,
        efficiencyPercent, peakPowerMW: peakPowerWatts / 1e6,
        highScoreMWh: highScoreWh / 1e6,
        isNewHighScore, stars, ratingLabel: RATING_LABELS[stars],
      });
    },
    getHighScoreWh: () => highScoreWh,
  };
}
