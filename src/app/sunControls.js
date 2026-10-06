/** The sliders change lighting only; heliostat poses remain independent. */
export function bindSunControls(onChange) {
  const azimuthInput = document.getElementById('sun-azimuth');
  const altitudeInput = document.getElementById('sun-altitude');
  const azimuthOutput = document.getElementById('azimuth-value');
  const altitudeOutput = document.getElementById('altitude-value');

  function handleInput() {
    const azimuth = Number(azimuthInput.value);
    const altitude = Number(altitudeInput.value);
    azimuthOutput.textContent = `${azimuth}°`;
    altitudeOutput.textContent = `${altitude}°`;
    onChange(azimuth, altitude);
  }

  azimuthInput.addEventListener('input', handleInput);
  altitudeInput.addEventListener('input', handleInput);

  return {
    sync(azimuth, altitude) {
      azimuthInput.value = azimuth;
      altitudeInput.value = altitude;
      azimuthOutput.textContent = `${Math.round(azimuth)}°`;
      altitudeOutput.textContent = `${Math.round(altitude)}°`;
    },
    dispose() {
      azimuthInput.removeEventListener('input', handleInput);
      altitudeInput.removeEventListener('input', handleInput);
    },
  };
}
