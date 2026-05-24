// Procedural item generation.
//
// Each chest spawn rolls a fresh item from this module. An item is
// the combination of:
//   - A base (sword, robe, ring, …): determines slot, image, and
//     which skills the wearer gains.
//   - 1–5 modifiers picked from MODIFIERS without replacement, each
//     at a tier 1–5. Modifiers stamp values into the item's `stats`
//     map (the same map equipmentBonus reads).
//   - A name composed of one adjective + the base name + " of the "
//     + one noun.
//
// Each item is a full self-contained snapshot — `modifiers` records
// the recipe for tooltip display; `stats` is the materialized form
// the gameplay code already consumes via equipmentBonus.
//
// To rebalance:
//   - TIER_WEIGHTS: probability of each tier within a roll (default
//     uniform). Heavier-weighted high tiers = more loot-rich game.
//   - MODIFIER_COUNT_WEIGHTS: probability of 1, 2, 3, 4, 5 modifiers
//     on a generated item.
//   - Each modifier's valueFn(tier) controls how the tier number
//     converts to an actual stat amount.

import { TAGS, ALL_TAGS } from './tags.js';

// Tier weighting. Indices 0..4 map to tier 1..5. Equal weight for
// now — adjust to bias toward higher tiers for end-game items, etc.
export const TIER_WEIGHTS = [1, 1, 1, 1, 1];

// Modifier-count weighting. Indices 0..4 map to counts 1..5.
// More modifiers = rarer (and stronger) items.
export const MODIFIER_COUNT_WEIGHTS = [0.45, 0.35, 0.12, 0.06, 0.02];

// Base items. `baseName` is what appears in the middle of the
// generated item name ("Sharp <baseName> of the Wolf"). Each base
// can grant zero or more skills.
//
// Weapons here mirror items.js — sword→Slice, axe→Cleave, dagger→Jab,
// each staff variant→Bonk + its element/heal. The procgen pool
// includes one base per staff element so loot rolls feel distinct
// (rolling "Fire Staff" vs "Cold Staff" actually changes how you
// play the character that equips it).
export const BASE_ITEMS = {
  // ---- Weapons — melee ------------------------------------------
  sword:   { type: 'weapon', baseName: 'Sword',  image: 'item_weapon', skills: [{ id: 'slice',  slot: 'primary' }] },
  axe:     { type: 'weapon', baseName: 'Axe',    image: 'item_weapon', skills: [{ id: 'cleave', slot: 'primary' }] },
  mace:    { type: 'weapon', baseName: 'Mace',   image: 'item_weapon', skills: [{ id: 'slice',  slot: 'primary' }] },
  dagger:  { type: 'weapon', baseName: 'Dagger', image: 'item_weapon', skills: [{ id: 'jab',    slot: 'primary' }] },

  // ---- Weapons — staves (Bonk + the staff's defining spell) ----
  fireball_staff:  { type: 'weapon', baseName: 'Fireball Staff',      image: 'item_weapon',
                     skills: [{ id: 'bonk', slot: 'primary' }, { id: 'fireball', slot: 'secondary' }] },
  firebolt_staff:  { type: 'weapon', baseName: 'Firebolt Staff',      image: 'item_weapon',
                     skills: [{ id: 'bonk', slot: 'primary' }, { id: 'firebolt', slot: 'secondary' }] },
  cold_staff:      { type: 'weapon', baseName: 'Cold Staff',      image: 'item_weapon',
                     skills: [{ id: 'bonk', slot: 'primary' }, { id: 'ice_knife', slot: 'secondary' }] },
  lightning_staff: { type: 'weapon', baseName: 'Lightning Staff', image: 'item_weapon',
                     skills: [{ id: 'bonk', slot: 'primary' }, { id: 'lightning_bolt', slot: 'secondary' }] },
  healing_staff:   { type: 'weapon', baseName: 'Healing Staff',   image: 'item_weapon',
                     skills: [{ id: 'bonk', slot: 'primary' }, { id: 'heal', slot: 'utility' }] },
  judgement_staff: { type: 'weapon', baseName: 'Judgement Staff', image: 'item_weapon',
                     skills: [{ id: 'bonk', slot: 'primary' }, { id: 'shock', slot: 'secondary' }, { id: 'light_heal', slot: 'utility' }] },

  // ---- Armor -----------------------------------------------------
  vest:      { type: 'armor', baseName: 'Vest',      image: 'item_armor', skills: [{ id: 'guard', slot: 'defensive' }] },
  robe:      { type: 'armor', baseName: 'Robe',      image: 'item_armor', skills: [{ id: 'guard', slot: 'defensive' }] },
  tunic:     { type: 'armor', baseName: 'Tunic',     image: 'item_armor', skills: [{ id: 'guard', slot: 'defensive' }] },
  chainmail: { type: 'armor', baseName: 'Chainmail', image: 'item_armor', skills: [{ id: 'guard', slot: 'defensive' }] },
  platemail: { type: 'armor', baseName: 'Platemail', image: 'item_armor', skills: [{ id: 'guard', slot: 'defensive' }] },

  // ---- Helmets ---------------------------------------------------
  cap:    { type: 'helmet', baseName: 'Cap',    image: 'item_helmet' },
  hood:   { type: 'helmet', baseName: 'Hood',   image: 'item_helmet' },
  helm:   { type: 'helmet', baseName: 'Helm',   image: 'item_helmet' },
  crown:  { type: 'helmet', baseName: 'Crown',  image: 'item_helmet' },

  // ---- Accessories -----------------------------------------------
  ring:     { type: 'accessory', baseName: 'Ring',     image: 'item_accessory', skills: [{ id: 'rejuvenation', slot: 'accessory' }] },
  amulet:   { type: 'accessory', baseName: 'Amulet',   image: 'item_accessory', skills: [{ id: 'rejuvenation', slot: 'accessory' }] },
  talisman: { type: 'accessory', baseName: 'Talisman', image: 'item_accessory', skills: [{ id: 'enrage', slot: 'accessory' }] },
  cloak:    { type: 'accessory', baseName: 'Cloak',    image: 'item_accessory', skills: [{ id: 'rejuvenation', slot: 'accessory' }] },
  charm:    { type: 'accessory', baseName: 'Charm',    image: 'item_accessory', skills: [{ id: 'enrage', slot: 'accessory' }] },
};

