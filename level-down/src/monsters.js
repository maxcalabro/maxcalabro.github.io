// Monster archetypes and the map-character → type mapping.
//
// Each archetype defines the sprite, base combat stats, AI tuning,
// per-tag resistances, and the SKILL the monster uses to attack —
// the same SKILLS catalog the player uses (see skills.js). Spawning
// flows through scene.placeMonster → statsFor(typeKey, mapLevel),
// which applies the per-map-level scaling below to HP / damage /
// point reward. Speed, aggro range, resistances, and skill choice
// stay constant across map levels — those define the archetype.
//
// `attackDamageType` / `attackSkillTags` are kept as legacy hints
// (a few HUD spots still read them), but combat damage now flows
// entirely through the chosen `skill`: the skill's damageType /
// tags / extraDamage drive resistance, and the monster's `damage`
// is fed to the formula as the base via scene.damageCharacter.

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
    // physical (brittle bones), fully resistant to bleeding (no
    // blood). Claws carry a cold rider for that bone-chill feel.
    resistances: {
      [TAGS.POISON]: 0.5,
      [TAGS.COLD]: 0.4,
      [TAGS.PHYSICAL]: -0.1,
      [TAGS.BLEEDING]: 1.0,
    },
    skill: 'claw_cold',
    attackDamageType: TAGS.PHYSICAL,
    attackSkillTags: [TAGS.MELEE],
  },
  goblin: {
    displayName: 'Goblin',
    spriteKey: 'enemy_goblin',
    hp: 50,
    damage: 5,
    speed: 90,
    aggroRange: 280,
    points: 3,
    resistances: {
      [TAGS.POISON]: 0.2,
    },
    // Goblins now shoot poison-tipped arrows from a distance.
    // Cooldown matches the longer aggro range so they're a real
    // ranged threat rather than just chasers.
    skill: 'goblin_shot',
    attackDamageType: TAGS.PHYSICAL,
    attackSkillTags: [TAGS.RANGED],
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
    skill: 'zombie_grab',
    attackDamageType: TAGS.PHYSICAL,
    attackSkillTags: [TAGS.MELEE],
  },
  rat: {
    displayName: 'Rat',
    spriteKey: 'enemy_rat',
    hp: 30,
    damage: 1,
    speed: 120,
    aggroRange: 300,
    points: 5,
    resistances: {
      [TAGS.FIRE]: -0.1,
      [TAGS.COLD]: -0.1,
      [TAGS.LIGHTNING]: -0.1,
      [TAGS.POISON]: 0.2,
    },
    skill: 'bite',
    attackDamageType: TAGS.PHYSICAL,
    attackSkillTags: [TAGS.MELEE],
  },

  // ---- New archetypes ----------------------------------------------

  bat: {
    displayName: 'Bat',
    spriteKey: 'enemy_bat',
    hp: 25,
    damage: 2,
    speed: 130,
    aggroRange: 280,
    points: 4,
    // Flighty creature — fast but fragile, slightly weak to cold.
    resistances: {
      [TAGS.COLD]: -0.15,
      [TAGS.POISON]: 0.1,
    },
    skill: 'bite',
    attackDamageType: TAGS.PHYSICAL,
    attackSkillTags: [TAGS.MELEE],
  },
  spider: {
    displayName: 'Spider',
    spriteKey: 'enemy_spider',
    hp: 35,
    damage: 3,
    speed: 90,
    aggroRange: 250,
    points: 5,
    // Venomous arachnid — built-in poison resistance, weak to fire.
    resistances: {
      [TAGS.POISON]: 0.6,
      [TAGS.FIRE]: -0.2,
    },
    skill: 'spider_spit',
    attackDamageType: TAGS.POISON,
    attackSkillTags: [TAGS.RANGED],
  },
  crab: {
    displayName: 'Crab',
    spriteKey: 'enemy_crab',
    hp: 60,
    damage: 4,
    speed: 55,
    aggroRange: 200,
    points: 5,
    // Shell-armoured — sturdy against physical, weak to lightning.
    resistances: {
      [TAGS.PHYSICAL]: 0.20,
      [TAGS.LIGHTNING]: -0.20,
      [TAGS.BLEEDING]: 0.3,
    },
    skill: 'pinch',
    attackDamageType: TAGS.PHYSICAL,
    attackSkillTags: [TAGS.MELEE],
  },
  evil_wizard: {
    displayName: 'Evil Wizard',
    spriteKey: 'enemy_wizard',
    hp: 55,
    damage: 5,
    speed: 60,
    aggroRange: 320,
    points: 12,
    // Magic-attuned spellcaster — strong against the elements he
    // commands, vulnerable to mundane physical attacks.
    resistances: {
      [TAGS.FIRE]: 0.30,
      [TAGS.COLD]: 0.15,
      [TAGS.LIGHTNING]: 0.15,
      [TAGS.PHYSICAL]: -0.15,
    },
    skill: 'wizard_fire',
    attackDamageType: TAGS.FIRE,
    attackSkillTags: [TAGS.RANGED, TAGS.MAGIC],
  },
};

// Map syntax (one character per cell in map.js) → monster type key.
// Adding a new monster only requires extending MONSTER_TYPES above
// and adding an entry here — the generator picks it up via
// monsterWeights in map-generator.js.
export const MONSTER_BY_MAP_CHAR = {
  s: 'skeleton',
  g: 'goblin',
  z: 'zombie',
  r: 'rat',
  b: 'bat',
  p: 'spider',
  k: 'crab',
  w: 'evil_wizard',
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
// aggro range, resistances, and skill choice are level-independent
// — those define the archetype's identity, not its raw power.
//
// `difficultyScale` is a final multiplier on HP and damage only,
// applied on top of the map-level scaling. The scene uses it to ease
// the early game while the party is still being assembled: a lone
// starting hero faces weaker monsters, ramping back to full strength
// (×1.0) once the party is up to three (see scene.monsterDifficultyScale).
// Point rewards are NOT scaled by it — clearing an easier solo monster
// shouldn't pay out less.
export function statsFor(typeKey, mapLevel = 1, difficultyScale = 1) {
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
    hp: Math.max(1, Math.round(archetype.hp * hpMult * difficultyScale)),
    damage: Math.max(1, Math.round(archetype.damage * dmgMult * difficultyScale)),
    points: Math.max(1, Math.round((archetype.points || 1) * ptsMult)),
    resistances: { ...(archetype.resistances || {}) },
    attackDamageType: archetype.attackDamageType,
    attackSkillTags: [...(archetype.attackSkillTags || [])],
    skill: archetype.skill,
  };
}
