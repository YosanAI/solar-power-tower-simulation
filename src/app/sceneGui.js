import { GUI } from 'dat.gui';
import { getSunControlState } from './sunControls.js';
import { formatSolarTime } from '../utils/solarTime.js';
import { radians } from '../utils/math.js';

/** All scene configuration lives in the same dat.gui panel. */
export function createSceneGui({ api }) {
  const host = document.getElementById('scene-controls');
  const gui = new GUI({ name: 'Scene controls', width: 280, autoPlace: false, closeOnTop: true });
  gui.domElement.style.width = '100%';
  host.appendChild(gui.domElement);
  const day = api.getSolarDay();
  const values = {
    ...getSunControlState(api.getSunData()),
    date: api.config.solarDay.date,
    latitude: String(day.latitude),
    longitude: String(day.longitude),
    sunrise: formatSolarTime(day.sunrise),
    sunset: formatSolarTime(day.sunset),
    showRays: api.getShowRays(),
  };

  function identify(controller, name) {
    controller.domElement.dataset.setting = name;
    const labels = {
      timeLabel: 'Time of day', timeMinutes: 'Solar time in minutes',
      azimuth: 'Sun azimuth in radians', elevation: 'Sun elevation in radians',
      showRays: 'Show rays',
    };
    controller.domElement.querySelector('input')?.setAttribute('aria-label', labels[name] || name);
    return controller;
  }

  function readOnly(controller, name) {
    identify(controller, name);
    const input = controller.domElement.querySelector('input');
    if (input) { input.readOnly = true; input.setAttribute('aria-readonly', 'true'); }
    return controller;
  }

  const sun = gui.addFolder('Sun position');
  const clock = readOnly(sun.add(values, 'timeLabel').name('Time of day'), 'timeLabel');
  const time = identify(sun.add(values, 'timeMinutes', day.start, day.end).step(1).name('Solar time (min)'), 'timeMinutes');
  time.domElement.title = 'Minutes since solar midnight: 600 = 10:00.';
  time.onChange(value => api.setSunTime(value));
  const setSunAngles = () => api.setSun({ azimuth: values.azimuth, elevation: values.elevation });
  const azimuth = identify(sun.add(values, 'azimuth', -Math.PI, Math.PI).step(0.001).name('Azimuth (rad)'), 'azimuth');
  azimuth.onChange(setSunAngles);
  const elevation = identify(sun.add(values, 'elevation', radians(-10), radians(89)).step(0.001).name('Elevation (rad)'), 'elevation');
  elevation.onChange(setSunAngles);
  sun.open();

  const reference = gui.addFolder('Reference day');
  readOnly(reference.add(values, 'date').name('Date'), 'date');
  readOnly(reference.add(values, 'latitude').name('Latitude (deg)'), 'latitude');
  readOnly(reference.add(values, 'longitude').name('Longitude (deg)'), 'longitude');
  readOnly(reference.add(values, 'sunrise').name('Sunrise'), 'sunrise');
  readOnly(reference.add(values, 'sunset').name('Sunset'), 'sunset');

  const debug = gui.addFolder('Debug');
  const showRays = identify(debug.add(values, 'showRays').name('Show rays'), 'showRays');
  showRays.onChange(value => api.setShowRays(value));
  showRays.domElement.title = 'Show incidence (yellow), reflection (green), and mirror normal (cyan).';
  const legend = document.createElement('li');
  legend.className = 'ray-legend';
  legend.innerHTML = '<span class="ray-incidence">Incidence</span><span class="ray-reflection">Reflection</span><span class="ray-normal">Normal</span>';
  debug.domElement.querySelector('ul').appendChild(legend);
  debug.open();

  const pointers = new Set();
  const begin = event => pointers.add(event.pointerId);
  const end = event => { pointers.delete(event.pointerId); sync(); };
  const clear = () => { pointers.clear(); sync(); };
  gui.domElement.addEventListener('pointerdown', begin);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', clear);

  function sync() {
    const raysVisible = api.getShowRays();
    if (values.showRays !== raysVisible) { values.showRays = raysVisible; showRays.updateDisplay(); }
    const state = getSunControlState(api.getSunData(), values.timeMinutes);
    if (values.timeLabel !== state.timeLabel) {
      values.timeLabel = state.timeLabel;
      clock.updateDisplay();
    }
    const focused = document.activeElement;
    if (pointers.size || (focused?.tagName === 'INPUT' && !focused.readOnly && gui.domElement.contains(focused))) return;
    for (const [key, controller] of [['timeMinutes', time], ['azimuth', azimuth], ['elevation', elevation]]) {
      if (values[key] !== state[key]) { values[key] = state[key]; controller.updateDisplay(); }
    }
  }

  return {
    sync,
    destroy() {
      gui.domElement.removeEventListener('pointerdown', begin);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', clear);
      gui.destroy();
      gui.domElement.remove();
    },
  };
}
