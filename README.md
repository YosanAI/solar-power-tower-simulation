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
