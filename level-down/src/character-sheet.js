// Two panels driven by this module:
//   #attributes-sheet (C key, read-only): Stats + Resistances per
//   character.
//   #inventory-sheet (I key, interactive): Personality sliders,
//   Skills, Equipment, shared Inventory grid, Trash slot.
// They're mutually exclusive — opening one closes the other.
//
// DOM contract (defined in game-starter.html):
//   - Attributes panel
//     - Stat rows: #stat-{name}-{i} → .stat-value
//     - Resistance grid container: #resistances-{i}
//   - Inventory panel
//     - Personality sliders: #pref-dist-{i}, #flee-hp-{i}
//     - Skill list container: #skills-{i}
//     - Equipment slot containers: #slot-{slotName}-{i}
//     - Inventory grid: #inventory-grid (12 cells built at runtime)
//     - Inventory count: #inventory-count
//     - Trash drop: #trash-slot (data-target-type="trash")
//
// Drag-and-drop / hover-tooltip listeners are attached to the
// inventory panel only — items don't live anywhere else.

import {
  EQUIPMENT_SLOTS, MAX_INVENTORY, equipmentBonus, countItems,
} from './inventory.js';
import { TILES, PACK, assetPath } from './assets.js';
import {
  ALL_TAGS, TAG_DISPLAY, SCALING_TAGS, applyDamageFormula,
  effectiveStat, RESOLVE_RES_PER_TAG, DEFENSE_RES_PER_TAG,
  AGILITY_ATTACK_SPEED_PER_POINT,
} from './tags.js';
import { SKILLS } from './skills.js';
import { isPercentKey, itemRarity } from './item-generator.js';

const TAG_SET = new Set(ALL_TAGS);

// Tag → display label, derived once from TAG_DISPLAY so the canonical
// order is owned by tags.js.
const TAG_LABELS = Object.fromEntries(TAG_DISPLAY.map((t) => [t.tag, t.label]));

// Stat keys in display order. Should mirror STAT_NAMES in scene.js.
const STAT_NAMES = ['strength', 'agility', 'intelligence', 'resolve'];

const sheets = {
  attributes: { panel: null, open: false },
  inventory:  { panel: null, open: false },
};

let partyRef = null;
let sharedInvRef = null;
let sceneRef = null;
let onEquipChange = null;
let initialized = false;
let tooltipEl = null;

export function initCharacterSheets(party, sharedInventory, opts = {}) {
  partyRef = party;
  sharedInvRef = sharedInventory;
  // Scene ref lets the sheet read scoreMulti / scoreMultiHistory for
  // the Score Multiplier panel, and call back into
  // applyScoreMultiChange when items are fed to the demon.
  sceneRef = opts.scene || null;
  onEquipChange = opts.onEquipChange || (() => {});
  if (!initialized) {
    sheets.attributes.panel = document.getElementById('attributes-sheet');
    sheets.inventory.panel = document.getElementById('inventory-sheet');
    party.forEach((char, i) => wireCharacterSliders(char, i));
    setupDragAndDrop();
    initialized = true;
  }
  refreshAll();
}

export function toggleAttributesSheet() { toggleSheet('attributes'); }
export function toggleInventorySheet()  { toggleSheet('inventory');  }
export function isAttributesSheetOpen() { return sheets.attributes.open; }
export function isInventorySheetOpen()  { return sheets.inventory.open;  }
export function isAnySheetOpen() {
  return sheets.attributes.open || sheets.inventory.open;
}

// Re-render slots + inventory text. The scene calls this after a
// chest pickup so the inventory panel reflects the new item even
// when it's closed.
export function refreshEquipment() {
  if (!partyRef) return;
  refreshAll();
}

function toggleSheet(which) {
  const other = which === 'attributes' ? 'inventory' : 'attributes';
  if (sheets[other].open) setSheetOpen(other, false);
  setSheetOpen(which, !sheets[which].open);
}

function setSheetOpen(which, value) {
  sheets[which].open = value;
  const p = sheets[which].panel;
  if (p) p.classList.toggle('open', value);
  // Always refresh on open — if chests were picked up or gear changed
  // while the sheet was closed, the DOM is stale until we re-render.
  if (value) refreshAll();
  // Hide any hover tooltip when closing so it doesn't linger over the
  // canvas.
  if (!value && tooltipEl) tooltipEl.classList.remove('visible');
}