// Modifier pool. Each entry generates one stat-amount pair when
// applied to an item.
//
// `key` is the stats[key] that gets written. Damage-type modifiers
// use the `dmg_<tag>` namespace so they're distinct from resistance
// modifiers (which use the bare tag name as the key).
//
// `valueFn(tier)` is the stat amount: integer tiers for attributes
// and per-type damage, fractional percentages for resistances and
// speed.
export const MODIFIERS = [
  // Attributes
  { id: 'm_str',     label: 'Strength',     key: 'strength',     valueFn: (t) => t },
  { id: 'm_agi',     label: 'Agility',      key: 'agility',      valueFn: (t) => t },
  { id: 'm_int',     label: 'Intelligence', key: 'intelligence', valueFn: (t) => t },
  { id: 'm_resolve', label: 'Resolve',      key: 'resolve',      valueFn: (t) => t },
  // Flat HP — adds directly to maxHp via equipmentBonus(equipment, 'maxHp').
  // recalcCharacterStats already reads this key, so equipping a +HP
  // item bumps current HP by the delta too (see scene.recalcCharacterStats).
  { id: 'm_maxhp',   label: 'Max HP',       key: 'maxHp',        valueFn: (t) => t },
  // Defense (flat reduction + bonus per-tag resistance via tags.js).
  { id: 'm_defense', label: 'Defense',      key: 'defense',      valueFn: (t) => t },
  // Per-damage-type bonus damage. Adds to skills carrying the matching tag.
  { id: 'm_dmg_phys', label: 'Physical Damage',  key: 'dmg_' + TAGS.PHYSICAL,  valueFn: (t) => t },
  { id: 'm_dmg_fire', label: 'Fire Damage',      key: 'dmg_' + TAGS.FIRE,      valueFn: (t) => t },
  { id: 'm_dmg_pois', label: 'Poison Damage',    key: 'dmg_' + TAGS.POISON,    valueFn: (t) => t },
  { id: 'm_dmg_lite', label: 'Lightning Damage', key: 'dmg_' + TAGS.LIGHTNING, valueFn: (t) => t },
  { id: 'm_dmg_cold', label: 'Cold Damage',      key: 'dmg_' + TAGS.COLD,      valueFn: (t) => t },
  { id: 'm_dmg_bled', label: 'Bleeding Damage',  key: 'dmg_' + TAGS.BLEEDING,  valueFn: (t) => t },
  // Per-damage-type resistance. +5% per tier (tier 5 = +25%).
  { id: 'm_res_phys', label: 'Physical Resistance',  key: TAGS.PHYSICAL,  valueFn: (t) => t * 0.05 },
  { id: 'm_res_fire', label: 'Fire Resistance',      key: TAGS.FIRE,      valueFn: (t) => t * 0.05 },
  { id: 'm_res_pois', label: 'Poison Resistance',    key: TAGS.POISON,    valueFn: (t) => t * 0.05 },
  { id: 'm_res_lite', label: 'Lightning Resistance', key: TAGS.LIGHTNING, valueFn: (t) => t * 0.05 },
  { id: 'm_res_cold', label: 'Cold Resistance',      key: TAGS.COLD,      valueFn: (t) => t * 0.05 },
  { id: 'm_res_bled', label: 'Bleeding Resistance',  key: TAGS.BLEEDING,  valueFn: (t) => t * 0.05 },
  // Movement speed. +5% per tier; read in scene.updateCharacterMovement.
  { id: 'm_speed', label: 'Movement Speed', key: 'speed', valueFn: (t) => t * 0.05 },
  // Attack speed. +5% per tier (tier 5 = +25%). Shortens each skill's
  // effective cooldown via `cooldownMs / (1 + attack_speed)` in
  // scene.updateCharacterSkills — so +50% means skills fire 1.5×
  // more often, not 2×.
  { id: 'm_attack_speed', label: 'Attack Speed', key: 'attack_speed', valueFn: (t) => t * 0.05 },
];

