import { EditorView, basicSetup } from 'codemirror';
import { javascript, javascriptLanguage, scopeCompletionSource } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import * as THREE from 'three';
import { DEFAULT_CODE, createSimulationRunner } from './simulation.js';
import { createEditorPanel } from './editor-panel.js';
import { CONSOLE_METHODS } from './sandbox-limits.js';
import './editor.css';

const MIRROR_COMPLETIONS = [
  { label: 'id', type: 'property', info: 'Stable mirror ID.' },
  { label: 'pos', type: 'property', info: 'Mirror position: { x: number, y: number, z: number }.' },
  { label: 'azimuth', type: 'property', info: 'Current azimuth in radians.' },
  { label: 'elevation', type: 'property', info: 'Current elevation in radians.' },
  { label: 'setPose', type: 'method', info: 'setPose({ azimuth, elevation }) sets either or both angles in radians.' },
  { label: 'setAzimuth', type: 'method', info: 'setAzimuth(radians)' },
  { label: 'setElevation', type: 'method', info: 'setElevation(radians), clamped to 0–Math.PI / 2.' },
  { label: 'getCurrentAzimuth', type: 'method', info: 'Returns the current azimuth in radians.' },
  { label: 'getCurrentElevation', type: 'method', info: 'Returns the current elevation in radians.' },
  { label: 'reset', type: 'method', info: 'Restore azimuth 0 and elevation Math.PI / 2.' },
];

const SUN_COMPLETIONS = [
  ['azimuth', 'Sun azimuth in radians, following the scene coordinate convention.'],
  ['elevation', 'Sun elevation above the horizon in radians.'],
  ['timeMinutes', 'Current time of day in local solar minutes.'],
  ['elapsedTime', 'Elapsed simulation seconds for this run.'],
  ['deltaTime', 'Simulation seconds since the previous callback.'],
].map(([label, info]) => ({ label, type: 'property', info }));

/** Complete the supplied data and per-mirror API without exposing scene objects. */
export function mirrorCompletionSource(context) {
  const member = context.matchBefore(/[\w$]+(?:\s*\[[^\]\n]*\])?\s*\.\s*[\w$]*/);
  if (!member) return null;
  const match = /^(.*?)\.\s*([\w$]*)$/.exec(member.text);
  if (!match) return null;
  const owner = match[1].trim();
  let options;
  if (owner === 'sunData') options = SUN_COMPLETIONS;
  else if (owner === 'receiverTargetPos' || owner === 'pos') {
    options = ['x', 'y', 'z'].map(label => ({ label, type: 'property', info: 'World coordinate in scene units.' }));
  } else {
    const source = context.state.doc.toString();
    const aliases = new Set(['mirror']);
    for (const alias of source.matchAll(/(?:const|let|var)\s+([\w$]+)(?:\s+of\s+mirrorList|\s*=\s*mirrorList\s*\[)/g)) aliases.add(alias[1]);
    for (const alias of source.matchAll(/mirrorList\s*\.\s*(?:forEach|map)\s*\(\s*\(?\s*([\w$]+)/g)) aliases.add(alias[1]);
    if (aliases.has(owner) || /^mirrorList\s*\[/.test(owner)) options = MIRROR_COMPLETIONS;
  }
  if (!options) return null;
  return { from: context.pos - match[2].length, options, validFor: /^[\w$]*$/ };
}

export function createCodeEditor({ api, onStart, onStop, onRun, onComplete }) {
  const panel = document.getElementById('script-panel');
  const toggleButton = document.getElementById('toggle-script');
  const status = document.getElementById('script-status');
  let panelControls;

  function showStatus(message, error = false) {
    status.textContent = message;
    status.classList.toggle('script-error', error);
  }

  const runner = createSimulationRunner(api, {
    onStart,
    onStop,
    onComplete,
    onStateChange(running, phase) {
      toggleButton.textContent = running ? 'Stop' : 'Run';
      toggleButton.title = running ? 'Stop simulation (Ctrl / Cmd + Enter or Escape in editor)' : 'Run code (Ctrl / Cmd + Enter)';
      toggleButton.disabled = false;
      panel.dataset.running = String(running);
      showStatus(phase === 'starting' ? 'Starting sandbox…' : phase === 'complete' ? 'Day complete' : running ? 'Running' : 'Stopped');
    },
    onError(error) {
      panelControls?.setCollapsed(false);
      const location = error?.line ? ' (line ' + error.line + (error.column ? ', column ' + error.column : '') + ')' : '';
      showStatus(`${error?.name || 'Error'}${location}: ${error?.message || String(error)}`, true);
      console.error('updateMirrors:', error);
    },
  });

  const mirrorApi = Object.fromEntries(MIRROR_COMPLETIONS.filter(option => option.type === 'method').map(option => [option.label, () => {}]));
  const editor = new EditorView({
    parent: document.getElementById('code-editor'),
    doc: DEFAULT_CODE,
    extensions: [
      basicSetup,
      javascript(),
      oneDark,
      EditorView.lineWrapping,
      javascriptLanguage.data.of({ autocomplete: scopeCompletionSource({
        mirrorList: [{ id: '', pos: { x: 0, y: 0, z: 0 }, azimuth: 0, elevation: Math.PI / 2, ...mirrorApi }],
        sunData: Object.fromEntries(SUN_COMPLETIONS.map(option => [option.label, 0])),
        receiverTargetPos: { x: 0, y: 0, z: 0 },
        Math, THREE, console: Object.fromEntries(CONSOLE_METHODS.map(name => [name, () => {}])),
      }) }),
      javascriptLanguage.data.of({ autocomplete: mirrorCompletionSource }),
      EditorView.contentAttributes.of({ 'aria-label': 'JavaScript mirror control code', spellcheck: 'false' }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13px', backgroundColor: '#0d1720' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "Liberation Mono", monospace' },
        '.cm-content': { padding: '12px 0' },
        '.cm-gutters': { backgroundColor: '#101d27', color: '#617b89', border: 'none' },
      }, { dark: true }),
      EditorView.updateListener.of(update => {
        if (update.docChanged) showStatus(runner.isRunning() ? 'Running — edits apply on the next run' : 'Ready');
      }),
    ],
  });

  panelControls = createEditorPanel(panel, () => editor.requestMeasure());

  // Capture before basicSetup's Mod-Enter binding can insert a blank line.
  function handleEditorKey(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      toggleSimulation();
    } else if (event.key === 'Escape' && runner.isRunning()) {
      event.preventDefault();
      event.stopPropagation();
      runner.stop();
    }
  }
  editor.dom.addEventListener('keydown', handleEditorKey, true);

  function run() {
    onRun?.();
    return runner.run(editor.state.doc.toString());
  }

  function toggleSimulation() {
    if (runner.isRunning()) runner.stop();
    else run();
  }

  toggleButton.addEventListener('click', toggleSimulation);
  toggleButton.disabled = false;
  showStatus('Ready');

  return {
    view: editor,
    tick: deltaTime => runner.tick(deltaTime),
    sunChanged: () => runner.sunChanged(),
    stop: () => runner.stop(),
    isRunning: () => runner.isRunning(),
    getTime: () => runner.getTime(),
    getCode: () => editor.state.doc.toString(),
    setCode(source) {
      if (typeof source !== 'string') throw new TypeError('Mirror code must be a string.');
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: source } });
    },
    run,
    destroy() {
      runner.stop();
      editor.dom.removeEventListener('keydown', handleEditorKey, true);
      toggleButton.removeEventListener('click', toggleSimulation);
      panelControls.destroy();
      editor.destroy();
      toggleButton.disabled = true;
    },
  };
}