function refreshAll() {
  refreshHeroNames();
  refreshScoreMulti();
  refreshStats();
  refreshResistances();
  refreshSkillList();
  refreshEquipmentSlots();
  refreshInventoryGrid();
  refreshStatsSummary();
}

// Aggregated breakdown for the Score Multiplier panel. Source keys
// drive the row order + label; the row only appears if the player
// has triggered that source at least once. Keys mirror the strings
// scene.applyScoreMultiChange passes as its third argument.
const SCORE_MULTI_GROUPS = [
  { source: 'level_down', label: 'LEVEL DOWN choices' },
  { source: 'level_up',   label: 'Level UP choices'   },
  { source: 'feed',       label: 'Fed the Demon'      },
  { source: 'revive',     label: 'Revives'            },
];

// Updates the Score Multiplier panel at the top of the attributes
// sheet — the big headline number plus an aggregated breakdown of
// every source of change this run. Called by refreshAll on sheet
// open and by scene.applyScoreMultiChange whenever the multi mutates.
//
// Rendering bundles entries by their `source` field instead of
// listing every tick: one row for all LEVEL DOWN choices, one for
// all Level UP choices, one for all Feed-the-Demon drops, one for
// all Revives. Each row shows the summed delta and a count, so the
// player can read the run's history at a glance even after dozens
// of items have been fed to the demon.
export function refreshScoreMulti() {
  const valEl = document.getElementById('score-multi-value');
  const histEl = document.getElementById('score-multi-history');
  if (!valEl || !histEl) return;
  const multi = sceneRef ? sceneRef.scoreMulti : 1.0;
  valEl.textContent = (multi || 0).toFixed(2) + '×';
  histEl.innerHTML = '';
  const history = (sceneRef && sceneRef.scoreMultiHistory) || [];
  if (history.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = '(no changes yet)';
    histEl.appendChild(li);
    return;
  }
  // Sum deltas and count occurrences per source.
  const totals = new Map();
  for (const entry of history) {
    const src = entry.source || 'other';
    const prev = totals.get(src) || { total: 0, count: 0 };
    prev.total += entry.delta;
    prev.count += 1;
    totals.set(src, prev);
  }
  // Render in the canonical row order from SCORE_MULTI_GROUPS,
  // skipping any source the player hasn't triggered yet.
  for (const group of SCORE_MULTI_GROUPS) {
    const data = totals.get(group.source);
    if (!data) continue;
    appendBreakdownRow(histEl, data.total, data.count, group.label);
  }
}

function appendBreakdownRow(parent, total, count, label) {
  const li = document.createElement('li');
  li.className = total >= 0 ? 'gain' : 'loss';
  const deltaSpan = document.createElement('span');
  deltaSpan.className = 'delta';
  const sign = total >= 0 ? '+' : '−';
  deltaSpan.textContent = `${sign}${Math.abs(total).toFixed(2)}×`;
  const labelSpan = document.createElement('span');
  labelSpan.className = 'label';
  labelSpan.textContent = `${label} (×${count})`;
  li.appendChild(deltaSpan);
  li.appendChild(labelSpan);
  parent.appendChild(li);
}

// Writes each character's chosen hero name into the H3 header of
// both sheets (attributes #hero-name-N, inventory #hero-name-inv-N).
// Falls back to the class role if no name was supplied — keeps the
// panel readable when someone bypasses the menu's name fields.
function refreshHeroNames() {
  partyRef.forEach((char, i) => {
    const name = char.heroName || char.role || char.label || `Hero ${i + 1}`;
    const attrEl = document.getElementById(`hero-name-${i}`);
    const invEl = document.getElementById(`hero-name-inv-${i}`);
    if (attrEl) attrEl.textContent = name;
    if (invEl) invEl.textContent = name;
  });
}