// Adjectives and nouns — kept loose and gear-flavored. Some
// adjectives lean weapon-ish (sharp, jagged) and some armor-ish
// (sturdy, weathered); occasional mismatches are part of the
// loot-game charm.
export const ADJECTIVES = [
  'Sharp', 'Flaming', 'Deadly', 'Ancient', 'Gleaming', 'Rusted',
  'Ornate', 'Savage', 'Jagged', 'Shimmering', 'Frozen', 'Blessed',
  'Cursed', 'Mystic', 'Brutal', 'Swift', 'Heavy', 'Dark',
  'Radiant', 'Twisted', 'Vile', 'Holy', 'Primal', 'Bloody',
  'Scorching', 'Glowing', 'Etched', 'Masterwork', 'Weathered', 'Sparkling',
];

export const NOUNS = [
  'Bear', 'Wolf', 'Lion', 'Eagle', 'Dragon', 'Hawk',
  'Tiger', 'Fox', 'Owl', 'Raven', 'Serpent', 'Falcon',
  'Panther', 'Stag', 'Boar', 'Viper', 'Scorpion', 'Mantis',
  'Kraken', 'Phoenix', 'Basilisk', 'Gryphon', 'Leviathan', 'Sphinx',
  'Hydra', 'Chimera', 'Manticore', 'Wyvern', 'Lich', 'Banshee',
];

// Returns a fresh generated item. `random` is an injectable RNG so
// callers can seed for deterministic generation (tests, future
// seed-based runs, etc.).
export function generateRandomItem(random = Math.random) {
  // 1. Pick a base.
  const baseKeys = Object.keys(BASE_ITEMS);
  const baseKey = baseKeys[Math.floor(random() * baseKeys.length)];
  const base = BASE_ITEMS[baseKey];

  // 2. Roll modifier count and pick that many distinct modifiers.
  const count = pickWeightedIndex(MODIFIER_COUNT_WEIGHTS, random) + 1;
  const pool = MODIFIERS.slice();
  shuffleInPlace(pool, random);
  const picked = pool.slice(0, Math.min(count, pool.length));

  // 3. Roll a tier per picked modifier and materialize stats.
  const stats = {};
  const modifiers = [];
  for (const mod of picked) {
    const tier = pickWeightedIndex(TIER_WEIGHTS, random) + 1;
    const amount = mod.valueFn(tier);
    stats[mod.key] = (stats[mod.key] || 0) + amount;
    modifiers.push({
      id: mod.id,
      label: mod.label,
      key: mod.key,
      tier,
      amount,
    });
  }

  // 4. Compose the name.
  const adj = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  const name = `${adj} ${base.baseName} of the ${noun}`;

  return {
    type: base.type,
    baseId: baseKey,
    name,
    image: base.image,
    stats,
    skills: base.skills ? base.skills.map((s) => ({ ...s })) : undefined,
    modifiers,
  };
}

// Returns the index in `weights` chosen with probability proportional
// to each weight. Same helper used for tier rolls and modifier-count rolls.
function pickWeightedIndex(weights, random) {
  let total = 0;
  for (const w of weights) total += w;
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function shuffleInPlace(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// Set of resistance / speed keys whose displayed amount is a
// percentage. The character-sheet tooltip uses this to format
// modifier lines correctly without re-deriving from MODIFIERS.
const PERCENT_KEYS = new Set([...ALL_TAGS, 'speed', 'attack_speed']);
export function isPercentKey(key) { return PERCENT_KEYS.has(key); }

// Rarity bucket for an item, 1–5, keyed off modifier count. Static
// items (no modifiers) default to rarity 1 / common. Used both by
// the inventory panel (colours card border + name) and by the
// in-world pickup popup (colours the floating text).
export function itemRarity(item) {
  if (!item) return 1;
  const n = (item.modifiers && item.modifiers.length) || 1;
  if (n < 1) return 1;
  if (n > 5) return 5;
  return n;
}

// Phaser hex colours for each rarity tier. Must mirror the rarity-N
// CSS in game-starter.html so the in-world popup colour matches the
// inventory card colour the player will see when they open their bag.
export const RARITY_COLORS = [
  0xffffff, // 1 — common, white
  0x88ccff, // 2 — light blue
  0xffdd55, // 3 — yellow
  0xcc88ff, // 4 — purple
  0xff9944, // 5 — orange
];

export function itemRarityColor(item) {
  return RARITY_COLORS[itemRarity(item) - 1];
}
