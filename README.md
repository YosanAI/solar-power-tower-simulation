# Solar power tower

A vanilla JavaScript / Three.js scene with a desert landscape, rigged heliostats, reflective mirrors, a time-of-day slider and manual sun-position sliders.

Requires Node.js **20.19+ or 22.12+**.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to orbit, right-drag to pan, and scroll or pinch to zoom.

```sh
npm test         # Solar position, optics, energy integration and controller checks
npm run build    # Production files in dist/
npm run preview  # Preview the production build
```

`src/app/` assembles the scene and handles controls and cleanup. `src/scene/` contains the landscape, materials, atmosphere, reflections and heliostats; `src/scene/site/` contains the tower, power block, roads and pipework. `src/utils/` holds shared geometry and math helpers. Scene dimensions and defaults live in `src/scene/config.js`.

All scene settings are in the top-right **dat.gui** panel. Its sun controls provide local solar time, azimuth and elevation. [SunCalc 2.1.1](https://github.com/mourner/suncalc#reference) supplies sun position, sunrise, sunset and solar noon. The default reference site is **35°N, 0°E on March 20, 2026**. Solar noon is mapped to 12:00, so the browser's timezone does not change the result. Sun angle controls use radians; the adapter maps SunCalc's north-based degrees to the scene and applies its −10° to 89° sun-elevation limits.

The time slider includes up to **30 minutes before sunrise and after sunset**, rounded inward to whole minutes and limited to the supported sun elevation. The default range is **05:27–18:34**, with sunrise at **05:56** and sunset at **18:04**; the scene opens at **10:00**. The GUI's Reference day folder shows the date, coordinates and daylight times.

Moving the time slider updates the sun angles, lighting, shadows and reflections. Manual sun angles use 0.001-radian increments; adjusting either angle marks the clock as **Manual**. The reference date, coordinates, margin and initial time live in `CONFIG.solarDay` and `CONFIG.sunTimeMinutes`. Reference days without sunrise or sunset are rejected with a clear error.

Every heliostat starts with **azimuth 0 and elevation π/2 radians**. The sun controls change lighting and reflections; mirror angles change through the controller APIs. Browser-console access remains available:

```js
const heliostat = window.solarScene.getHeliostat('H-0001');
heliostat.setAzimuth(Math.PI / 3);
heliostat.setElevation(Math.PI / 4);
```

Rig angles are radians; +Y is up and azimuth zero points toward +Z. Mirror reflections use four fixed environment probes, so nearby-object parallax is approximate. Three.js stays pinned to the original scene's version, `0.180.0`.

## Receiver yield

The top-left display shows accumulated **MWh of thermal energy** for the simulated day, with instantaneous receiver power in **MW** below. The scene contains **2,045 dual-pane mirrors**, each with **15.18 m²** of reflecting glass. The score resets after the first successful sunrise callback of a new Run, accumulates during the 12-second playback, and retains its final or partial value after completion, Stop or an error. Sun scrubbing and mirror edits while stopped update power without adding energy.

Energy integrates power over the reference day's actual solar hours, using midpoint samples at most one solar minute apart. Between controller responses, mirrors retain their committed poses while the sun moves; delayed commands cannot earn energy retroactively. A manual sun edit during playback holds that sun position until automatic playback resumes. Browser background time is excluded by the existing visible-frame clock.

The model uses [Ineichen/Perez clear-sky DNI](https://pvlib-python.readthedocs.io/en/stable/_modules/pvlib/clearsky.html), the front-face incidence cosine and geometric reflection. A finite Gaussian beam approximates the flat panes' projected footprint, the solar disk and doubled mirror slope error. Capture falls gradually with the beam's offset from the receiver; beyond the receiver silhouette plus three beam standard deviations it becomes exactly zero. The two-pane gap adds footprint width without reflecting area. A projected rectangle approximates the existing cylindrical absorber, **12.76 m across and 18.1 m tall**, at **139.3 m** height.

[SAM's heliostat-field guidance](https://samrepo.nlr.gov/help/iph_mspt_heliostat_field.html) informs the optical factors. Defaults in `CONFIG.yield` are 0.923 reflectivity, 0.97 cleanliness, 0.93 field-average shading/blocking efficiency and 0.94 absorber absorptance, plus range-dependent atmospheric transmission. Surface slope error is 1.5 mrad, tracking spread 1 mrad and solar angular radius 4.65 mrad. The clear-sky atmosphere uses Linke turbidity 3 at sea level. These are engineering assumptions: no measured weather, individual-mirror occlusion, thermal receiver losses or power-cycle conversion is modeled. The result estimates absorbed solar heat, not generated electricity.

In the configuration panel, **Debug → Show rays** is off by default. Enable it for yellow incidence segments, red reflected segments and cyan mirror normals. Each reflected segment has exactly the mirror-center-to-receiver-center length, including misses. Diagnostics update on sun and mirror changes, use three batched draws, and stay out of reflection probes and shadows.

The black receiver absorber glows as instantaneous absorbed power rises, changing from a faint warm sheen to a bright warm-white surface with a soft corona. The halo follows the receiver's projected shape as the camera moves, shimmers subtly during simulation or camera movement, and extinguishes at zero input. A stationary scene stays idle. Brightness is a visual indication of received power, with a 20 MW reference in `CONFIG.receiverGlow.fullPowerWatts`; it does not change the yield model or calculate receiver temperature. The bright surface appears in mirror reflections; the camera-facing halo stays out of reflection probes and shadows.

Console APIs include `solarScene.getYieldState()`, `getShowRays()` and `setShowRays(true)`. `getYieldState()` provides raw `energyWh`/`powerWatts`, display `energyMWh`/`powerMW`, `peakPowerMW`, `idealEnergyMWh`, `efficiencyPercent`, capture fraction, contributing mirrors and DNI. Optical calculations use the reflecting face's world position (`getMirrorCenter()`), including its offset from the controller's rotation-pivot position.

## Completed-day results

A successful sunset callback opens a results screen highlighting the **MWh energy score** and **tracking efficiency**, with the day's **peak power in MW**, a five-star rating and the **session high score**. Close it with ×, **Back to field**, Escape or the backdrop; **Run again** starts the current controller code. Early Stop, compilation failures and runtime errors do not show results or update the record.

Tracking efficiency compares accumulated receiver heat with the same field aimed ideally at the receiver under the same sun conditions. The benchmark uses the existing optical model, including mirror dimensions and losses; a cached five-minute reference curve keeps its calculation out of every frame. Actual energy and peak power retain the existing one-minute integration resolution. Manual sun intervals compare with ideal tracking under that manual sun. Stars use the displayed efficiency: zero energy gets no stars, positive energy gets one, and 25%, 50%, 75% and 90% earn two through five stars.

Only a strictly higher completed-day MWh score earns **New high score**; lower scores and ties retain the record. Records live in memory for the current app instance and reset on reload or closing the app. Results are a snapshot, so later sun and mirror edits do not alter a completed day's statistics.

## Embedded mirror controller

The lower-left JavaScript editor includes parameter hints written as JavaScript comments and a commented example:

```js
function updateMirrors(mirrorList /* Mirror[] */, sunData /* {azimuth, elevation} */, receiverTargetPos /* {x, y, z} */) {
  // Angles are radians. mirror.pos is {x, y, z}.
  // receiverTargetPos is the tower receiver position.
  // Uncomment to try the example.
  /*
  for (const mirror of mirrorList) {
    const azimuth = mirror.getCurrentAzimuth() + 0.03;
    mirror.setAzimuth(azimuth);
    mirror.setElevation(Math.sin(azimuth));
  }
  */
}
```

Click **Run**, or press **Ctrl/Cmd + Enter** in the editor, to compile the code once and run sunrise to sunset in **12 seconds**. The duration is fixed in `DAY_DURATION_SECONDS`, with no duration setting in the UI. The button becomes **Stop**; pressing it, Ctrl/Cmd + Enter again, or Escape terminates the worker and discards pending commands. A successful sunset callback completes the day and restores Run. The sun and mirrors retain their last angles.

Each submitted sun update calls the controller with:

```js
mirrorList = [{
  id: 'H-0001',
  pos: { x: 12, y: 2.66, z: 54 }, // Mirror position; illustrative coordinates.
  azimuth: 0,
  elevation: Math.PI / 2,
  // setAzimuth(rad), setElevation(rad),
  // setPose({ azimuth, elevation }), reset(),
  // getCurrentAzimuth(), getCurrentElevation()
}];

sunData = {
  azimuth: 0, elevation: 0, // Sun angles in radians.
  timeMinutes: 360,                      // Local solar minutes; 360 = 06:00.
  elapsedTime: 0, deltaTime: 0,           // Visible simulation seconds.
};
receiverTargetPos = { x: 0, y: 139.3, z: 0 };
```

`mirror.pos` is the mirror position: `{ x: number, y: number, z: number }`. `receiverTargetPos` is the fixed tower receiver position with the same `{ x, y, z }` structure. Mirror and sun angles use radians. The mirror API uses **elevation only**.

| Mirror member | Meaning |
| --- | --- |
| `id` | Stable string ID, such as `'H-0001'`. |
| `pos` | Mirror position `{ x, y, z }`, with numeric coordinates. |
| `azimuth`, `elevation` | Current angles in radians. |
| `setAzimuth(angle)` | Set azimuth to a finite radian value. |
| `setElevation(angle)` | Set elevation, clamped to `0…Math.PI / 2`. |
| `setPose({ azimuth, elevation })` | Set either or both angles in one call. |
| `getCurrentAzimuth()`, `getCurrentElevation()` | Read the current angles, including changes queued in this callback. |
| `reset()` | Restore azimuth `0`, elevation `Math.PI / 2`. |

`sunData.timeMinutes` is omitted for a manual azimuth/elevation combination that has no selected solar time. The angles and elapsed/delta timing remain available on that callback.

Each mirror exposes its own API directly in the callback. For example:

```js
function updateMirrors(mirrorList, sunData, receiverTargetPos) {
  for (const mirror of mirrorList) {
    const azimuth = mirror.getCurrentAzimuth() + 0.03;
    mirror.setAzimuth(azimuth);
    mirror.setElevation(Math.sin(azimuth));
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
| Editor markup in `index.html`, editor rules in `styles.css` | `index.html`, `src/editor/editor.css` | Bottom-left translucent panel, border/shadow, header, green Run/red Stop, chevron, resize handle, API footer and live error/status colors. Default 480×420 px with viewport limits; compact phone/short-screen references preserve space for code and the dat.gui panel. |
| `src/simulation.js` | `src/editor/simulation.js` | Compile-once worker lifecycle, first-success start, one pending callback, backpressure, watchdogs, stale-response rejection and cancellation. Replaces radar/gun frames with mirror snapshots, sun and receiver input; adds fixed 12-second sunrise-to-sunset playback using visible elapsed time. |
| `src/gun-sandbox.js` | `src/editor/mirror-sandbox.js` | QuickJS isolation, captured intrinsics, normal/async function validation, Promise draining, source diagnostics and atomic successful commands. Replaces global gun functions with per-mirror APIs and batches commands inside the guest. |
| `src/sandbox-globals.js` | `src/editor/sandbox-globals.js` | Console compatibility/quotas, `performance.now()`, standard built-ins and local AbortController/AbortSignal support for THREE initialization. |
| `src/sandbox.worker.js`, `src/sandbox-worker-host.js` | Matching files in `src/editor/` | Bundled QuickJS/WASM, full installed THREE source and init/frame/error dispatch. No runtime CDN. |
| `src/sandbox-limits.js` | `src/editor/sandbox-limits.js` | Bounded source, heap, stack, execution, jobs and logs; increased full-field budgets below. Host commands are additionally validated by `src/app/mirrorCommands.js`. |
| `src/scene-gui.js` | `src/app/sceneGui.js` | dat.gui with width 280, manual mounting, top close control and open Sun position folder. Contains all scene settings: solar time, sun azimuth/elevation and reference-day information. |

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
