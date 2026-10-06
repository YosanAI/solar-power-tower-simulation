import './style.css';
import { createSolarScene } from './app/createSolarScene.js';
import { bindSunControls } from './app/sunControls.js';

const loadingMessage = document.getElementById('loading');
let sunControls;
let solarScene;

function showBootError(error) {
  console.error(error);
  loadingMessage.hidden = false;
  loadingMessage.textContent = `Unable to open the scene: ${error.message || String(error)}. WebGL 2 is required.`;
}

try {
  window.solarSceneReady = false;
  window.solarReflectionsReady = false;
  solarScene = createSolarScene({
    viewport: document.getElementById('viewport'),
    onReady() {
      loadingMessage.hidden = true;
      window.solarSceneReady = true;
    },
    onError: showBootError,
    onSunChange(azimuth, altitude) {
      sunControls?.sync(azimuth, altitude);
    },
    onDispose() {
      sunControls?.dispose();
      window.solarSceneReady = false;
      window.solarReflectionsReady = false;
    },
  });
  sunControls = bindSunControls((azimuth, altitude) => {
    solarScene.setSunDegrees(azimuth, altitude);
  });
  window.solarScene = solarScene;
} catch (error) {
  showBootError(error);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    solarScene?.dispose();
    delete window.solarScene;
  });
}