// Renders each character's active skills (the ones currently in
// `skillKeys`, derived from default + equipment grants). Each skill
// renders as a card with:
//   - Name + headline number (damage / heal / buff)
//   - Tag badge row (Physical, Fire, Magic, etc.)
//   - One line per contributing source — base, weapon, per-tag stat
//     scaling, per-tag flat gear damage — so the player can see
//     exactly where the headline number came from.
function refreshSkillList() {
  partyRef.forEach((char, i) => {
    const list = document.getElementById(`skills-detail-${i}`);
    if (!list) return;
    list.innerHTML = '';
    const keys = char.skillKeys || [];
    if (keys.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'skill-empty';
      empty.textContent = '(no skills equipped)';
      list.appendChild(empty);
      return;
    }
    for (const key of keys) {
      const skill = SKILLS[key];
      if (!skill) continue;
      list.appendChild(buildSkillCard(skill, char));
    }
  });
}

// Builds one skill card. Branches on skill kind:
//   damage skill  → headline = effective damage, breakdown of sources
//   heal skill    → headline = effective heal, base + INT scaling
//   buff skill    → headline = stat bonuses + duration
// Falls back to a tag-only card for tag-only utility skills.
function buildSkillCard(skill, character) {
  const card = document.createElement('div');
  card.className = 'skill-card';

  const header = document.createElement('div');
  header.className = 'skill-card-header';
  const nameEl = document.createElement('span');
  nameEl.className = 'skill-name';
  nameEl.textContent = skill.name;
  header.appendChild(nameEl);

  const totalEl = document.createElement('span');
  totalEl.className = 'skill-total';

  const lines = [];
  if (typeof skill.damage === 'number') {
    const { dps, contributions } = computeDamageBreakdown(skill, character);
    totalEl.textContent = dps.toFixed(1) + ' DPS';
    lines.push(...contributions);
  } else if (typeof skill.healing === 'number') {
    totalEl.classList.add('heal');
    const { hps, contributions } = computeHealBreakdown(skill, character);
    totalEl.textContent = hps.toFixed(1) + ' HPS';
    lines.push(...contributions);
  } else if (skill.buff) {
    totalEl.classList.add('buff');
    const parts = [];
    for (const stat in skill.buff.stats) {
      parts.push('+' + skill.buff.stats[stat] + ' ' + statLabel(stat));
    }
    const seconds = (skill.buff.durationMs / 1000).toFixed(1).replace(/\.0$/, '');
    totalEl.textContent = parts.join(' ') + ' · ' + seconds + 's';
    // Show cooldown alongside the buff so the player can see how
    // often they'll get it back.
    const cdMs = effectiveCooldownMs(skill, character);
    lines.push(`Cooldown ${(cdMs / 1000).toFixed(2)}s`);
  } else {
    totalEl.textContent = '—';
    // Pure-utility skill (no damage, heal, or buff) — show cooldown
    // alone since it's the only thing varying with gear.
    const cdMs = effectiveCooldownMs(skill, character);
    if (cdMs > 0) lines.push(`Cooldown ${(cdMs / 1000).toFixed(2)}s`);
  }
  header.appendChild(totalEl);
  card.appendChild(header);

  if (skill.tags && skill.tags.length) {
    const tagsRow = document.createElement('div');
    tagsRow.className = 'skill-card-tags';
    for (const tag of skill.tags) {
      const badge = document.createElement('span');
      badge.className = 'tag-badge';
      badge.textContent = TAG_LABELS[tag] || tag;
      tagsRow.appendChild(badge);
    }
    card.appendChild(tagsRow);
  }

  for (const line of lines) {
    const lineEl = document.createElement('div');
    lineEl.className = 'skill-card-line';
    // line can be a plain string or an array of fragments; arrays let
    // us highlight tag names mid-sentence without manual HTML
    // assembly.
    if (Array.isArray(line)) {
      for (const frag of line) {
        if (typeof frag === 'string') {
          lineEl.appendChild(document.createTextNode(frag));
        } else {
          const span = document.createElement('span');
          span.className = frag.cls || '';
          span.textContent = frag.text;
          lineEl.appendChild(span);
        }
      }
    } else {
      lineEl.textContent = line;
    }
    card.appendChild(lineEl);
  }

  return card;
}

