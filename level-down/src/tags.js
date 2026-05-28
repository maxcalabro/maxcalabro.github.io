// Tag system: the single source of truth for how skills classify
// themselves, how stats scale damage, and how resistances reduce it.
//
// Every other system that touches damage (skills, equipment, monsters,
// the character sheet) imports the constants and helpers from here, so
// adding a new tag, a new scaling stat, or tweaking a resistance
// formula is a one-file change.
//
// Concepts:
//   - TAGS — canonical tag identifiers. Skills carry an array of these.
//   - SCALING_TAGS — for each tag that scales damage, which stat it
//     reads and how much each point contributes.
//   - Resolve/Defense constants — see below. Both apply per-tag.
//   - computeResistance(target, tags) — % reduction the target gets
//     against a skill with these tags.
//   - applyDamageFormula(baseDamage, tags, caster, target) — full
//     damage pipeline: base + stat scaling, then × (1 − reduction).
//
// Adding a new tag: list it in TAGS and TAG_DISPLAY, optionally add it
// to SCALING_TAGS if it scales damage. Targets pick up the new tag
// automatically via their `resistances` map.

import { equipmentBonus } from './inventory.js';

export const TAGS = Object.freeze({
  // Damage types — every attack has exactly one of these, and only
  // these carry resistances. Listed in DAMAGE_TYPES below.
  PHYSICAL:  'physical',
  FIRE:      'fire',
  POISON:    'poison',
  LIGHTNING: 'lightning',
  COLD:      'cold',
  BLEEDING:  'bleeding',
  // Skill tags — descriptive only. They classify HOW a skill is
  // delivered (Melee / Ranged) or its magical nature (Magic). No
  // resistances; targeted by buffs like "+25% magic damage" that
  // boost every skill carrying the tag. Listed in SKILL_TAGS below.
  MELEE:     'melee',
  RANGED:    'ranged',
  MAGIC:     'magic',
});

export const ALL_TAGS = Object.values(TAGS);

// Damage-type tags ONLY. Targets carry resistance entries keyed by
// these. Every offensive skill picks exactly one as its damageType.
export const DAMAGE_TYPES = Object.freeze([
  TAGS.PHYSICAL, TAGS.FIRE, TAGS.POISON,
  TAGS.LIGHTNING, TAGS.COLD, TAGS.BLEEDING,
]);

// Skill tags ONLY. Purely descriptive — no resistance lookups, no
// effect on damage by themselves. Buffs that scale "all magic" or
// "all melee" hits read from this list.
export const SKILL_TAGS = Object.freeze([
  TAGS.MELEE, TAGS.RANGED, TAGS.MAGIC,
]);

// Display labels in canonical order, split by category. The
// resistances panel iterates DAMAGE_TYPE_DISPLAY (6 entries); the
// damage-breakdown card combines both lists so a Fireball can show
// "Fire" + "Ranged" + "Magic" badges in one row.
export const DAMAGE_TYPE_DISPLAY = [
  { tag: TAGS.PHYSICAL,  short: 'PHYS', label: 'Physical'  },
  { tag: TAGS.FIRE,      short: 'FIRE', label: 'Fire'      },
  { tag: TAGS.POISON,    short: 'POIS', label: 'Poison'    },
  { tag: TAGS.LIGHTNING, short: 'LITE', label: 'Lightning' },
  { tag: TAGS.COLD,      short: 'COLD', label: 'Cold'      },
  { tag: TAGS.BLEEDING,  short: 'BLED', label: 'Bleeding'  },
];
export const SKILL_TAG_DISPLAY = [
  { tag: TAGS.MELEE,  short: 'MELE', label: 'Melee'  },
  { tag: TAGS.RANGED, short: 'RANG', label: 'Ranged' },
  { tag: TAGS.MAGIC,  short: 'MAGI', label: 'Magic'  },
];
// Backward-compat combined list — anything that wants every label
// in one go (e.g. legacy iteration) reads this.
export const TAG_DISPLAY = [...DAMAGE_TYPE_DISPLAY, ...SKILL_TAG_DISPLAY];

