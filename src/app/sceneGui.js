import { GUI } from 'dat.gui';

/** Temporary experiment control, styled and mounted like the reference GUI. */
export function createSceneGui() {
  const host = document.getElementById('scene-controls');
  const gui = new GUI({ name: 'Scene controls', width: 280, autoPlace: false, closeOnTop: true });
  gui.domElement.style.width = '100%';
  host.appendChild(gui.domElement);
  const values = { durationSeconds: 20 };
  const folder = gui.addFolder('Day simulation · temporary');
  folder.add(values, 'durationSeconds', 3, 60).step(1).name('Day duration (s)');
  folder.open();
  const note = document.createElement('p');
  note.className = 'scene-controls-note';
  note.textContent = 'Duration changes apply to the next Run.';
  host.appendChild(note);
  return {
    getDuration: () => values.durationSeconds,
    destroy() { gui.destroy(); gui.domElement.remove(); note.remove(); },
  };
}
