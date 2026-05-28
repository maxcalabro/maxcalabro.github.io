// Named catalogue of starting-equipment items.
//
// Runtime chest drops go through the procedural generator (see
// item-generator.js). This file is only consulted when the scene
// needs a specific item by key — i.e. the starting weapons in
// PARTY_TEMPLATES (Iron Sword, Fire Staff, Healing Staff). Everything
// else in the catalogue is there for future scripted use or
// quick-test convenience.
//
// Entry shape — { type, name, image, stats, skills? }:
//   - type:  one of EQUIPMENT_SLOTS (weapon/armor/helmet/accessory).
//   - image: a TILES key (see assets.js).
//   - stats: same key namespace equipmentBonus() reads — damage,
//            defense, maxHp, strength, dmg_<tag>, <tag> (resistance),
//            speed, etc.
//   - skills: optional list of { id, slot } grants. When equipped,
//             each grant fills the named slot on the wearer (slots
//             defined in scene.js: SKILL_SLOTS / DEFAULT_SKILL_BY_SLOT).

export const ITEMS = {
  // ---- Swords (Slice) -------------------------------------------
  iron_sword: {
    type: 'weapon',
    name: 'Iron Sword',
    image: 'item_weapon',
    stats: { damage: 2 },
    skills: [{ id: 'slice', slot: 'primary' }],
  },
  steel_sword: {
    type: 'weapon',
    name: 'Steel Sword',
    image: 'item_weapon',
    stats: { damage: 3 },
    skills: [{ id: 'slice', slot: 'primary' }],
  },
  bronze_sword: {
    type: 'weapon', name: 'Bronze Sword', image: 'item_weapon',
    stats: { damage: 1, strength: 1 },
    skills: [{ id: 'slice', slot: 'primary' }],
  },
  wooden_stick: {
    type: 'weapon', name: 'Wooden Stick', image: 'item_weapon',
    stats: { damage: 0 },
    skills: [{ id: 'slice', slot: 'primary' }],
  },

  // ---- Axes (Cleave) --------------------------------------------
  battle_axe: {
    type: 'weapon', name: 'Battle Axe', image: 'item_weapon',
    stats: { damage: 3, strength: 1 },
    skills: [{ id: 'cleave', slot: 'primary' }],
  },
  warhammer: {
    // Heavy hitter — uses the cleave swing for its sweep.
    type: 'weapon', name: 'Warhammer', image: 'item_weapon',
    stats: { damage: 4, agility: -1 },
    skills: [{ id: 'cleave', slot: 'primary' }],
  },

  // ---- Daggers (Jab) --------------------------------------------
  iron_dagger: {
    type: 'weapon', name: 'Iron Dagger', image: 'item_weapon',
    stats: { damage: 1, agility: 1 },
    skills: [{ id: 'jab', slot: 'primary' }],
  },
  jeweled_dagger: {
    type: 'weapon', name: 'Jeweled Dagger', image: 'item_weapon',
    stats: { damage: 2, agility: 1 },
    skills: [{ id: 'jab', slot: 'primary' }],
  },

  // ---- Bows (Arrow Shot) ----------------------------------------
  // The Archer's starting weapon. Grants Arrow Shot in the primary
  // slot; a small Agility bump leans into the class's speed identity.
  short_bow: {
    type: 'weapon', name: 'Short Bow', image: 'item_weapon',
    stats: { damage: 1, agility: 1 },
    skills: [{ id: 'arrow_shot', slot: 'primary' }],
  },
  long_bow: {
    type: 'weapon', name: 'Long Bow', image: 'item_weapon',
    stats: { damage: 2, agility: 1 },
    skills: [{ id: 'arrow_shot', slot: 'primary' }],
  },

  // ---- Staves (Bonk + element / heal) ---------------------------
  // Every staff melees with Bonk; the secondary / utility slot holds
  // the magical skill that gives the staff its identity.
  firebolt_staff: {
    type: 'weapon',
    name: 'Firebolt Staff',
    image: 'item_weapon',
    stats: { damage: 0, intelligence: 1 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'firebolt', slot: 'secondary' },
    ],
  },
  cold_staff: {
    type: 'weapon', name: 'Cold Staff', image: 'item_weapon',
    stats: { damage: 0, intelligence: 1, cold: 0.05 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'ice_knife', slot: 'secondary' },
    ],
  },
  lightning_staff: {
    type: 'weapon', name: 'Lightning Staff', image: 'item_weapon',
    stats: { damage: 0, intelligence: 2 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'lightning_bolt', slot: 'secondary' },
    ],
  },
  healing_staff: {
    // Heal is in the utility slot so the wielder still uses Bonk on
    // adjacent threats when nobody on the team needs topping up.
    type: 'weapon',
    name: 'Healing Staff',
    image: 'item_weapon',
    stats: { damage: 0, intelligence: 1 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'heal', slot: 'utility' },
    ],
  },
  judgement_staff: {
    type: 'weapon', name: 'Judgement Staff', image: 'item_weapon',
    stats: { damage: 0, intelligence: 2, resolve: 1 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'shock', slot: 'secondary' },
      { id: 'light_heal', slot: 'utility' },
    ],
  },
  apprentice_wand: {
    // Smaller fire staff — fireball secondary, no melee buff.
    type: 'weapon', name: 'Apprentice Wand', image: 'item_weapon',
    stats: { damage: 0, intelligence: 1 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'fireball', slot: 'secondary' },
    ],
  },
  storm_staff: {
    type: 'weapon', name: 'Storm Staff', image: 'item_weapon',
    stats: { damage: 0, intelligence: 2 },
    skills: [
      { id: 'bonk', slot: 'primary' },
      { id: 'lightning_bolt', slot: 'secondary' },
    ],
  },

  // ---- Armor (unchanged) ----------------------------------------
  leather_vest: {
    type: 'armor',
    name: 'Leather Vest',
    image: 'item_armor',
    stats: { defense: 1 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },
  chain_mail: {
    type: 'armor',
    name: 'Chain Mail',
    image: 'item_armor',
    stats: { defense: 2 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },
  padded_robe: {
    type: 'armor', name: 'Padded Robe', image: 'item_armor',
    stats: { defense: 1, intelligence: 1 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },
  studded_leather: {
    type: 'armor', name: 'Studded Leather', image: 'item_armor',
    stats: { defense: 2, agility: 1 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },
  plate_mail: {
    type: 'armor', name: 'Plate Mail', image: 'item_armor',
    stats: { defense: 4, agility: -1 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },
  mage_robe: {
    // Tag-specific resistance keys map directly onto computeResistance
    // — equipping this adds +5% fire reduction in the damage formula.
    type: 'armor', name: 'Mage Robe', image: 'item_armor',
    stats: { defense: 1, intelligence: 2, fire: 0.05 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },
  holy_vestment: {
    type: 'armor', name: 'Holy Vestment', image: 'item_armor',
    stats: { defense: 2, resolve: 2 },
    skills: [{ id: 'guard', slot: 'defensive' }],
  },

  // ---- Helmets --------------------------------------------------
  iron_helm:     { type: 'helmet',    name: 'Iron Helm',        image: 'item_helmet',    stats: { defense: 1 } },
  leather_cap:   { type: 'helmet',    name: 'Leather Cap',      image: 'item_helmet',    stats: { maxHp: 2 } },
  cloth_hood: {
    type: 'helmet', name: 'Cloth Hood', image: 'item_helmet',
    stats: { maxHp: 1, intelligence: 1 },
  },
  bronze_helm: {
    type: 'helmet', name: 'Bronze Helm', image: 'item_helmet',
    stats: { defense: 1, resolve: 1 },
  },
  mage_hat: {
    type: 'helmet', name: 'Mage Hat', image: 'item_helmet',
    stats: { intelligence: 2, fire: 0.05 },
  },
  crusader_helm: {
    type: 'helmet', name: 'Crusader Helm', image: 'item_helmet',
    stats: { defense: 2, maxHp: 2 },
  },

  // ---- Accessories ----------------------------------------------
  lucky_charm:   { type: 'accessory', name: 'Lucky Charm',      image: 'item_accessory', stats: { maxHp: 1 } },
  ring_strength: { type: 'accessory', name: 'Ring of Strength', image: 'item_accessory', stats: { damage: 1 } },
  ring_vigor: {
    type: 'accessory', name: 'Ring of Vigor', image: 'item_accessory',
    stats: { maxHp: 3 },
  },
  amulet_wisdom: {
    type: 'accessory', name: 'Amulet of Wisdom', image: 'item_accessory',
    stats: { intelligence: 2 },
  },
  ring_iron_will: {
    type: 'accessory', name: 'Ring of Iron Will', image: 'item_accessory',
    // Previously had a `magic: 0.10` resistance that became dead
    // data when MAGIC stopped being a damage type. Rolled into
    // extra Resolve so the ring still carries a defensive feel.
    stats: { resolve: 4 },
  },
  cloak_bear: {
    type: 'accessory', name: 'Cloak of the Bear', image: 'item_accessory',
    stats: { strength: 1, resolve: 1, physical: 0.05 },
  },
  talisman_flame: {
    // Tradeoff item — strong fire defense at the cost of cold.
    type: 'accessory', name: 'Talisman of Flame', image: 'item_accessory',
    stats: { intelligence: 1, fire: 0.15, cold: -0.10 },
  },
};

// Builds a fresh item from an ITEMS key. Used by the scene to apply
// starting equipment from PARTY_TEMPLATES — runtime drops go through
// the procedural generator in item-generator.js, so this catalogue is
// purely for named/starting items.
export function makeItem(itemKey) {
  const tpl = ITEMS[itemKey];
  if (!tpl) throw new Error('Unknown item: ' + itemKey);
  return cloneItem(tpl);
}

function cloneItem(tpl) {
  const out = {
    type: tpl.type,
    name: tpl.name,
    image: tpl.image,
    stats: { ...tpl.stats },
  };
  if (tpl.skills) out.skills = tpl.skills.map((s) => ({ ...s }));
  return out;
}