// Tag → stat scaling. Each entry here adds
// `effectiveStat(caster, stat) * perPoint` to a skill's base damage
// when that tag is on the skill — either as the damage type or as
// one of the skill tags. Tags not in this map don't add stat
// scaling; they may still be present on a skill for buff targeting
// or flavour.
//
// Stat→tag assignments:
//   - Strength scales Physical and Bleeding damage types (cuts and
//     impact). Also contributes to maxHp via STRENGTH_HP_PER_POINT.
//   - Intelligence scales Magic-tagged skills AND every elemental
//     damage type (fire, cold, lightning, poison). A fire spell
//     tagged Magic gets INT scaling twice — once for the Fire
//     damage type and once for the Magic skill tag.
//   - Agility doesn't scale damage; it boosts movement and attack
//     speed via AGILITY_SPEED_PER_POINT / AGILITY_ATTACK_SPEED_PER_POINT.
//   - Resolve doesn't scale damage; it boosts HP (RESOLVE_HP_PER_POINT)
//     and adds resistance against incoming attacks (see computeResistance).
export const SCALING_TAGS = Object.freeze({
  [TAGS.PHYSICAL]:  { stat: 'strength',     perPoint: 0.5 },
  [TAGS.BLEEDING]:  { stat: 'strength',     perPoint: 0.5 },
  [TAGS.MAGIC]:     { stat: 'intelligence', perPoint: 0.25 },
  [TAGS.FIRE]:      { stat: 'intelligence', perPoint: 0.25 },
  [TAGS.COLD]:      { stat: 'intelligence', perPoint: 0.25 },
  [TAGS.LIGHTNING]: { stat: 'intelligence', perPoint: 0.25 },
  [TAGS.POISON]:    { stat: 'intelligence', perPoint: 0.25 },
});

// Agility boosts movement speed at this rate per point. Stacks
// additively with any "speed" gear stat in scene.updateCharacterMovement.
export const AGILITY_SPEED_PER_POINT = 0.02;
export const AGILITY_ATTACK_SPEED_PER_POINT = 0.02;

// ---- Tuning constants ----------------------------------------------
// All resistance-influencing numbers live in this block so balance
// adjustments are a one-file change.

// Each point of Resolve adds this much resistance per tag on the
// incoming attack. A 3-tag attack benefits from this bonus three
// times — multi-tag attacks are more vulnerable to resilient targets.
export const RESOLVE_RES_PER_TAG = 0.02;

// Each point of "defense" gear stat adds this much resistance per
// tag, on top of its role as flat damage reduction in onPlayerHit.
// Stacked across every equipped item via equipmentBonus.
export const DEFENSE_RES_PER_TAG = 0.01;

// HP per Resolve point. Resolve also boosts maxHp in recalcCharacterStats.
export const RESOLVE_HP_PER_POINT = 1;

// HP per Strength point. Strength now doubles as a soft HP stat in
// addition to its damage role — a Knight build leans heavily on it.
// Half a hit point per point makes it noticeable without overshadowing
// Resolve's primary HP contribution.
export const STRENGTH_HP_PER_POINT = 0.5;

// Damage reduction caps so even a stacked target still takes a
// sliver of damage from any hit.
export const MAX_DAMAGE_REDUCTION = 0.80;

// Floor on damage actually dealt. A "1" feels better than a "0"
// because the player can tell the attack landed.
export const MIN_DAMAGE = 1;

// Returns a resistances object with every tag at 0. Pass through
// Object.assign with overrides for per-class baselines.
export function makeEmptyResistances() {
  const r = {};
  for (const t of ALL_TAGS) r[t] = 0;
  return r;
}

// % damage reduction a target gets against an attack of the given
// damage type. Sums:
//   - target.resistances[damageType] (class baseline + modifiers)
//   - Resolve (both base stat AND gear bonus) × RESOLVE_RES_PER_TAG
//   - gear Defense × DEFENSE_RES_PER_TAG
//   - target's gear bonus to the damage type (e.g. mage_robe's
//     `fire: 0.05` against a fire-damageType attack)
// Then caps at MAX_DAMAGE_REDUCTION. Resolve and Defense each
// contribute ONCE per attack — they used to be added per tag in
// the previous multi-tag system, which produced unintentionally
// huge resistances against multi-tagged skills like Fireball.
//
// damageType is a single string (one of DAMAGE_TYPES) or falsy.
// A falsy damage type (e.g. for a heal) returns 0.
export function computeResistance(target, damageType) {
  if (!target || !damageType) return 0;
  const baseResolve = (target.stats && target.stats.resolve) || 0;
  const gearResolve = target.equipment ? equipmentBonus(target.equipment, 'resolve') : 0;
  const gearDefense = target.equipment ? equipmentBonus(target.equipment, 'defense') : 0;
  const resolveBonus = (baseResolve + gearResolve) * RESOLVE_RES_PER_TAG;
  const defenseBonus = gearDefense * DEFENSE_RES_PER_TAG;
  const base = (target.resistances && target.resistances[damageType]) || 0;
  const itemBonus = target.equipment ? equipmentBonus(target.equipment, damageType) : 0;
  let total = base + resolveBonus + defenseBonus + itemBonus;
  if (total > MAX_DAMAGE_REDUCTION) total = MAX_DAMAGE_REDUCTION;
  return total;
}

