// Monster archetypes and the map-character → type mapping.
//
// Each archetype defines the sprite, base combat stats, AI tuning,
// per-tag resistances, and the tags that fire when this monster hits
// a character. The scene calls statsFor(typeKey, mapLevel) when
// spawning, and statsFor multiplies HP / damage / point reward by
// the map-level scaling factors below — so deeper dungeons get
// tougher monsters without the scene needing to know how.

import { TAGS } from './tags.js';

export const MONSTER_TYPES = {
  skeleton: {
    displayName: 'Skeleton',
    spriteKey: 'enemy_skeleton',
    hp: 60,
    damage: 3,
    speed: 70,
    aggroRange: 200,
    points: 2,
    // Undead — immune-ish to poison/cold, slightly vulnerable to
    // physical (brittle bones).
    resistances: {
      [TAGS.POISON]: 0.5,
      [TAGS.COLD]: 0.4,
      [TAGS.PHYSICAL]: -0.1,
      [TAGS.BLEEDING]: 1.0,
    },
    attackTags: [TAGS.PHYSICAL, TAGS.MELEE],
  },
  goblin: {
    displayName: 'Goblin',
    spriteKey: 'enemy_goblin',
    hp: 50,
    damage: 5,
    speed: 90,
    aggroRange: 250,
    points: 3,
    resistances: {
      [TAGS.POISON]: 0.2,
    },
    attackTags: [TAGS.PHYSICAL, TAGS.MELEE],
  },
  zombie: {
    displayName: 'Zombie',
    spriteKey: 'enemy_zombie',
    hp: 90,
    damage: 2,
    speed: 50,
    aggroRange: 150,
    points: 5,
    // Rotting flesh — burns easily, resists poison and bleeding.
    resistances: {
      [TAGS.FIRE]: -0.3,
      [TAGS.POISON]: 0.9,
      [TAGS.BLEEDING]: 0.5,
    },
    attackTags: [TAGS.PHYSICAL, TAGS.MELEE],
  },
  rat: {
    displayName: 'Rat',
    spriteKey: 'enemy_rat',
    hp: 30,
    damage: 1,
    speed: 120,
    aggroRange: 300,
    points: 5,
    // Animal — resists poison.
    resistances: {
      [TAGS.FIRE]: -0.1,
      [TAGS.COLD]: -0.1,
      [TAGS.LIGHTNING]: -0.1,
      [TAGS.POISON]: 0.2,
    },
    attackTags: [TAGS.PHYSICAL, TAGS.MELEE],
  },
};

// Map syntax (one character per cell in map.js) → monster type key.
// Adding a new monster only requires extending MONSTER_TYPES above
// and adding an entry here — the scene picks it up automatically.
export const MONSTER_BY_MAP_CHAR = {
  s: 'skeleton',
  g: 'goblin',
  z: 'zombie',
  r: 'rat',
};

// Per-map-level scaling. Map level 1 is baseline (×1.0); each
// subsequent level multiplies HP and damage by these increments.
// Tuning rationale: party HP grows ~+2 per party-level + STR/RES,
// and party damage scales with stat points (×0.2 per pt). Bumping
// monster HP ~40% per map level keeps fights tense as the party
// progresses, while a gentler damage scaling (~25%) keeps the early
// game survivable when the party is still squishy.
const MAP_LEVEL_HP_PER_STEP = 0.40;
const MAP_LEVEL_DAMAGE_PER_STEP = 0.25;
const MAP_LEVEL_POINTS_PER_STEP = 0.50;

// Returns the stats to use for a freshly-spawned monster of `type`
// at the given map level (the dungeon depth, not the party's XP
// level). HP, damage, and point reward scale with map level so deeper
// dungeons stay threatening even as the party stat-scales. Speed,
// aggro range, resistances, and attack tags are level-independent —
// those define the archetype's identity, not its raw power.
export function statsFor(typeKey, mapLevel = 1) {
  const archetype = MONSTER_TYPES[typeKey];
  if (!archetype) throw new Error('Unknown monster type: ' + typeKey);
  const steps = Math.max(0, mapLevel - 1);
  const hpMult = 1 + steps * MAP_LEVEL_HP_PER_STEP;
  const dmgMult = 1 + steps * MAP_LEVEL_DAMAGE_PER_STEP;
  const ptsMult = 1 + steps * MAP_LEVEL_POINTS_PER_STEP;
  // Deep-ish clone so per-monster mutations don't bleed back into the
  // shared archetype (resistances is the only object we share).
  return {
    ...archetype,
    hp: Math.max(1, Math.round(archetype.hp * hpMult)),
    damage: Math.max(1, Math.round(archetype.damage * dmgMult)),
    points: Math.max(1, Math.round((archetype.points || 1) * ptsMult)),
    resistances: { ...(archetype.resistances || {}) },
    attackTags: [...(archetype.attackTags || [])],
  };
}
