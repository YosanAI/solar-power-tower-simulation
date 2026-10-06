# Solar power tower

A vanilla JavaScript / Three.js scene with a desert landscape, rigged heliostats, reflective mirrors and two sun-position sliders.

Requires Node.js **20.19+ or 22.12+**.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to orbit, right-drag to pan, and scroll or pinch to zoom.

```sh
npm run build    # Production files in dist/
npm run preview  # Preview the production build
```

`src/app/` assembles the scene and handles controls and cleanup. `src/scene/` contains the landscape, materials, atmosphere, reflections and heliostats; `src/scene/site/` contains the tower, power block, roads and pipework. `src/utils/` holds shared geometry and math helpers. Scene dimensions and defaults live in `src/scene/config.js`.

The sun sliders update lighting and reflections without moving the mirrors. Rig access remains available for integration:

```js
const heliostat = window.solarScene.getHeliostat('H-0001');
heliostat.setAzimuth(Math.PI / 3);
heliostat.setAltitude(Math.PI / 4);
```

Rig angles are radians; +Y is up and azimuth zero points toward +Z. Mirror reflections use four fixed environment probes, so nearby-object parallax is approximate. Three.js stays pinned to the original scene's version, `0.180.0`.
