# Solar power tower

A vanilla JavaScript / Three.js scene with a desert landscape, rigged heliostats, reflective mirrors, a time-of-day slider and manual sun-position sliders.

Requires Node.js **20.19+ or 22.12+**.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to orbit, right-drag to pan, and scroll or pinch to zoom.

```sh
npm test         # Solar position and daylight-range checks
npm run build    # Production files in dist/
npm run preview  # Preview the production build
```

`src/app/` assembles the scene and handles controls and cleanup. `src/scene/` contains the landscape, materials, atmosphere, reflections and heliostats; `src/scene/site/` contains the tower, power block, roads and pipework. `src/utils/` holds shared geometry and math helpers. Scene dimensions and defaults live in `src/scene/config.js`.

The time-of-day slider uses [SunCalc 2.1.1](https://github.com/mourner/suncalc#reference) for sun position, sunrise, sunset and solar noon. The default reference site is **35°N, 0°E on March 20, 2026**. The slider displays **local solar time**: SunCalc's solar-noon instant is mapped to 12:00, so the browser's timezone does not change the result. The adapter converts SunCalc's north-based azimuth in degrees to the scene's south-based azimuth and applies the renderer's −10° to 89° altitude limits; it contains no custom solar-position equations.

The range includes up to **30 minutes before sunrise and after sunset**, rounded inward to whole minutes. If a larger configured margin would go below −10°, the adapter moves that endpoint inward using SunCalc's altitude values. The default range is **05:27–18:34**, with sunrise at **05:56** and sunset at **18:04**; the scene opens at **10:00**.

Moving the time slider updates the angle sliders, lighting, shadows and reflections. The manual angle sliders remain available at 0.1° increments; adjusting either angle (including through the scene API) marks the time readout as **Manual** until the time slider is moved again. The reference date, latitude, longitude, margin and initial time live in `CONFIG.solarDay` and `CONFIG.sunTimeMinutes`. Reference days without sunrise or sunset are rejected with a clear error.

Every heliostat starts with **azimuth 0 and altitude π/2 radians**, pointing its mirror normal straight up. The sun sliders update lighting and reflections without moving the mirrors. Rig access remains available for integration:

```js
const heliostat = window.solarScene.getHeliostat('H-0001');
heliostat.setAzimuth(Math.PI / 3);
heliostat.setAltitude(Math.PI / 4);
```

Rig angles are radians; +Y is up and azimuth zero points toward +Z. Mirror reflections use four fixed environment probes, so nearby-object parallax is approximate. Three.js stays pinned to the original scene's version, `0.180.0`.

## Embedded mirror controller

The lower-left JavaScript editor starts with an empty controller and a commented API example:

```js
function updateMirrors(mirrorList, sunData, receiverTargetPos) {
  // Write your controller here.
}
```

Click **Run**, or press **Ctrl/Cmd + Enter** in the editor, to compile the code once and start a sunrise-to-sunset day. The same button becomes **Stop**; pressing it, Ctrl/Cmd + Enter again, or Escape in the editor terminates the worker and discards pending commands. A successful final sunset callback completes the day and restores Run. The sun and mirrors retain their last poses. The temporary **dat.gui** panel at the top right sets **Day duration (s)** from **3 to 60 seconds**, default **20**. A duration change is used on the next Run.

Each submitted sun update calls the controller with:

```js
mirrorList = [{
  id: 'H-0001',
  pos: { x: 12, y: 2.66, z: 54 }, // Illustrative x/z; real world axis intersection.
  azimuth: 0,
  elevation: Math.PI / 2,
  altitude: Math.PI / 2,           // Alias for elevation.
  // setAzimuth(rad), setElevation(rad), setAltitude(rad),
  // setPose({ azimuth, elevation }), reset(),
  // getCurrentAzimuth(), getCurrentElevation(), getCurrentAltitude()
}];

sunData = {
  azimuth: 0, elevation: 0, altitude: 0, // All angles are radians.
  timeMinutes: 360,                      // Local solar minutes; 360 = 06:00.
  elapsedTime: 0, deltaTime: 0,           // Visible simulation seconds.
};
receiverTargetPos = { x: 0, y: 139.3, z: 0 };
```

`pos` is the real world-space intersection of the azimuth and elevation axes, not the offset glass surface. The receiver target is the fixed absorber center/aim point in `CONFIG.receiverCenter`; there is no separate receiver sensor mesh. The scene uses **Y up**, **+Z for zero azimuth**, and **+X for positive azimuth**. A mirror normal is `(sin(azimuth) cos(elevation), sin(elevation), cos(azimuth) cos(elevation))`. Mirror elevation is clamped to `0…Math.PI / 2`; finite azimuth values are accepted. All existing console rig setters remain available.

`sunData.timeMinutes` is omitted for a manual azimuth/elevation combination that has no selected solar time. The angles and elapsed/delta timing remain available on that callback.

Each mirror exposes its own API directly in the callback. For example:

```js
function updateMirrors(mirrorList, sunData, receiverTargetPos) {
  for (const mirror of mirrorList) {
    mirror.setPose({ azimuth: Math.PI / 4, elevation: Math.PI / 3 });
  }
}
```

Data and API objects live in the isolated guest VM. Mirror IDs and positions are read-only guest copies; cached mirror references refresh their angles on later callbacks. Per-mirror getters include successfully queued changes within the current callback. Host updates are applied **only after the complete callback and its local Promise jobs succeed**. Every batch is validated first, final poses are committed per affected rig, and instance buffers/shadows are invalidated once for the whole field. Failed callbacks apply no partial mirror changes. Busy workers receive the latest time and data on their next callback, with accumulated `deltaTime`, rather than an unbounded queue. The visible day clock starts after the first callback succeeds and pauses while the tab is hidden. Manual sun edits during a run receive a callback before automatic playback resumes.

The editor has JavaScript highlighting, line numbers, completion for Math, THREE, console and the mirror/sun/target API, source-line errors, and a short API reference. Drag the top-right handle to resize, or focus it and use arrows (10 px) or Shift+arrows (40 px). The chevron collapses the panel while leaving Run/Stop available; code and dimensions stay mounted, and running scripts continue. Errors expand the panel. Edits made during a run apply on the next Run. Top-level variables persist within a run and reset at restart. Code and size are preserved in memory, not across page reloads.

The actual installed Three.js core is loaded into QuickJS, so `THREE.Vector3`, matrices, geometry, colors and other CPU-only helpers work without imports. Local async/await and Promise jobs are supported. `console.log/info/warn/error/debug`, `dir/table/assert`, counters, timers, trace and group methods forward bounded text to the browser developer Console with an `[updateMirrors]` prefix. There is no additional on-screen console. Logs emitted before an error are preserved.

QuickJS runs in an independently stoppable Web Worker with no page/DOM, live scene, storage, network, arbitrary imports, OS/filesystem, browser timers, GPU, audio or device bridge. `eval`, `Function` and THREE constructors remain in that guest heap. Commands are queued inside QuickJS and transferred as one bounded JSON batch after success; serialization shares the callback deadline. Snapshot transport sends changed values internally while retaining the full public callback data.

## What was copied from the reference editor

The reference is [YosanAI/cram-gun-simulater](https://github.com/YosanAI/cram-gun-simulater) at commit [`b5708bb`](https://github.com/YosanAI/cram-gun-simulater/tree/b5708bbf655f659dcd1a0ddef5aec3a7efc705c6). These components were copied or adapted:

| Reference source | Solar implementation | Preserved behavior and adaptations |
| --- | --- | --- |
| `src/code-editor.js` | `src/editor/code-editor.js` | CodeMirror basic setup, JavaScript, One Dark, 13 px monospace text, dark gutters, shortcuts, completions, edit-next-run behavior, statuses, error expansion and cleanup. Title, completion data, signature and API reference now describe mirrors. Shortcut events are captured before CodeMirror's default Ctrl/Cmd+Enter binding. |
| `src/editor-panel.js` | `src/editor/editor-panel.js` | Pointer capture resize, keyboard resize, viewport limits, collapse preserving code/size, ResizeObserver, accessibility and listener cleanup. |
| Editor markup in `index.html`, editor rules in `styles.css` | `index.html`, `src/editor/editor.css` | Bottom-left translucent panel, border/shadow, header, green Run/red Stop, chevron, resize handle, API footer and live error/status colors. Default 480×420 px with viewport limits; phone/short-screen references are compacted to leave room for code and existing sun controls. |
| `src/simulation.js` | `src/editor/simulation.js` | Compile-once worker lifecycle, first-success start, one pending callback, backpressure, watchdogs, stale-response rejection and cancellation. Replaces radar/gun frames with full mirror snapshots, sun and receiver input; adds finite sunrise-to-sunset playback and duration capture. Uses visible elapsed seconds for the configured duration. |
| `src/gun-sandbox.js` | `src/editor/mirror-sandbox.js` | QuickJS isolation, captured intrinsics, normal/async function validation, Promise draining, source diagnostics and atomic successful commands. Replaces global gun functions with per-mirror APIs and batches commands inside the guest. |
| `src/sandbox-globals.js` | `src/editor/sandbox-globals.js` | Console compatibility/quotas, `performance.now()`, standard built-ins and local AbortController/AbortSignal support for THREE initialization. |
| `src/sandbox.worker.js`, `src/sandbox-worker-host.js` | Matching files in `src/editor/` | Bundled QuickJS/WASM, full installed THREE source and init/frame/error dispatch. No runtime CDN. |
| `src/sandbox-limits.js` | `src/editor/sandbox-limits.js` | Bounded source, heap, stack, execution, jobs and logs; increased full-field budgets below. Host commands are additionally validated by `src/app/mirrorCommands.js`. |
| `src/scene-gui.js` | `src/app/sceneGui.js` | dat.gui with width 280, manual mounting, top close control and an open folder. Replaces gun/swarm settings with the temporary 3–60 second day-duration control. |

| Resource | Reference | Mirror editor |
| --- | ---: | ---: |
| Guest heap | 128 MiB | 256 MiB |
| Guest stack | 1 MiB | 2 MiB |
| Compilation / callback execution | 500 ms | 1,000 ms |
| Commands per callback | 1,024 | 65,536 |
| Promise jobs per callback | 1,024 | 4,096 |
| Startup watchdog | 10 s | 15 s |
| Callback response watchdog | 2 s | 5 s |
| Mirrors per callback | One gun | Up to 10,000 mirrors; current field has 2,045 |

The source limit stays **262,144 characters**, trusted THREE initialization stays **5 seconds**, and console limits remain **64 entries per initialization/callback, 200 per second, 8,000 characters per entry, 32 arguments per call**. The VM is terminated on a runaway loop, exhausted heap, unsettled Promise, command overflow or worker failure. Validation, sandbox, real-worker and playback tests include all 2,045 mirrors and more than 4,000 angle commands per callback.

Continuous sun updates now schedule environment refreshes without repeatedly postponing the deadline, and finish each reflection-sector cycle before starting another. This keeps the existing sky/reflection system updating during a day instead of waiting until playback stops.
