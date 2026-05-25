// Procedural map generator for outdoor maps.
//
// Output matches the format used by map.js: an array of strings, one
// per row, all the same width. The scene's placeCell reads each
// character and either draws a ground tile, places a static wall
// (tree / bush / water / house), or spawns an entity (chest, monster,
// player).
//
// Path-tile convention (see scene.js GROUND_TILE_BY_CHAR for the
// full table):
//   The path is a 2D region of "path cells" in the grid. For each
//   path cell we pick a tile based on the DIAGONAL rule: a tile's
//   quadrant is dirt iff the cell diagonally at that corner is also
//   a path cell. The Kenney sheet has tiles for every combination
//   we can produce, so paths automatically get correct edge tiles,
//   single-quadrant outer-corner tiles, and three-quadrant inner-
//   corner tiles where they bend.
//
// Because the diagonal rule needs at least one path diagonal to
// produce any dirt at all, the carver always stamps 2×2 blocks
// rather than single cells. A straight stretch ends up two cells
// wide in the grid, which the tile rule renders as a single visible
// dirt strip with proper grass borders on both sides.
//
// Generation pipeline:
//   1. Grass + tree border.
//   2. Random tree/bush scatter at LOW density (single-tile scatter
//      is fine since A* handles narrow gaps).
//   3. Pick spawn (centre) + several waypoint cells.
//   4. Carve drunkard-walk paths between waypoints, stamping 2×2
//      blocks at every step. Path cells temporarily marked as '-'.
//   5. Convert each path cell's '-' marker to the proper edge /
//      corner tile via the diagonal rule.
//   6. Decoration sprinkle on remaining grass cells.
//   7. Player spawn marker.
//   8. Flood-fill from spawn; place monsters and loot on reachable
//      grass cells (skipping path tiles so the dirt visual stays
//      intact).

const DEFAULTS = {
  width: 36,
  height: 22,
  monsters: 6,
  loot: 4,
  // Tree / bush scatter density. Dropped from earlier ~0.20 because
  // the 2-wide path carving already opens space, and dense single-
  // tile obstacles were slowing combat movement.
  obstacleDensity: 0.10,
  decorDensity: 0.08,
  obstacleWeights: { T: 7, B: 3 },
  monsterWeights: { s: 1, g: 1, z: 1, r: 1 },
  // ',' grass-alt, '*' flowers, 'o' rock patch
  decorWeights: { ',': 14, '*': 5, o: 4 },
  // Waypoints beyond the spawn — each extra one adds a path leg.
  pathWaypoints: 5,
  // Drunkard-walk bias toward the target. Higher = straighter paths.
  pTowardTarget: 0.72,
  spawnPaddingTiles: 5,
  random: Math.random,
  maxAttempts: 5,
  minReachableFraction: 0.80,
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
    attempts: attempt + 1,
  };
}

// ---- Core generation ------------------------------------------------