// Returns { dps, perHit, cdMs, contributions } for a damage skill
// against a no-resistance target — i.e. the headline number the
// player would see on a dummy.
//
// DPS = perHit × 1000 / effectiveCooldownMs, where the cooldown
// includes both gear `attack_speed` and Agility's per-point bonus
// (mirrors scene.updateCharacterSkills exactly so the panel can't
// drift from what combat actually deals).
//
// `contributions` is an ordered list of lines for the card body.
function computeDamageBreakdown(skill, character) {
  const weaponBonus = character ? equipmentBonus(character.equipment, 'damage') : 0;
  const base = (skill.damage || 0) + weaponBonus;
  const perHit = applyDamageFormula(base, skill.tags, character, null);
  const cdMs = effectiveCooldownMs(skill, character);
  const dps = cdMs > 0 ? perHit * 1000 / cdMs : 0;

  const contributions = [];
  if (weaponBonus > 0) {
    contributions.push(`base ${skill.damage} + weapon ${weaponBonus}`);
  } else {
    contributions.push(`base ${skill.damage}`);
  }
  // Per-tag stat scaling. The SCALING_TAGS map drives this — same
  // source the damage formula uses, so the breakdown can't drift
  // out of sync with the actual hit.
  for (const tag of skill.tags || []) {
    const scaling = SCALING_TAGS[tag];
    if (!scaling) continue;
    const stat = effectiveStat(character, scaling.stat);
    const amount = stat * scaling.perPoint;
    if (amount <= 0) continue;
    contributions.push([
      `+${formatNumber(amount)} from ${statShortLabel(scaling.stat)} (`,
      { text: TAG_LABELS[tag] || tag, cls: 'skill-contrib-tag' },
      ` scaling)`,
    ]);
  }
  // Per-tag flat gear damage. dmg_<tag> bonuses add unconditionally
  // and also extend the effective tag set (see tags.js
  // applyDamageFormula). We list them here so the player sees the
  // extra fire damage on their sword.
  if (character) {
    for (const tag of ALL_TAGS) {
      const bonus = equipmentBonus(character.equipment, 'dmg_' + tag);
      if (bonus <= 0) continue;
      contributions.push([
        `+${bonus} `,
        { text: TAG_LABELS[tag] || tag, cls: 'skill-contrib-tag' },
        ` (gear)`,
      ]);
    }
  }
  // Final summary line so the player can see both the per-hit
  // total (final rounded number after the formula) and the
  // effective cooldown that produced the DPS in the header.
  contributions.push(
    `= ${perHit} per hit · cooldown ${(cdMs / 1000).toFixed(2)}s`,
  );
  return { dps, perHit, cdMs, contributions };
}

function computeHealBreakdown(skill, character) {
  // Same scaling coefficient as magic damage; mirrors scene.healAlly.
  const PER_INT = 0.2;
  const base = skill.healing;
  const intVal = effectiveStat(character, 'intelligence');
  const intContribution = intVal * PER_INT;
  const perCast = Math.max(1, Math.round(base + intContribution));
  const cdMs = effectiveCooldownMs(skill, character);
  const hps = cdMs > 0 ? perCast * 1000 / cdMs : 0;
  const contributions = [`base ${base}`];
  if (intContribution > 0) {
    contributions.push(`+${formatNumber(intContribution)} from INT scaling`);
  }
  contributions.push(
    `= ${perCast} per heal · cooldown ${(cdMs / 1000).toFixed(2)}s`,
  );
  return { hps, perCast, cdMs, contributions };
}

// Mirrors the cooldown calculation in scene.updateCharacterSkills:
// gear `attack_speed` plus Agility's per-point contribution shrink
// the base cooldown by a factor of 1 / (1 + total bonus). Keep this
// in sync with the scene if either formula changes.
function effectiveCooldownMs(skill, character) {
  const base = skill.cooldownMs || 0;
  if (!character) return base;
  const gearAtkSpeed = equipmentBonus(character.equipment, 'attack_speed');
  const agi = effectiveStat(character, 'agility');
  const agiBonus = agi * AGILITY_ATTACK_SPEED_PER_POINT;
  const totalBonus = gearAtkSpeed + agiBonus;
  // Floor the denominator at a tiny positive number so a heavy
  // negative agility roll (-1 from a warhammer with -10 AGI) can't
  // flip the cooldown into the negatives.
  const scale = 1 / Math.max(0.1, 1 + totalBonus);
  return base * scale;
}

