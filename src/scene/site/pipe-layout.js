/** Architectural exterior pipe centrelines in metres. The endpoints penetrate
 * equipment envelopes or connect to a named header; no operational model.
 * Parallel rack lanes are authored explicitly rather than free-form splines.
 */
export const PIPE_ROUTES = [
  {
    name: 'Receiver return to hot tank',
    radius: 0.4,
    band: 'hotBand',
    points: [
      [4.8, 126.6, 1.2],
      [6.12, 126.6, 1.2],
      [8.82, 6.4, 1.2],
      [28, 6.4, 1.2],
      [28, 6.4, 48],
      [62.5, 6.4, 48],
      [62.5, 6.4, 65.1],
    ],
  },
  {
    name: 'Cold tank to receiver supply',
    radius: 0.34,
    band: 'coldBand',
    points: [
      [97.5, 7.8, 65.1],
      [97.5, 7.8, 44],
      [31.6, 7.8, 44],
      [31.6, 7.8, -1.2],
      [8.82, 7.8, -1.2],
      [6.12, 127.9, -1.2],
      [4.8, 127.9, -1.2],
    ],
  },
  {
    name: 'Hot tank to steam generator',
    radius: 0.38,
    band: 'hotBand',
    points: [
      [74.5, 6.4, 77],
      [79.7, 6.4, 77],
      [79.7, 6.4, 103],
      [144.5, 6.4, 103],
      [144.5, 6.4, 72],
      [132.65, 6.4, 72],
    ],
  },
  {
    name: 'Steam generator to cold tank',
    radius: 0.32,
    band: 'coldBand',
    points: [
      [132.65, 7.8, 91],
      [141, 7.8, 91],
      [141, 7.8, 100],
      [97.5, 7.8, 100],
      [97.5, 7.8, 88.9],
    ],
  },
  {
    name: 'Main steam to turbine hall',
    radius: 0.49,
    points: [
      [128.4, 11.8, 81.5],
      [119, 11.8, 81.5],
      [119, 11.8, 109],
      [102, 11.8, 109],
      [102, 11.8, 120.0],
    ],
  },
  {
    name: 'Turbine exhaust to condenser header',
    radius: 0.63,
    points: [
      [105.6, 12.8, 138],
      [118, 12.8, 138],
      [118, 12.8, 165],
      [118, 16.3, 165],
      [118, 16.3, 185],
      [44, 16.3, 185],
    ],
  },
  {
    name: 'Condenser condensate return',
    radius: 0.21,
    band: 'coldBand',
    points: [
      [111.3, 10.75, 175],
      [118.5, 10.75, 175],
      [118.5, 3.4, 175],
      [118.5, 3.4, 132],
      [105.6, 3.4, 132],
    ],
  },
];
