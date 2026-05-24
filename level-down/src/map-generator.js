// Procedural map generator for outdoor-style maps.
//
// Output matches the format used by map.js: an array of strings, each
// row a fixed-width line of map characters (see the legend in map.js
// for what each character means).
//
// The 2-cell minimum walking-path rule is satisfied structurally:
// obstacles are placed only in 2×2 blocks aligned to a 2×2 macro grid
// over the interior of the map. Each macro cell is independently
// either fully walkable or fully an obstacle block. That means any
// two non-adjacent obstacle blocks have at least one walkable macro
// cell (= 2 cells) between them, so every walkable channel is at
// least 2 cells wide.
//
// Usage from the browser console:
//
//   const g = await import('./src/map-generator.js');
//   const m = g.generateMap({ monsters: 10, loot: 5, obstacleDensity: 0.2 });
//   console.log(g.formatMapForCode(m, 'MAP_RANDOM'));
//
// Copy the printed text into src/map.js as a new export, then change
// `export const MAP = MAP_RANDOM` at the bottom of that file.

const DEFAULTS = {
  width: 32,
  height: 20,
  monsters: 6,
  loot: 4,
  obstacleDensity: 0.12,
  obstacleWeights: { T: 7, B: 3 },      // mostly trees, some bushes
  monsterWeights: { s: 1, g: 1, z: 1, r: 1 }, // equal mix of skeleton / goblin / zombie / rat
  spawnPaddingMacros: 5,                // monsters/loot can't spawn within this
                                        // many macro cells of the player
  random: Math.random,                  // override for deterministic generation
  maxAttempts: 5,                       // retries if reachable fraction is low
  minReachableFraction: 0.7,            // ≥ 70% of non-obstacle macros connected
};

export function generateMap(userOpts = {}) {
  const opts = { ...DEFAULTS, ...userOpts };
  let last = null;
  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    last = tryGenerate(opts);
    if (last.reachableFraction >= opts.minReachableFraction) break;
  }
  return last.grid.map((row) => row.join(''));
}

// Like generateMap but also returns metadata about the attempt
// (reachable fraction, counts placed). Useful for tuning.
export function generateMapWithStats(userOpts = {}) {
  const opts = { ...DEFAULTS, ...userOpts };
  let last = null;
  let attempt = 0;
  for (; attempt < opts.maxAttempts; attempt++) {
    last = tryGenerate(opts);
    if (last.reachableFraction >= opts.minReachableFraction) break;
  }
  return {
    map: last.grid.map((row) => row.join('')),
    reachableFraction: last.reachableFraction,
    monstersPlaced: last.monstersPlaced,
    lootPlaced: last.lootPlaced,
    obstacleMacros: last.obstacleMacros,
    attempts: attempt + 1,
  };
}

