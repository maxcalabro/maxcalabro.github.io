// Tile-grid pathfinding (A*, 8-directional).
//
// Walls are static, the grid is 40 × 30, so A* over the whole grid
// is comfortably fast. Used by both party members (when navigating
// click targets or auto-engaging) and by enemies (chasing the party).
//
// The grid is built once per level (see scene.buildPassableGrid).
// Path consumers re-call findPath when the goal moves enough to
// matter; otherwise the previously-computed waypoint list is
// followed as-is.

import { TILE } from './config.js';

// 8 neighbour offsets with edge costs. Diagonals cost √2 so the
// heuristic stays admissible.
const SQRT2 = Math.SQRT2;
const DIRS = [
  [-1, -1, SQRT2], [0, -1, 1], [1, -1, SQRT2],
  [-1,  0, 1],                   [1,  0, 1],
  [-1,  1, SQRT2], [0,  1, 1], [1,  1, SQRT2],
];

// Octile distance — exact lower bound for 8-directional movement.
function octile(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
}

// Tile ↔ world conversions. Tile coords index the passable grid;
// world coords are pixels. Path waypoints are stored as tile coords
// and converted at follow time.
export function worldToTile(wx, wy) {
  return { tx: Math.floor(wx / TILE), ty: Math.floor(wy / TILE) };
}

export function tileToWorld(tx, ty) {
  return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

// Builds a 2D passable bool array from a map data array. The wall
// charset is canonical to the game's tile vocabulary — any change
// to map.js's wall types needs to update this list too.
const WALL_CHARS = new Set(['T', 'B', 'W', 'H', 'R', '#', '~']);
export function buildPassableGrid(mapData) {
  const H = mapData.length;
  const W = mapData[0].length;
  const grid = new Array(H);
  for (let y = 0; y < H; y++) {
    const row = new Array(W);
    for (let x = 0; x < W; x++) {
      row[x] = !WALL_CHARS.has(mapData[y][x]);
    }
    grid[y] = row;
  }
  return { grid, W, H };
}

// Returns true if the given tile is in-bounds and walkable.
export function isPassable(passableGrid, tx, ty) {
  if (!passableGrid) return false;
  if (tx < 0 || ty < 0 || tx >= passableGrid.W || ty >= passableGrid.H) return false;
  return passableGrid.grid[ty][tx];
}

// BFS outward from `goal` to find the closest walkable tile when
// the player clicks on (or an enemy targets) a wall. Returns null
// if no walkable tile is within `radius` steps.
export function nearestWalkable(passableGrid, goal, radius = 8) {
  if (isPassable(passableGrid, goal.tx, goal.ty)) return goal;
  const visited = new Set([goal.tx + ',' + goal.ty]);
  let frontier = [goal];
  for (let r = 1; r <= radius; r++) {
    const next = [];
    for (const t of frontier) {
      const neighbours = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of neighbours) {
        const ntx = t.tx + dx;
        const nty = t.ty + dy;
        const k = ntx + ',' + nty;
        if (visited.has(k)) continue;
        visited.add(k);
        if (isPassable(passableGrid, ntx, nty)) return { tx: ntx, ty: nty };
        next.push({ tx: ntx, ty: nty });
      }
    }
    frontier = next;
  }
  return null;
}

// A* on the passable grid. Returns an array of {tx, ty} from the
// step AFTER start through to goal inclusive, or null if no path
// exists within `maxIterations` expansions.
export function findPath(sx, sy, ex, ey, passableGrid, maxIterations = 4000) {
  if (!isPassable(passableGrid, ex, ey)) return null;
  if (sx === ex && sy === ey) return [];

  const open = new MinHeap();
  const cameFrom = new Map();
  const gScore = new Map();
  const closed = new Set();

  const startKey = sx + ',' + sy;
  gScore.set(startKey, 0);
  open.push({ key: startKey, x: sx, y: sy, f: octile(sx, sy, ex, ey) });

  let iterations = 0;
  while (open.size() > 0 && iterations++ < maxIterations) {
    const cur = open.pop();
    if (cur.x === ex && cur.y === ey) {
      // Reconstruct path back to the start, then drop the start
      // node since the entity is already there.
      const out = [];
      let key = cur.key;
      while (key) {
        const i = key.indexOf(',');
        const x = +key.slice(0, i);
        const y = +key.slice(i + 1);
        out.unshift({ tx: x, ty: y });
        key = cameFrom.get(key);
      }
      out.shift();
      return out;
    }
    if (closed.has(cur.key)) continue;
    closed.add(cur.key);

    const baseG = gScore.get(cur.key);
    for (let i = 0; i < DIRS.length; i++) {
      const dx = DIRS[i][0], dy = DIRS[i][1], stepCost = DIRS[i][2];
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isPassable(passableGrid, nx, ny)) continue;
      // Diagonals can't cut across blocked corners.
      if (dx !== 0 && dy !== 0) {
        if (!isPassable(passableGrid, cur.x + dx, cur.y)) continue;
        if (!isPassable(passableGrid, cur.x, cur.y + dy)) continue;
      }
      const nKey = nx + ',' + ny;
      if (closed.has(nKey)) continue;
      const tentativeG = baseG + stepCost;
      const existingG = gScore.get(nKey);
      if (existingG !== undefined && existingG <= tentativeG) continue;
      cameFrom.set(nKey, cur.key);
      gScore.set(nKey, tentativeG);
      open.push({ key: nKey, x: nx, y: ny, f: tentativeG + octile(nx, ny, ex, ey) });
    }
  }
  return null;
}

// Minimal binary min-heap keyed on `.f`. Re-implementing here (rather
// than pulling in a library) so path.js stays a single self-contained
// module.
class MinHeap {
  constructor() { this.items = []; }
  size() { return this.items.length; }
  push(item) {
    this.items.push(item);
    this._siftUp(this.items.length - 1);
  }
  pop() {
    const items = this.items;
    const min = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      this._siftDown(0);
    }
    return min;
  }
  _siftUp(i) {
    const items = this.items;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (items[i].f >= items[p].f) break;
      const tmp = items[i]; items[i] = items[p]; items[p] = tmp;
      i = p;
    }
  }
  _siftDown(i) {
    const items = this.items;
    const n = items.length;
    while (true) {
      const l = 2 * i + 1, r = 2 * i + 2;
      let smallest = i;
      if (l < n && items[l].f < items[smallest].f) smallest = l;
      if (r < n && items[r].f < items[smallest].f) smallest = r;
      if (smallest === i) break;
      const tmp = items[i]; items[i] = items[smallest]; items[smallest] = tmp;
      i = smallest;
    }
  }
}
