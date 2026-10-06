import './style.css';
import { createSolarScene } from './app/createSolarScene.js';
import { createCodeEditor } from './editor/code-editor.js';
import { createSceneGui } from './app/sceneGui.js';

const loadingMessage = document.getElementById('loading');
let solarScene;
let codeEditor;
let sceneGui;

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
    onSunChange() {
      sceneGui?.sync();
      codeEditor?.sunChanged();
    },
    onFrame(deltaTime) { codeEditor?.tick(deltaTime); sceneGui?.sync(); },
    onDispose() {
      codeEditor?.destroy();
      sceneGui?.destroy();
      window.solarSceneReady = false;
      window.solarReflectionsReady = false;
    },
  });
  sceneGui = createSceneGui({ api: solarScene });
  codeEditor = createCodeEditor({ api: solarScene });
  window.solarScene = solarScene;
  window.mirrorEditor = codeEditor;
} catch (error) {
  showBootError(error);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    solarScene?.dispose();
    delete window.solarScene;
    delete window.mirrorEditor;
  });
}
