// Inventory + equipment data model.
//
// Two distinct concepts:
//
//   - Equipment lives PER CHARACTER. Four slots: weapon, armor,
//     helmet, accessory. Each holds 0 or 1 item. The scene reads
//     `character.equipment` directly and computes bonuses via
//     equipmentBonus(character.equipment, stat).
//
//   - The shared inventory is a single object owned by the scene. It
//     holds up to MAX_INVENTORY items in fixed-size slots (index ↔
//     visual cell). Empty slots are null. Chest pickups add to the
//     first empty slot; the character sheet's drag-and-drop moves
//     items between this and the per-character equipment.

export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'helmet', 'accessory'];
export const MAX_INVENTORY = 12;

export function makeEquipment() {
  const e = {};
  for (const slot of EQUIPMENT_SLOTS) e[slot] = null;
  return e;
}

export function makeSharedInventory() {
  return { items: new Array(MAX_INVENTORY).fill(null) };
}

// Adds an item to the first empty slot. Returns true if it fit,
// false if every slot was already taken (caller should leave the
// pickup on the ground in that case).
export function addToInventory(inventory, item) {
  for (let i = 0; i < inventory.items.length; i++) {
    if (inventory.items[i] === null) {
      inventory.items[i] = item;
      return true;
    }
  }
  return false;
}

export function countItems(inventory) {
  let n = 0;
  for (const it of inventory.items) if (it) n++;
  return n;
}

// Sums a single stat across every slot of an equipment set. Missing
// stat keys are treated as zero so items can specialise on whatever
// they want.
export function equipmentBonus(equipment, stat) {
  let total = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipment[slot];
    if (item && item.stats && item.stats[stat]) total += item.stats[stat];
  }
  return total;
}
