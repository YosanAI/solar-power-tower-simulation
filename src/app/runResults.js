import { createSessionResults } from './runResultsModel.js';

const energyFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const powerFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const efficiencyFormat = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Native modal dialog: focus containment, Escape, backdrop and explicit close. */
export function createRunResults({ onRunAgain }) {
  const dialog = document.getElementById('run-results');
  const closeButton = document.getElementById('close-results');
  const returnButton = document.getElementById('return-to-field');
  const runAgainButton = document.getElementById('run-again');
  const records = createSessionResults();
  const stars = [...dialog.querySelectorAll('.result-star')];
  let previousFocus;

  function close() { if (dialog.open) dialog.close(); }
  function restoreFocus() {
    if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function backdropClick(event) {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  }
  function replay() { close(); onRunAgain?.(); }

  closeButton.addEventListener('click', close);
  returnButton.addEventListener('click', close);
  runAgainButton.addEventListener('click', replay);
  dialog.addEventListener('click', backdropClick);
  dialog.addEventListener('close', restoreFocus);

  return {
    show(state) {
      const result = records.complete(state);
      document.getElementById('result-energy').textContent = energyFormat.format(result.energyMWh);
      document.getElementById('result-efficiency').textContent = efficiencyFormat.format(result.efficiencyPercent);
      document.getElementById('result-ideal-energy').textContent = energyFormat.format(result.idealEnergyMWh);
      document.getElementById('result-peak-power').textContent = powerFormat.format(result.peakPowerMW);
      document.getElementById('result-high-score').textContent = energyFormat.format(result.highScoreMWh);
      document.getElementById('result-record').hidden = !result.isNewHighScore;
      document.getElementById('result-stars').setAttribute('aria-label', `${result.stars} out of 5 stars`);
      document.getElementById('result-rating').textContent = result.ratingLabel;
      stars.forEach((star, index) => star.classList.toggle('earned', index < result.stars));
      if (!dialog.open) {
        previousFocus = document.activeElement;
        dialog.showModal();
      }
      dialog.scrollTop = 0;
      closeButton.focus({ preventScroll: true });
      return result;
    },
    close,
    destroy() {
      close();
      closeButton.removeEventListener('click', close);
      returnButton.removeEventListener('click', close);
      runAgainButton.removeEventListener('click', replay);
      dialog.removeEventListener('click', backdropClick);
      dialog.removeEventListener('close', restoreFocus);
    },
  };
}