function tryGenerate(opts) {
  const {
    width, height, monsters, loot, obstacleDensity,
    obstacleWeights, monsterWeights, spawnPaddingMacros, random,
  } = opts;

  // Start with grass everywhere.
  const grid = [];
  for (let y = 0; y < height; y++) {
    grid.push(new Array(width).fill('.'));
  }

  // Tree border seals the map edges.
  for (let x = 0; x < width; x++) { grid[0][x] = 'T'; grid[height - 1][x] = 'T'; }
  for (let y = 0; y < height; y++) { grid[y][0] = 'T'; grid[y][width - 1] = 'T'; }

  // Macro grid over the interior. A macro cell at (mx, my) covers the
  // 2×2 block of grid cells starting at (1 + 2*mx, 1 + 2*my).
  const mxMax = Math.floor((width - 2) / 2);
  const myMax = Math.floor((height - 2) / 2);
  const macroOrigin = (mx, my) => [1 + 2 * mx, 1 + 2 * my];

  // Place obstacle blocks. Each macro cell flips obstacle with
  // probability `obstacleDensity`; if so, the whole 2×2 is filled with
  // a single weighted-random obstacle char.
  const obstacle = Array.from({ length: myMax }, () => new Array(mxMax).fill(false));
  let obstacleMacros = 0;
  for (let my = 0; my < myMax; my++) {
    for (let mx = 0; mx < mxMax; mx++) {
      if (random() < obstacleDensity) {
        const ch = weightedPick(obstacleWeights, random);
        obstacle[my][mx] = true;
        obstacleMacros++;
        const [bx, by] = macroOrigin(mx, my);
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            grid[by + dy][bx + dx] = ch;
          }
        }
      }
    }
  }

  // Spawn the player near the center. Spiral outward in macro-cell
  // rings until we find a walkable macro cell.
  const cx = Math.floor(mxMax / 2);
  const cy = Math.floor(myMax / 2);
  let spawnMx = cx, spawnMy = cy;
  outer: for (let r = 0; r <= Math.max(mxMax, myMax); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const mx = cx + dx, my = cy + dy;
        if (mx < 0 || mx >= mxMax || my < 0 || my >= myMax) continue;
        if (!obstacle[my][mx]) {
          spawnMx = mx; spawnMy = my;
          break outer;
        }
      }
    }
  }

  // Flood-fill from the spawn macro to find reachable macro cells.
  const reachable = Array.from({ length: myMax }, () => new Array(mxMax).fill(false));
  reachable[spawnMy][spawnMx] = true;
  const queue = [[spawnMx, spawnMy]];
  let reachableCount = 1;
  while (queue.length > 0) {
    const [mx, my] = queue.shift();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [ddx, ddy] of dirs) {
      const nx = mx + ddx, ny = my + ddy;
      if (nx < 0 || nx >= mxMax || ny < 0 || ny >= myMax) continue;
      if (obstacle[ny][nx] || reachable[ny][nx]) continue;
      reachable[ny][nx] = true;
      reachableCount++;
      queue.push([nx, ny]);
    }
  }
  const totalWalkable = mxMax * myMax - obstacleMacros;
  const reachableFraction = totalWalkable > 0 ? reachableCount / totalWalkable : 0;

  // Place the player marker on the top-left cell of the spawn macro.
  {
    const [bx, by] = macroOrigin(spawnMx, spawnMy);
    grid[by][bx] = 'P';
  }

  // Collect candidate macros: reachable, not the spawn, and at least
  // `spawnPaddingMacros` macro cells away (in Chebyshev distance).
  const candidates = [];
  for (let my = 0; my < myMax; my++) {
    for (let mx = 0; mx < mxMax; mx++) {
      if (!reachable[my][mx]) continue;
      if (Math.max(Math.abs(mx - spawnMx), Math.abs(my - spawnMy)) < spawnPaddingMacros) continue;
      candidates.push([mx, my]);
    }
  }
  shuffleInPlace(candidates, random);

  // Place monsters and loot in random walkable macros. We pick one
  // sub-cell within the 2×2 macro so the spawn isn't always pinned
  // to the top-left.
  const monstersPlaced = placeItems(
    grid, candidates, monsters, random,
    (g, x, y) => { g[y][x] = weightedPick(monsterWeights, random); },
    macroOrigin,
  );
  const lootPlaced = placeItems(
    grid, candidates, loot, random,
    (g, x, y) => { g[y][x] = 'c'; },
    macroOrigin,
  );

  return { grid, reachableFraction, monstersPlaced, lootPlaced, obstacleMacros };
}

function placeItems(grid, candidates, count, random, setter, macroOrigin) {
  const n = Math.min(count, candidates.length);
  for (let i = 0; i < n; i++) {
    const [mx, my] = candidates.pop();
    const [bx, by] = macroOrigin(mx, my);
    const dx = Math.floor(random() * 2);
    const dy = Math.floor(random() * 2);
    setter(grid, bx + dx, by + dy);
  }
  return n;
}

function weightedPick(weights, random) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = random() * total;
  for (const [ch, w] of entries) {
    r -= w;
    if (r <= 0) return ch;
  }
  return entries[0][0];
}

function shuffleInPlace(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Format a map array as paste-ready JavaScript. Drop the result into
// src/map.js next to MAP_MEADOW etc., then point `export const MAP`
// at the new constant.
export function formatMapForCode(map, name = 'MAP_GENERATED') {
  const lines = map.map((row) => `  "${row}",`).join('\n');
  return `export const ${name} = [\n${lines}\n];`;
}

// Mulberry32 — small, fast, good enough for reproducible generation.
// Pass the result as the `random` option to generate the same map
// twice from the same seed.
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
