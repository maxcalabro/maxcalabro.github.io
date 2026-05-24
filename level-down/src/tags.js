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
  // Damage types (resistance applies)
  PHYSICAL:  'physical',
  FIRE:      'fire',
  POISON:    'poison',
  LIGHTNING: 'lightning',
  COLD:      'cold',
  BLEEDING:  'bleeding',
  // Delivery / source.
  MELEE:     'melee',
  RANGED:    'ranged',
  MAGIC:     'magic',
});

export const ALL_TAGS = Object.values(TAGS);

// Display labels in canonical order. Character sheets and tooltips
// iterate this so the order is consistent everywhere.
export const TAG_DISPLAY = [
  { tag: TAGS.PHYSICAL,  short: 'PHYS', label: 'Physical'  },
  { tag: TAGS.FIRE,      short: 'FIRE', label: 'Fire'      },
  { tag: TAGS.POISON,    short: 'POIS', label: 'Poison'    },
  { tag: TAGS.LIGHTNING, short: 'LITE', label: 'Lightning' },
  { tag: TAGS.COLD,      short: 'COLD', label: 'Cold'      },
  { tag: TAGS.BLEEDING,  short: 'BLED', label: 'Bleeding'  },
  { tag: TAGS.MELEE,     short: 'MELE', label: 'Melee'     },
  { tag: TAGS.RANGED,    short: 'RANG', label: 'Ranged'    },
  { tag: TAGS.MAGIC,     short: 'MAGI', label: 'Magic'     },
];

// Tag → stat scaling. A skill's base damage gains
// (caster.stats[stat] * perPoint) for every entry here whose tag is
// on the skill. Tags not in this map are purely descriptive /
// resistance-driving.
//
// Stat→tag assignments:
//   - Strength scales Physical and Bleeding (cuts and impact). Also
//     contributes to maxHp via STRENGTH_HP_PER_POINT.
//   - Intelligence scales Magic and every elemental type (fire,
//     cold, lightning, poison). It also scales Heal — see
//     scene.healAlly which uses the same perPoint coefficient.
//   - Agility doesn't scale damage; it boosts movement speed via
//     AGILITY_SPEED_PER_POINT (see below).
//   - Resolve doesn't scale damage; it boosts HP via
//     RESOLVE_HP_PER_POINT and adds resistance to every tag on an
//     incoming attack (see computeResistance).
//
// A multi-tag skill stacks naturally: Fireball (Fire, Ranged,
// Magic) gets Intelligence scaling twice — once for Fire and once
// for Magic.
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

// % damage reduction a target gets against a skill with the given
// tags. Builds the resistance per-tag from:
//   - target.resistances[tag] (class baseline + future modifiers)
//   - Resolve (both base stat AND gear bonus) × RESOLVE_RES_PER_TAG
//   - gear Defense × DEFENSE_RES_PER_TAG
//   - tag-specific gear bonus (e.g. an item with stats: { fire: 0.1 })
// Sums across all tags on the skill, then caps. A target with no
// `resistances` map or `stats.resolve` just contributes 0 from
// those parts of the formula.
export function computeResistance(target, tags) {
  if (!target || !tags || tags.length === 0) return 0;
  const baseResolve = (target.stats && target.stats.resolve) || 0;
  const gearResolve = target.equipment ? equipmentBonus(target.equipment, 'resolve') : 0;
  const gearDefense = target.equipment ? equipmentBonus(target.equipment, 'defense') : 0;
  const perTagBonus = (baseResolve + gearResolve) * RESOLVE_RES_PER_TAG
    + gearDefense * DEFENSE_RES_PER_TAG;
  let total = 0;
  for (const tag of tags) {
    const base = (target.resistances && target.resistances[tag]) || 0;
    const itemBonus = target.equipment ? equipmentBonus(target.equipment, tag) : 0;
    total += base + perTagBonus + itemBonus;
  }
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
// baseDamage: the skill's nominal damage (plus any flat additions the
//   scene wants to bake in — e.g. weapon damage from equipment).
// tags: array of TAGS values on the skill / attack.
// caster: any object with `.stats` and/or `.equipment`. Missing → no
//   scaling. Gear stat bonuses (e.g. +1 strength from a sword) are
//   read here too, so the same item that grants a skill can also
//   improve its scaling.
// target: any object with `.stats`, `.equipment`, and/or `.resistances`.
export function applyDamageFormula(baseDamage, tags, caster, target) {
  let dmg = baseDamage;

  // Stat scaling per scaling-tag in the skill itself.
  if (caster && tags) {
    for (const tag of tags) {
      const scaling = SCALING_TAGS[tag];
      if (scaling) {
        dmg += effectiveStat(caster, scaling.stat) * scaling.perPoint;
      }
    }
  }

  // Gear damage bonuses (dmg_fire, dmg_poison, etc.) apply
  // unconditionally — a sword with a "Fire Damage" modifier deals
  // fire damage on a physical strike. Each bonus also widens the
  // hit's effective tag set so the target's resistance for that
  // damage type still applies.
  const effective = new Set(tags || []);
  if (caster && caster.equipment) {
    for (const tag of ALL_TAGS) {
      const bonus = equipmentBonus(caster.equipment, 'dmg_' + tag);
      if (bonus > 0) {
        dmg += bonus;
        effective.add(tag);
      }
    }
  }

  const reduction = computeResistance(target, [...effective]);
  dmg *= (1 - reduction);
  return Math.max(MIN_DAMAGE, Math.round(dmg));
}
