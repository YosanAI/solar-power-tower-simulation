export function seededRandom(seed = 1402) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;

    let mixedSeed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    mixedSeed =
      (mixedSeed + Math.imul(mixedSeed ^ (mixedSeed >>> 7), 61 | mixedSeed)) ^
      mixedSeed;

    return ((mixedSeed ^ (mixedSeed >>> 14)) >>> 0) / 4294967296;
  };
}