// Effective stat value — base stat plus any gear bonus to the same
// stat key. Exported so the character sheet can render stat totals
// that match what combat actually uses.
export function effectiveStat(character, stat) {
  if (!character) return 0;
  const base = (character.stats && character.stats[stat]) || 0;
  const gear = character.equipment ? equipmentBonus(character.equipment, stat) : 0;
  return base + gear;
}

// Full damage pipeline. Returns an integer ≥ MIN_DAMAGE.
//
// Damage is computed as the sum of independent damage sources, each
// taxed by the target's resistance to its own type:
//
//   1. BASE source — the skill's nominal damage + flat weapon damage
//      + stat scaling for any matching SCALING_TAGS entry on either
//      the damageType or any of the skill tags. Taxed by the
//      target's resistance to the SKILL'S damageType (single lookup,
//      not per-tag).
//
//   2. GEAR per-type sources — every `dmg_<type>` modifier on the
//      caster's equipment adds an independent damage source of that
//      type, taxed by the target's resistance to that one type.
//
// Each source has at most one damage type, so resistance lookup is
// a single `computeResistance(target, type)` call. The skill tags
// (Melee / Ranged / Magic) never enter resistance — they're purely
// descriptive (used by buffs like "+25% magic damage" that scale
// every magic-tagged skill, regardless of its damage type).
//
// baseDamage:  skill's nominal damage + flat weapon damage
// damageType:  one of DAMAGE_TYPES, or falsy for non-damage skills
// skillTags:   array of skill-type tags (Melee, Ranged, Magic) —
//              affect stat scaling via SCALING_TAGS but never
//              resistance
// caster:      any object with `.stats` and/or `.equipment`
// target:      any object with `.stats`, `.equipment`, `.resistances`.
//              null → no resistance applied (used by the character
//              sheet's headline-damage display).
// extraDamage: optional `{ [DAMAGE_TYPE]: amount }` map declared on
//              the skill itself (separate from caster gear). Each
//              entry adds its own damage source taxed by that one
//              type's resistance. Used by enemy attacks that mix
//              elements ("goblin arrow does physical + poison")
//              without having to grow the skill's damageType into
//              an array.
export function applyDamageFormula(baseDamage, damageType, skillTags, caster, target, extraDamage) {
  // ---- BASE source ----
  let baseDmg = baseDamage;
  if (caster) {
    // Damage type can have a scaling entry (Physical → STR, Fire →
    // INT, etc.). Skill tags can ALSO have scaling entries (Magic →
    // INT). A Fireball with damageType=Fire and tags=[Ranged, Magic]
    // therefore picks up INT scaling twice — once for Fire, once
    // for Magic — preserving the previous combined scaling rate.
    if (damageType) {
      const scaling = SCALING_TAGS[damageType];
      if (scaling) {
        baseDmg += effectiveStat(caster, scaling.stat) * scaling.perPoint;
      }
    }
    if (skillTags) {
      for (const tag of skillTags) {
        const scaling = SCALING_TAGS[tag];
        if (scaling) {
          baseDmg += effectiveStat(caster, scaling.stat) * scaling.perPoint;
        }
      }
    }
  }
  const baseReduction = computeResistance(target, damageType);
  let dmg = baseDmg * (1 - baseReduction);

  // ---- Per-type gear-damage sources ----
  // Each `dmg_<type>` modifier on equipment adds its own slice of
  // damage of that type, taxed only by the target's resistance to
  // that one type. Without this split, a +1 poison-damage modifier
  // on a sword would make the ENTIRE swing poison-resistant, which
  // counter-intuitively lowers net damage against poison-resistant
  // targets like zombies.
  if (caster && caster.equipment) {
    for (const type of DAMAGE_TYPES) {
      const bonus = equipmentBonus(caster.equipment, 'dmg_' + type);
      if (bonus > 0) {
        const tagReduction = computeResistance(target, type);
        dmg += bonus * (1 - tagReduction);
      }
    }
  }

  // ---- Per-type skill extra-damage sources ----
  // Same shape as gear `dmg_<type>` bonuses, but declared on the
  // skill itself. Used by enemy attacks that mix elements (e.g. a
  // goblin's poison-tipped arrow does base physical damage AND a
  // separately-resisted slice of poison). Player skills can also
  // declare it if a future skill should bake in a per-type bonus.
  if (extraDamage) {
    for (const type of DAMAGE_TYPES) {
      const bonus = extraDamage[type] || 0;
      if (bonus > 0) {
        const tagReduction = computeResistance(target, type);
        dmg += bonus * (1 - tagReduction);
      }
    }
  }

  return Math.max(MIN_DAMAGE, Math.round(dmg));
}