function tryGenerate(opts) {
  const {
    width, height, monsters, loot,
    obstacleDensity, decorDensity,
    obstacleWeights, monsterWeights, decorWeights,
    pathWaypoints, pTowardTarget, spawnPaddingTiles, random,
  } = opts;

  // 1. Grass fill + tree border.
  const grid = [];
  for (let y = 0; y < height; y++) grid.push(new Array(width).fill('.'));
  for (let x = 0; x < width; x++) { grid[0][x] = 'T'; grid[height - 1][x] = 'T'; }
  for (let y = 0; y < height; y++) { grid[y][0] = 'T'; grid[y][width - 1] = 'T'; }

  // 2. Sparse single-tile obstacle scatter.
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      if (random() < obstacleDensity) {
        grid[y][x] = weightedPick(obstacleWeights, random);
      }
    }
  }

  // 3. Spawn near the centre. Clear a 2×2 around the spawn so the
  //    party has guaranteed elbow room from frame one.
  const spawnX = Math.floor(width / 2);
  const spawnY = Math.floor(height / 2);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = spawnX + dx, ny = spawnY + dy;
      if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1) {
        grid[ny][nx] = '.';
      }
    }
  }

  // 4. Waypoint network. The spawn is the first node; every
  //    additional waypoint connects (via a drunkard-walk path) to
  //    its nearest already-connected node — a spanning-tree layout
  //    that visits every waypoint without backtracking.
  const waypoints = [{ x: spawnX, y: spawnY }];
  for (let i = 0; i < pathWaypoints; i++) {
    waypoints.push({
      x: 3 + Math.floor(random() * (width - 6)),
      y: 3 + Math.floor(random() * (height - 6)),
    });
  }
  const connected = [waypoints[0]];
  const remaining = waypoints.slice(1);
  while (remaining.length > 0) {
    let bestC = 0, bestR = 0, bestD = Infinity;
    for (let i = 0; i < connected.length; i++) {
      for (let j = 0; j < remaining.length; j++) {
        const d = Math.abs(connected[i].x - remaining[j].x)
                + Math.abs(connected[i].y - remaining[j].y);
        if (d < bestD) { bestD = d; bestC = i; bestR = j; }
      }
    }
    carvePath(
      grid,
      connected[bestC].x, connected[bestC].y,
      remaining[bestR].x, remaining[bestR].y,
      width, height, random, pTowardTarget,
    );
    connected.push(remaining[bestR]);
    remaining.splice(bestR, 1);
  }

  // 5. Convert path markers to proper edge / corner tiles.
  applyDirtTiles(grid, width, height);

  // 6. Decoration sprinkle on remaining plain grass. Skipped on
  //    anything else (path tiles, walls, etc.) so the path stays
  //    readable.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] === '.' && random() < decorDensity) {
        grid[y][x] = weightedPick(decorWeights, random);
      }
    }
  }

  // 7. Player spawn marker.
  grid[spawnY][spawnX] = 'P';

  // 8. Reachability flood-fill from spawn.
  const reachable = floodFillReachable(grid, spawnX, spawnY, width, height);

  // 9. Build placement candidates. We avoid path tiles so monsters
  //    and chests don't punch holes in the dirt visual — placement
  //    overwrites the cell char, and the chest/monster tile draws
  //    a plain grass ground underneath itself.
  const candidates = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!reachable[y][x]) continue;
      if (x === spawnX && y === spawnY) continue;
      const cheb = Math.max(Math.abs(x - spawnX), Math.abs(y - spawnY));
      if (cheb < spawnPaddingTiles) continue;
      if (PATH_CHARS.indexOf(grid[y][x]) >= 0) continue;
      if (!GRASSLIKE.has(grid[y][x])) continue;
      candidates.push({ x, y });
    }
  }
  shuffleInPlace(candidates, random);

  const monstersPlaced = placeItems(grid, candidates, monsters, random,
    (g, x, y) => { g[y][x] = weightedPick(monsterWeights, random); });
  const lootPlaced = placeItems(grid, candidates, loot, random,
    (g, x, y) => { g[y][x] = 'c'; });

  // Reachable fraction for the attempt loop.
  let openCount = 0, reachCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isOpenChar(grid[y][x])) {
        openCount++;
        if (reachable[y][x]) reachCount++;
      }
    }
  }
  const reachableFraction = openCount > 0 ? reachCount / openCount : 0;

  return { grid, reachableFraction, monstersPlaced, lootPlaced };
}

// ---- Path carving ---------------------------------------------------

// Drunkard-walk carve from (ax,ay) → (bx,by). At each step the
// position is treated as the top-left of a 2×2 block; all four cells
// of that block get marked as path ('-'). This guarantees the path
// region is at least 2 cells wide everywhere, which is what the
// diagonal tile-pick rule needs to actually produce dirt quadrants.
//
// `pToward` biases each step toward the destination versus a random
// orthogonal wiggle. The step limit is generous (~3× Manhattan
// distance) so even a wandering path reliably reaches its waypoint.
function carvePath(grid, ax, ay, bx, by, width, height, random, pToward) {
  let x = ax, y = ay;
  const limit = (Math.abs(bx - ax) + Math.abs(by - ay)) * 3 + 40;
  for (let step = 0; step < limit; step++) {
    stampPathBlock(grid, x, y, width, height);
    if (x === bx && y === by) break;

    let mx = 0, my = 0;
    if (random() < pToward) {
      const adx = Math.abs(bx - x);
      const ady = Math.abs(by - y);
      if (adx === 0) my = Math.sign(by - y);
      else if (ady === 0) mx = Math.sign(bx - x);
      else if (random() < adx / (adx + ady)) mx = Math.sign(bx - x);
      else my = Math.sign(by - y);
    } else {
      const dir = Math.floor(random() * 4);
      if (dir === 0) mx = 1;
      else if (dir === 1) mx = -1;
      else if (dir === 2) my = 1;
      else my = -1;
    }
    x = Math.max(1, Math.min(width - 2, x + mx));
    y = Math.max(1, Math.min(height - 2, y + my));
  }
}

// Stamps a 2×2 block of '-' (path marker) starting at (x, y),
// clamped so the block never overwrites the outer tree border.
function stampPathBlock(grid, x, y, width, height) {
  for (let dy = 0; dy <= 1; dy++) {
    for (let dx = 0; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx <= 0 || nx >= width - 1 || ny <= 0 || ny >= height - 1) continue;
      grid[ny][nx] = '-';
    }
  }
}

// ---- Tile pick (diagonal rule) --------------------------------------

