const energyFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const powerFormat = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Keep receiver yield visible independently of the scene settings. */
export function createYieldHud({ api }) {
  const host = document.getElementById('yield-hud');
  const energy = document.getElementById('yield-energy');
  const power = document.getElementById('yield-power');
  host.hidden = false;

  function sync(state = api.getYieldState()) {
    const energyMWh = Number.isFinite(state.energyMWh) ? Math.max(0, state.energyMWh) : 0;
    const powerMW = Number.isFinite(state.powerMW) ? Math.max(0, state.powerMW) : 0;
    const energyText = energyFormat.format(energyMWh);
    const powerText = powerFormat.format(powerMW);
    if (energy.textContent !== energyText) energy.textContent = energyText;
    if (power.textContent !== powerText) power.textContent = powerText;
  }

  sync();
  return { sync, destroy() { host.hidden = true; } };
}
