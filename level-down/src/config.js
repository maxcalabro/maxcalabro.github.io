// Gameplay tunables and rendering layers.
//
// All tile-space sizes, speeds, and ranges live here so they can
// be balanced without touching the systems that consume them.

export const TILE = 32;             // displayed tile size (px)
export const SRC_TILE = 16;         // Kenney source tile size (px)
export const SCALE = TILE / SRC_TILE;
export const VIEW_W = 25;           // viewport width in tiles
export const VIEW_H = 19;           // viewport height in tiles

export const PLAYER_SPEED = 150;
export const SIGHT_RANGE = 250;     // how far the character "sees" enemies for personality-driven movement
export const ARRIVE_THRESHOLD = 4;
// Physics body diameter as a fraction of the source tile. Bumped up
// from 0.7 to 0.85 so the "solid" collision between characters and
// enemies reads visibly — at 0.7 the 22 px body inside a 32 px sprite
// let sprites visually overlap by ~10 px even when the bodies didn't.
// Stays under 1.0 so circular bodies still slip around tile corners
// cleanly in narrow corridors.
export const HITBOX_RATIO = 0.85;

// Organic movement. The character treats the click as a *suggestion*,
// not a path: heading drifts, pace wobbles, the actual landing point
// is jittered a bit, and when nothing else is driving movement the
// character wanders to nearby points and rests between strolls.
// Higher jitter makes party members aim at noticeably different
// spots, so they spread along the path rather than clumping.
export const MOVE_JITTER_PX = 36;   // click → moveTarget offset radius (~1.1 tiles)
export const DRIFT_MAX = 0.30;      // max heading offset (radians ≈ 17°)
export const DRIFT_STEP = 0.10;     // per-frame random walk magnitude
export const DRIFT_DECAY = 0.95;    // per-frame pull back toward 0
export const PACE_MIN = 0.85;
export const PACE_MAX = 1.10;
export const PACE_STEP = 0.015;
export const PACE_DECAY = 0.99;
export const WANDER_MIN_DIST = 16;  // px
export const WANDER_MAX_DIST = 48;
export const WANDER_MIN_REST = 800; // ms
export const WANDER_MAX_REST = 3000;
export const WANDER_GIVEUP_MS = 1500; // abandon a wander leg if blocked
export const WANDER_SPEED_FACTOR = 0.35; // wandering is a stroll, not a march
export const POST_INTENT_REST = 500;    // brief pause before wandering resumes after a click

// Buddy spacing. When two party members get within BUDDY_DISTANCE of
// each other they push apart with a quadratic falloff — barely there at
// the boundary, strong only when they're nearly on top of each other.
// Hard physics collider stays as a backstop, but in practice this
// soft force does the spacing work and leaves room for them to walk
// adjacent to each other when needed.
export const BUDDY_DISTANCE = 64;

// Per-character tints (rainbow palette). On creation each party
// member draws one of these without replacement, then uses it for
// their HP bar, hover-name label, and speech-bubble text. Mirrors the
// title-screen rainbow so the visual identity carries through.
export const PARTY_COLORS = [
  0xff5e5e, // red
  0xffa64c, // orange
  0xffe34c, // yellow
  0x58e070, // green
  0x4cc9f0, // cyan
  0x9a72ff, // purple
  0xff64c8, // pink
];

// Draw-order layers. Higher values render on top.
// Keep walls below characters so the player and enemies are
// never occluded by ground decoration.
export const DEPTH = {
  ground:   0,
  decor:    1,
  walls:    2,
  pickup:   5,   // chests and other on-ground pickups
  enemy:   10,
  player:  11,
  fx:      20,
  ring:    30,
  overlay: 35,   // world-space UI (floating HP bars, hover name labels)
  hud:    100,
  modal: 1000,
};