// Single-decimal display, but drop the .0 for clean integers
// (so STR scaling shows as "+1" rather than "+1.0", but partial
// values still get a decimal like "+0.6").
function formatNumber(n) {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function statShortLabel(stat) {
  if (stat === 'damage') return 'DMG';
  if (stat === 'defense') return 'DEF';
  if (stat === 'maxHp') return 'HP';
  return stat.slice(0, 3).toUpperCase();
}

// Build the per-character resistances grid the first time, then keep
// it in sync with character.resistances on subsequent refreshes.
function refreshResistances() {
  partyRef.forEach((char, i) => {
    const grid = document.getElementById(`resistances-${i}`);
    if (!grid) return;
    if (grid.children.length !== TAG_DISPLAY.length) {
      grid.innerHTML = '';
      for (const { tag, short, label } of TAG_DISPLAY) {
        const cell = document.createElement('div');
        cell.className = 'resistance-cell';
        cell.title = label; // hover for full name
        cell.dataset.tag = tag;
        cell.innerHTML =
          `<span class="resistance-label">${short}</span>` +
          `<span class="resistance-value">0%</span>`;
        grid.appendChild(cell);
      }
    }
    // Display effective per-tag resistance: class baseline + Resolve
    // (base + gear) * RESOLVE_RES_PER_TAG + gear Defense *
    // DEFENSE_RES_PER_TAG + tag-specific gear bonus. Matches what the
    // damage formula in tags.js uses, so the listed % is what an
    // incoming single-tag attack of that type would actually be
    // reduced by.
    const resistances = char.resistances || {};
    const resolve = effectiveStat(char, 'resolve');
    const defense = char.equipment ? equipmentBonus(char.equipment, 'defense') : 0;
    const perTagBonus = resolve * RESOLVE_RES_PER_TAG
      + defense * DEFENSE_RES_PER_TAG;
    for (const cell of grid.children) {
      const tag = cell.dataset.tag;
      const base = Number(resistances[tag] || 0);
      const itemBonus = char.equipment ? equipmentBonus(char.equipment, tag) : 0;
      const total = base + perTagBonus + itemBonus;
      const valueEl = cell.querySelector('.resistance-value');
      const pct = Math.round(total * 100);
      valueEl.textContent = (pct > 0 ? '+' : '') + pct + '%';
      valueEl.classList.toggle('positive', pct > 0);
      valueEl.classList.toggle('negative', pct < 0);
    }
  });
}

function refreshStats() {
  partyRef.forEach((char, i) => {
    if (!char.stats) return;
    for (const stat of STAT_NAMES) {
      const el = document.querySelector(`#stat-${stat}-${i} .stat-value`);
      if (!el) continue;
      // Effective value includes any gear bonus to this stat key.
      const total = effectiveStat(char, stat);
      el.textContent = String(total);
    }
  });
}

function refreshEquipmentSlots() {
  partyRef.forEach((char, i) => {
    for (const slot of EQUIPMENT_SLOTS) {
      const el = document.getElementById(`slot-${slot}-${i}`);
      if (el) renderContainer(el, char.equipment[slot]);
    }
  });
}

function refreshInventoryGrid() {
  const grid = document.getElementById('inventory-grid');
  if (!grid) return;
  // First call only — build the cells once and reuse them.
  if (grid.children.length !== MAX_INVENTORY) {
    grid.innerHTML = '';
    for (let i = 0; i < MAX_INVENTORY; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell drop-target';
      cell.dataset.targetType = 'inv';
      cell.dataset.targetInv = String(i);
      grid.appendChild(cell);
    }
  }
  for (let i = 0; i < MAX_INVENTORY; i++) {
    renderContainer(grid.children[i], sharedInvRef.items[i]);
  }
  const countEl = document.getElementById('inventory-count');
  if (countEl) countEl.textContent = `${countItems(sharedInvRef)}/${MAX_INVENTORY}`;
}

function refreshStatsSummary() {
  partyRef.forEach((char, i) => {
    const el = document.getElementById(`stats-summary-${i}`);
    if (!el) return;
    const dmg = equipmentBonus(char.equipment, 'damage');
    const def = equipmentBonus(char.equipment, 'defense');
    const maxHpBonus = equipmentBonus(char.equipment, 'maxHp');
    const parts = [];
    if (dmg) parts.push(`+${dmg} dmg`);
    if (def) parts.push(`+${def} def`);
    if (maxHpBonus) parts.push(`+${maxHpBonus} HP`);
    el.textContent = parts.length ? parts.join(' · ') : 'no bonuses';
  });
}

// Replace the item card (if any) inside a container with one
// representing the new item. Cards show only icon + name; the full
// stat block is shown in a hover tooltip (see tooltip handlers).
//
// The card carries a rarity-N class (1–5) driven by modifier count.
// CSS in game-starter.html maps that class onto the name colour and
// the card border so the inventory grid reads as a quick-scan rarity
// chart: white → light blue → yellow → purple → orange.
function renderContainer(container, item) {
  for (const card of [...container.querySelectorAll('.item-card')]) card.remove();
  if (!item) return;
  const card = document.createElement('div');
  card.className = `item-card rarity-${itemRarity(item)}`;
  card.draggable = true;
  const iconSrc = imagePathFor(item);
  card.innerHTML =
    (iconSrc ? `<img class="item-icon" src="${iconSrc}" alt="" />` : '') +
    `<div class="item-name">${escapeHtml(item.name)}</div>`;
  container.appendChild(card);
}


// Resolve an item's `image` key into a URL the browser can fetch.
// Falls back to null when the key isn't in TILES — caller renders
// text-only in that case.
function imagePathFor(item) {
  if (!item || !item.image) return null;
  const num = TILES[item.image];
  const pack = PACK[item.image];
  if (num === undefined || !pack) return null;
  return assetPath(pack, num);
}

// Long-form stat label for skill descriptions (e.g. "+3 def for 4s").
// Used by the buff-skill description path in buildSkillCard.
function statLabel(k) {
  if (k === 'damage') return 'dmg';
  if (k === 'defense') return 'def';
  if (k === 'maxHp') return 'HP';
  return k;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---- personality sliders --------------------------------

function wireCharacterSliders(char, i) {
  wireSlider(
    `pref-dist-${i}`,
    char.personality, 'preferredDistance',
    1, (v) => `${v} px`,
    char.personality.preferredDistance,
  );
  wireSlider(
    `flee-hp-${i}`,
    char.personality, 'fleeAtHpFraction',
    0.01, (v) => `${Math.round(v * 100)} %`,
    char.personality.fleeAtHpFraction * 100,
  );
}

function wireSlider(id, obj, prop, multiplier, formatter, initialSliderValue) {
  const slider = document.getElementById(id);
  const label = document.getElementById(id + '-value');
  if (!slider || !label) return;
  if (typeof initialSliderValue === 'number') {
    slider.value = String(Math.round(initialSliderValue));
  }
  const sync = () => {
    const v = Number(slider.value) * multiplier;
    obj[prop] = v;
    label.textContent = formatter(v);
  };
  slider.addEventListener('input', sync);
  sync();
}

// ---- drag-and-drop ----------------------------------------

function setupDragAndDrop() {
  // Drag/drop + tooltip listeners go on the inventory panel — items
  // only live there now (the attributes panel is read-only).
  const inv = sheets.inventory.panel;
  if (!inv) return;
  inv.addEventListener('dragstart', onDragStart);
  inv.addEventListener('dragend', onDragEnd);
  inv.addEventListener('dragover', onDragOver);
  inv.addEventListener('dragleave', onDragLeave);
  inv.addEventListener('drop', onDrop);

  // Item tooltip is a single fixed-position element living on body
  // and toggled via .visible. mouseover/mousemove/mouseout are
  // delegated from the panel so we don't need per-card listeners.
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'item-tooltip';
  document.body.appendChild(tooltipEl);
  inv.addEventListener('mouseover', onItemHover);
  inv.addEventListener('mousemove', onItemMove);
  inv.addEventListener('mouseout', onItemLeave);
}

function onItemHover(e) {
  const card = e.target.closest('.item-card');
  if (!card) return;
  const container = card.parentElement;
  if (!container || !container.dataset.targetType) return;
  const item = resolveItem(container.dataset);
  if (!item) return;
  tooltipEl.innerHTML = formatItemTooltip(item);
  tooltipEl.classList.add('visible');
  positionTooltip(e);
}

function onItemMove(e) {
  if (!tooltipEl || !tooltipEl.classList.contains('visible')) return;
  positionTooltip(e);
}

function onItemLeave(e) {
  if (!tooltipEl) return;
  const card = e.target.closest('.item-card');
  if (!card) return;
  // relatedTarget is null when leaving the window, or the element we
  // moved to. If it's still inside the same card, ignore — this is
  // just bubbling between the icon and the name span.
  if (e.relatedTarget && card.contains(e.relatedTarget)) return;
  tooltipEl.classList.remove('visible');
}

function positionTooltip(e) {
  // Place the tooltip down-right of the cursor; flip to fit if it
  // would overflow the viewport.
  const offset = 14;
  const w = tooltipEl.offsetWidth;
  const h = tooltipEl.offsetHeight;
  let x = e.clientX + offset;
  let y = e.clientY + offset;
  if (x + w > window.innerWidth - 8) x = e.clientX - offset - w;
  if (y + h > window.innerHeight - 8) y = e.clientY - offset - h;
  tooltipEl.style.left = Math.max(4, x) + 'px';
  tooltipEl.style.top = Math.max(4, y) + 'px';
}

// Builds the inner HTML of the item tooltip. Returns an HTML
// fragment string with name, type, stats list, and granted skills.
// Procgen items carry a `modifiers` array (with tier info) — we
// render that when present so the tier badge shows alongside each
// value. Static items fall back to a stats-only display.
function formatItemTooltip(item) {
  const parts = [];
  // Same rarity class as the inventory card so the tooltip title
  // matches the card colour the player just hovered.
  parts.push(`<div class="tt-name rarity-${itemRarity(item)}">${escapeHtml(item.name)}</div>`);
  parts.push(`<div class="tt-type">${escapeHtml(item.type)}</div>`);
  if (item.modifiers && item.modifiers.length) {
    for (const mod of item.modifiers) {
      const cls = mod.amount < 0 ? 'tt-stat negative' : 'tt-stat';
      parts.push(`<div class="${cls}">${formatModifierLine(mod)}</div>`);
    }
  } else if (item.stats) {
    for (const [k, v] of Object.entries(item.stats)) {
      if (v === 0) continue;
      const cls = v < 0 ? 'tt-stat negative' : 'tt-stat';
      parts.push(`<div class="${cls}">${formatItemStatLine(k, v)}</div>`);
    }
  }
  if (item.skills && item.skills.length) {
    for (const grant of item.skills) {
      const skill = SKILLS[grant.id];
      const name = skill ? skill.name : grant.id;
      parts.push(`<div class="tt-skill">↳ grants ${escapeHtml(name)}</div>`);
    }
  }
  return parts.join('');
}

function formatItemStatLine(key, value) {
  const sign = value >= 0 ? '+' : '';
  if (TAG_SET.has(key)) {
    return `${sign}${Math.round(value * 100)}% ${prettyStatLabel(key)} Res`;
  }
  return `${sign}${value} ${prettyStatLabel(key)}`;
}

function formatModifierLine(mod) {
  const sign = mod.amount >= 0 ? '+' : '';
  const amountStr = isPercentKey(mod.key)
    ? `${sign}${Math.round(mod.amount * 100)}%`
    : `${sign}${mod.amount}`;
  return `${amountStr} ${escapeHtml(mod.label)} <span class="tt-tier">T${mod.tier}</span>`;
}

function prettyStatLabel(key) {
  if (key === 'maxHp') return 'Max HP';
  if (key === 'damage') return 'Damage';
  if (key === 'defense') return 'Defense';
  if (key === 'attack_speed') return 'Attack Speed';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function onDragStart(e) {
  const card = e.target.closest('.item-card');
  if (!card) return;
  const container = card.parentElement;
  if (!container || !container.dataset.targetType) {
    e.preventDefault();
    return;
  }
  const srcItem = resolveItem(container.dataset);
  if (!srcItem) {
    e.preventDefault();
    return;
  }
  e.dataTransfer.setData('text/plain', JSON.stringify(container.dataset));
  e.dataTransfer.effectAllowed = 'move';
  card.classList.add('dragging');
  // Hide the hover tooltip — the drag visual is its own affordance.
  if (tooltipEl) tooltipEl.classList.remove('visible');
  // Light up the drop targets so the player can see at a glance
  // where the item fits and where it doesn't.
  document.querySelectorAll('.drop-target').forEach((el) => {
    if (isValidDrop(el.dataset, srcItem)) {
      el.classList.add('valid-drop');
    } else {
      el.classList.add('invalid-drop');
    }
  });
}

function onDragEnd() {
  clearDragHighlights();
}

function onDragOver(e) {
  const target = e.target.closest('.drop-target');
  if (!target) return;
  if (target.classList.contains('invalid-drop')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  target.classList.add('drag-over');
}

function onDragLeave(e) {
  const target = e.target.closest('.drop-target');
  if (!target) return;
  target.classList.remove('drag-over');
}

function onDrop(e) {
  const target = e.target.closest('.drop-target');
  if (!target) return;
  e.preventDefault();
  let srcData;
  try { srcData = JSON.parse(e.dataTransfer.getData('text/plain')); }
  catch (_err) { clearDragHighlights(); return; }
  performMove(srcData, target.dataset);
  // Order matters: onEquipChange recomputes derived state (skill keys,
  // max HP) BEFORE we render. If we re-rendered first, the panel
  // would draw with stale skillKeys until the next refresh trigger.
  onEquipChange();
  refreshAll();
  // dragend should fire after drop and clean up, but if the source
  // element was rebuilt by refreshAll the browser sometimes skips it.
  // Belt-and-suspenders clear here too.
  clearDragHighlights();
}

function clearDragHighlights() {
  document.querySelectorAll('.item-card.dragging')
    .forEach((el) => el.classList.remove('dragging'));
  document.querySelectorAll('.drop-target')
    .forEach((el) => el.classList.remove('invalid-drop', 'valid-drop', 'drag-over'));
}

function isValidDrop(targetData, srcItem) {
  if (!targetData || !targetData.targetType) return false;
  if (targetData.targetType === 'inv') return true; // bag accepts anything
  if (targetData.targetType === 'trash') return true; // discard accepts anything
  if (targetData.targetType === 'equip') return srcItem.type === targetData.targetSlot;
  return false;
}

function resolveItem(loc) {
  if (loc.targetType === 'equip') {
    const ch = partyRef[Number(loc.targetChar)];
    return ch ? ch.equipment[loc.targetSlot] : null;
  }
  if (loc.targetType === 'inv') {
    return sharedInvRef.items[Number(loc.targetInv)];
  }
  return null;
}

function setLocation(loc, item) {
  if (loc.targetType === 'equip') {
    const ch = partyRef[Number(loc.targetChar)];
    if (ch) ch.equipment[loc.targetSlot] = item;
  } else if (loc.targetType === 'inv') {
    sharedInvRef.items[Number(loc.targetInv)] = item;
  }
}

// Swap source and target. We do nothing if the swap would put an item
// of the wrong type into an equipment slot. Both endpoints get
// updated in one step so the bag and equipment stay consistent.
function performMove(srcData, tgtData) {
  if (sameLocation(srcData, tgtData)) return;
  const srcItem = resolveItem(srcData);
  if (!srcItem) return;
  // Validate the destination accepts this item.
  if (!isValidDrop(tgtData, srcItem)) return;
  // Trash is a one-way drop — source slot empties and nothing comes
  // back. The slot is themed as "Feed the Demon": each modifier tier
  // on the discarded item adds +0.01× to the run's Score Multiplier
  // (a Tier-4 + Tier-2 procgen sword feeds +0.06×). Static items
  // without modifiers feed nothing.
  if (tgtData.targetType === 'trash') {
    const tierSum = (srcItem.modifiers || [])
      .reduce((sum, m) => sum + (m.tier || 0), 0);
    const delta = tierSum * 0.01;
    if (delta > 0 && sceneRef && sceneRef.applyScoreMultiChange) {
      sceneRef.applyScoreMultiChange(
        delta, `Fed the Demon: ${srcItem.name}`, 'feed',
      );
    }
    setLocation(srcData, null);
    return;
  }
  const tgtItem = resolveItem(tgtData);
  // Validate that displacing the target item is legal (it would
  // land back in the source slot; if source is an equip slot, the
  // displaced item must match that source's type).
  if (tgtItem && srcData.targetType === 'equip' && tgtItem.type !== srcData.targetSlot) {
    return;
  }
  setLocation(tgtData, srcItem);
  setLocation(srcData, tgtItem);
}

function sameLocation(a, b) {
  return a.targetType === b.targetType
    && a.targetChar === b.targetChar
    && a.targetSlot === b.targetSlot
    && a.targetInv === b.targetInv;
}