// For each path cell ('-' marker), pick a tile based on the 2×2
// block rule: a tile's quadrant is dirt iff all four cells of the
// 2×2 block anchored at that corner are also path cells.
//
// Concretely, for the NW quadrant of cell (x, y), the block consists
// of (x-1, y-1), (x, y-1), (x-1, y), (x, y). Since (x, y) is itself
// a path cell when we call this function, we only need to check the
// other three — the N cardinal, the W cardinal, and the NW diagonal.
//
// This is what keeps boundaries clean: any 2×2 block is shared by
// four tiles, and every one of them evaluates the same predicate
// against it, so the dirt-vs-grass split at each quadrant always
// agrees with its neighbours.
//
// Walkability is unchanged — every path-tile char is in PATH_CHARS
// (and not in the wall set) so A* still routes through the path.
function applyDirtTiles(grid, width, height) {
  const isPath = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    // After carving, every path cell is '-'. Other tiles can't be
    // path here because carving comes before placements.
    return grid[y][x] === '-';
  };
  const updates = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] !== '-') continue;
      // 2×2-block rule: quadrant Q is dirt iff every cell of the
      // 2×2 anchored at corner Q is a path cell. We skip the
      // self-check (x, y) because applyDirtTiles only visits cells
      // already known to be path.
      const n = isPath(x,     y - 1);
      const s = isPath(x,     y + 1);
      const e = isPath(x + 1, y    );
      const w = isPath(x - 1, y    );
      const nw = n && w && isPath(x - 1, y - 1);
      const ne = n && e && isPath(x + 1, y - 1);
      const sw = s && w && isPath(x - 1, y + 1);
      const se = s && e && isPath(x + 1, y + 1);
      const tile = pickDirtTile(nw, ne, sw, se);
      if (tile !== '-') updates.push([x, y, tile]);
    }
  }
  for (const [x, y, ch] of updates) grid[y][x] = ch;
}

// Lookup table over the 16 possible quadrant masks. Bit layout:
//   bit 3 = NW, bit 2 = NE, bit 1 = SW, bit 0 = SE
// Returned char matches GROUND_TILE_BY_CHAR in scene.js.
function pickDirtTile(nw, ne, sw, se) {
  const mask = (nw ? 8 : 0) | (ne ? 4 : 0) | (sw ? 2 : 0) | (se ? 1 : 0);
  switch (mask) {
    case 0b0000: return '.';  // no dirt anywhere — render as grass
    case 0b1111: return '-';  // dirt_full
    // Single-corner dirt (outer corners of a path region)
    case 0b1000: return '[';  // NW only
    case 0b0100: return '(';  // NE only
    case 0b0010: return ')';  // SW only
    case 0b0001: return ']';  // SE only
    // Half-side dirt (straight edges)
    case 0b1100: return '^';  // N half
    case 0b0011: return 'v';  // S half
    case 0b1010: return '<';  // W half
    case 0b0101: return '>';  // E half
    // Three-quadrant dirt (inner corners of a bend)
    case 0b0111: return '1';  // NW grass
    case 0b1011: return '2';  // NE grass
    case 0b1110: return '3';  // SE grass
    case 0b1101: return '4';  // SW grass
    // Diagonal-only patterns — unlikely with 2×2 block carving but
    // possible at the elbow of a tight bend. dirt_full is a clean
    // fallback that still draws as path.
    case 0b1001: return '-';  // NW + SE
    case 0b0110: return '-';  // NE + SW
    default:     return '-';
  }
}

// Every char that represents a walkable path tile. Used by placement
// to avoid landing monsters/loot on the path (preserves the visual)
// and by path.js's WALL_CHARS mirror (anything not a wall is open).
const PATH_CHARS = '-<>v^[]()1234';

// Grass / decoration chars that are valid monster/loot landing spots.
// Anything else (path tile, wall, existing spawn) is excluded by
// the placement filter.
const GRASSLIKE = new Set(['.', ',', '*', 'o']);

// ---- Reachability ---------------------------------------------------

function isOpenChar(ch) {
  return 'TBWHR#~'.indexOf(ch) < 0;
}

function floodFillReachable(grid, sx, sy, width, height) {
  const reach = Array.from({ length: height }, () => new Array(width).fill(false));
  if (!isOpenChar(grid[sy][sx])) return reach;
  reach[sy][sx] = true;
  const q = [[sx, sy]];
  while (q.length > 0) {
    const [x, y] = q.shift();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (reach[ny][nx]) continue;
      if (!isOpenChar(grid[ny][nx])) continue;
      reach[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return reach;
}

// ---- helpers --------------------------------------------------------

function placeItems(grid, candidates, count, random, setter) {
  const n = Math.min(count, candidates.length);
  for (let i = 0; i < n; i++) {
    const c = candidates.pop();
    setter(grid, c.x, c.y);
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

// Format a map array as paste-ready JavaScript.
export function formatMapForCode(map, name = 'MAP_GENERATED') {
  const lines = map.map((row) => `  "${row}",`).join('\n');
  return `export const ${name} = [\n${lines}\n];`;
}

// Mulberry32 — reproducible RNG for seeded generation.
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
