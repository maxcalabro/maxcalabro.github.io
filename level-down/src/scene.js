// The main game scene.
//
// Wrapped in a factory because `extends Phaser.Scene` is evaluated when
// the class declaration runs; we have to defer it until the Phaser CDN
// script has loaded.
//
// Multi-character model. The scene holds `this.party`, an array of
// character sprites. Each character owns its own personality, equipment,
// HP, skill cooldowns, stat block, wander/drift state, click moveTarget,
// and A* path. The scene owns shared resources: the world, walls,
// chests, enemies, shared inventory bag, pathfinding grid, click
// marker, party-progression counters (trueLevel / monstersKilled /
// mapLevel), score, and HUD chrome. Helpers like updateCharacterMovement
// take a character parameter so the same code path runs for every
// party member.

import {
  TILE, SRC_TILE, SCALE, PLAYER_SPEED,
  SIGHT_RANGE, ARRIVE_THRESHOLD, HITBOX_RATIO, DEPTH,
  MOVE_JITTER_PX, DRIFT_MAX, DRIFT_STEP, DRIFT_DECAY,
  PACE_MIN, PACE_MAX, PACE_STEP, PACE_DECAY,
  WANDER_MIN_DIST, WANDER_MAX_DIST, WANDER_MIN_REST, WANDER_MAX_REST,
  WANDER_GIVEUP_MS, WANDER_SPEED_FACTOR, POST_INTENT_REST,
  BUDDY_DISTANCE, PARTY_COLORS,
} from './config.js';
import { TILES, PACK, assetPath } from './assets.js';
import { makePersonality } from './personality.js';
import { SKILLS } from './skills.js';
import {
  makeEquipment, makeSharedInventory, addToInventory, equipmentBonus,
} from './inventory.js';
import { makeItem } from './items.js';
import { generateRandomItem, itemRarityColor } from './item-generator.js';
import { MONSTER_BY_MAP_CHAR, statsFor } from './monsters.js';
import { generateMap } from './map-generator.js';
import {
  TAGS, makeEmptyResistances, applyDamageFormula, RESOLVE_HP_PER_POINT,
  STRENGTH_HP_PER_POINT, effectiveStat, AGILITY_SPEED_PER_POINT,
  AGILITY_ATTACK_SPEED_PER_POINT,
} from './tags.js';
import {
  initCharacterSheets, toggleAttributesSheet, toggleInventorySheet,
  isAnySheetOpen, refreshEquipment, refreshScoreMulti,
} from './character-sheet.js';
import {
  worldToTile, tileToWorld, buildPassableGrid, isPassable,
  nearestWalkable, findPath,
} from './path.js';
import { toggleTileBrowser } from './tile-browser.js';
import {
  buildHud, updateHud, rebuildSkillIcons,
  updateFloatingHpBars, drawPersonalityRings,
  showItemPopup, showDamageNumber, showBuffPopup,
  showLevelCompleteMessage, showLevelUpMessage,
  showKillMessage, showLootMessage, showCharacterComment,
  showHitSpark,
} from './hud.js';
import { shuffledPersonas, pickComment } from './personas.js';

// Per-character spawn config. Defaults to two distinctly-flavored
// templates so the player can immediately feel the contrast between
// a melee bruiser and a ranged kiter.
// Per-class baseline resistances. Items will stack on top of these
// to drive the "resistance tuning" part of the strategy. Negative
// values are vulnerabilities — a Mage's frail body is easier to cut.
const KNIGHT_RESISTANCES = {
  [TAGS.PHYSICAL]: 0.10,   // armor training
  [TAGS.BLEEDING]: 0.10,   // tough skin
  [TAGS.MAGIC]:    -0.10,  // no magical training
};
const MAGE_RESISTANCES = {
  [TAGS.PHYSICAL]: -0.10,  // frail
  [TAGS.FIRE]:     0.10,   // fire affinity from spellcraft
  [TAGS.COLD]:     0.10,
  [TAGS.MAGIC]:    0.15,
};
const CLERIC_RESISTANCES = {
  [TAGS.MAGIC]:    0.15,   // attuned to magic in general
  [TAGS.FIRE]:     0.05,
  [TAGS.COLD]:     0.05,
  [TAGS.POISON]:   0.10,
};

// `statsPerLevel` is *both* the level-1 starting block and the
// per-level increment applied by levelUpParty. So a Knight at party
// level 3 has stats (3*3, 2*3, 1*3, 2*3) = (9, 6, 3, 6). This keeps
// class identity intact as the party grows — the Mage's Int lead over
// the Knight widens at every level.
const PARTY_TEMPLATES = [
  {
    label: 'A',
    role: 'Knight',
    spriteKey: 'player',
    statsPerLevel: { strength: 3, agility: 2, intelligence: 1, resolve: 2 },
    resistances: KNIGHT_RESISTANCES,
    startingEquipment: { weapon: 'iron_sword' },
    personalityOverrides: {
      preferredDistance: 8,
      fleeAtHpFraction: 0.2,
    },
  },
  {
    label: 'B',
    role: 'Mage',
    spriteKey: 'player_b',
    statsPerLevel: { strength: 1, agility: 2, intelligence: 3, resolve: 2 },
    resistances: MAGE_RESISTANCES,
    startingEquipment: { weapon: 'firebolt_staff' },
    personalityOverrides: {
      preferredDistance: 120,
      fleeAtHpFraction: 0.3,
    },
  },
  {
    label: 'C',
    role: 'Cleric',
    spriteKey: 'player_c',
    statsPerLevel: { strength: 1, agility: 1, intelligence: 3, resolve: 3 },
    resistances: CLERIC_RESISTANCES,
    startingEquipment: { weapon: 'healing_staff' },
    personalityOverrides: {
      // Sits in the middle distance — close enough to heal teammates,
      // far enough to stay out of melee.
      preferredDistance: 60,
      fleeAtHpFraction: 0.3,
    },
  },
];

// Skill slots. Each character keeps a map { slot: skillId|null }
// derived from defaults + equipped-item grants. SKILL_SLOTS sets the
// display order so the HUD and character sheet show skills in a
// consistent left-to-right sequence.
const SKILL_SLOTS = ['primary', 'secondary', 'defensive', 'utility', 'accessory'];

// Defaults that apply when no equipped item grants a skill in a
// given slot. Punch and Throw Rock are *unarmed* defaults: as soon as
// any weapon is equipped, BOTH are removed (see recomputeSkillsFor)
// — a sword-bearer doesn't also throw rocks. The defensive and
// utility slots stay open for armor / accessory grants.
const DEFAULT_SKILL_BY_SLOT = {
  primary:   'punch',
  secondary: 'throw_rock',
  defensive: null,
  utility:   null,
  accessory: null,
};

// In-place Fisher–Yates shuffle. Returned for chain-style use.
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Short label for a stat key (used in transient combat popups).
function statShortLabel(stat) {
  if (stat === 'damage') return 'DMG';
  if (stat === 'defense') return 'DEF';
  if (stat === 'maxHp') return 'HP';
  return stat.slice(0, 3).toUpperCase();
}

// Slab/AABB line-segment intersection. Returns the parametric
// position (0..1) along (x1,y1)→(x2,y2) where the line first enters
// the rectangle, or null if it doesn't enter inside the segment.
// Used by findFirstWallHit to detect projectiles passing through
// walls before any damage is applied.
function lineRectIntersection(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  if (dx !== 0) {
    const tx1 = (rx - x1) / dx;
    const tx2 = (rx + rw - x1) / dx;
    tmin = Math.max(tmin, Math.min(tx1, tx2));
    tmax = Math.min(tmax, Math.max(tx1, tx2));
  } else if (x1 < rx || x1 > rx + rw) {
    return null;
  }
  if (dy !== 0) {
    const ty1 = (ry - y1) / dy;
    const ty2 = (ry + rh - y1) / dy;
    tmin = Math.max(tmin, Math.min(ty1, ty2));
    tmax = Math.min(tmax, Math.max(ty1, ty2));
  } else if (y1 < ry || y1 > ry + rh) {
    return null;
  }
  if (tmin <= tmax && tmin >= 0 && tmin <= 1) return tmin;
  return null;
}

// Starting HP — same for every class. Class identity comes from the
// stat block (Knight = STR-heavy → extra HP via STRENGTH_HP_PER_POINT,
// Cleric = RES-heavy → extra HP via RESOLVE_HP_PER_POINT). Items can
// stack +maxHp on top via equipmentBonus.
const STARTING_HP = 10;

// HP awarded for each party-level above 1. Combined with the
// stat-driven HP (RES × RESOLVE_HP_PER_POINT, STR × STRENGTH_HP_PER_POINT)
// this means a Knight gains far more HP per level than a Mage —
// roughly +2 base + 0.5×3 STR + 1×2 RES = +5.5 HP/level for the
// Knight vs. +2 + 0.5×1 + 1×2 = +4.5 for the Mage.
const HP_PER_PARTY_LEVEL = 2;

// Party-progression curve. Level 1 → 2 costs 10 kills; each additional
// level adds 5 more to the requirement (so level 2 → 3 costs 15, then
// 20, 25, …). Cumulative kills to *reach* level N is the closed-form
// sum below — derived from the arithmetic series 10, 15, 20, …
//
// Example check:
//   cumulativeKillsForLevel(2) = 5*1*4/2 = 10   ✓
//   cumulativeKillsForLevel(3) = 5*2*5/2 = 25   ✓
//   cumulativeKillsForLevel(4) = 5*3*6/2 = 45   ✓
//   cumulativeKillsForLevel(5) = 5*4*7/2 = 70   ✓
export function cumulativeKillsForLevel(targetLevel) {
  if (targetLevel <= 1) return 0;
  return Math.floor(5 * (targetLevel - 1) * (targetLevel + 2) / 2);
}

export function makeGameScene(config) {
  // config: { mode, map, level }
  //   - mode: 'sandbox' (single map) | 'adventure' (multi-level procgen)
  //   - map:  the initial map data array
  //   - level: starting level number (1 for adventure)
  const init = config || {};
  return class extends Phaser.Scene {
    constructor() {
      super('GameScene');

      // Run config — captured by the factory and stored on the
      // instance so the rest of the scene reads from a clear name.
      this.mode = init.mode || 'sandbox';
      this.mapData = init.map;
      // Map level (dungeon depth). Adventure mode increments on every
      // cleared level. Read by monsters.statsFor for HP/damage scaling.
      this.mapLevel = init.level || 1;
      // Player-chosen hero names from the start menu, keyed by class
      // role. Empty object is a valid fallback (createCharacter falls
      // back to the template's role string in that case).
      this.heroNames = init.heroNames || {};
      // Party progression. Two separate "levels":
      //   - trueLevel: how many XP thresholds the party has crossed.
      //     Monotonically increasing. Drives the cumulativeKillsForLevel
      //     curve, so each subsequent level costs more kills regardless
      //     of how many LEVEL DOWN choices the player has made.
      //   - effectiveLevel: how many *stat-bearing* levels the party
      //     currently has. Each "Level UP" choice pushes it +1, each
      //     "LEVEL DOWN" pushes it −1. Drives every stat calculation
      //     (per-level HP, per-level stat increments, etc.) and can
      //     drop below 1 if the player keeps choosing LEVEL DOWN.
      // pendingLevelUps tracks earned-but-not-yet-resolved level-ups
      // so an AoE kill that pushes through multiple thresholds at
      // once produces one modal per threshold rather than collapsing.
      this.trueLevel = 1;
      this.effectiveLevel = 1;
      this.monstersKilled = 0;
      this.pendingLevelUps = 0;
      // Score: total points earned this run, multiplied by scoreMulti
      // at award time. scoreMultiHistory is a ledger of every gain /
      // loss applied — fed to the character sheet's Score Multiplier
      // panel so the player can see exactly where each tick came from.
      this.score = 0;
      this.scoreMulti = 1.0;
      this.scoreMultiHistory = [];
      // Set while a "LEVEL COMPLETED" sequence is in flight so we
      // don't trigger it twice if both the last enemy and the last
      // chest finish on the same frame.
      this.transitioning = false;
      // Modal pause flags. While either is true, update() returns
      // before running any gameplay tick — characters and enemies
      // are frozen and key shortcuts are suppressed.
      this.levelChoiceOpen = false;
      this.reviveModalOpen = false;

      // World refs (set in create)
      this.party = [];
      this.enemies = null;
      this.chests = null;
      this.walls = null;
      this.cameraTarget = null;

      // Input
      this.cursors = null;
      this.keys = null;

      // Shared visuals
      this.clickMarker = null;
      this.clickMarkerTween = null;

      // Shared party resources
      this.inventory = makeSharedInventory();

      // HUD elements
      this.inventoryText = null;
      this.scoreText = null;
      this.personalityRing = null;
      // Floating HP bars (party always; hovered enemy on hover) and
      // the hover-name labels. Created in buildHud.
      this.floatingHpBars = null;
      this.hoveredEnemyName = null;
      this.hoveredEnemy = null;
      this.hoveredCharacterName = null;
      this.hoveredCharacter = null;

      // Tile browser
      this.tileBrowserOn = false;
      this.tileBrowserContainer = null;
    }

    // ---- lifecycle ----------------------------------------

    preload() {
      for (const key in TILES) {
        this.load.image(key, assetPath(PACK[key], TILES[key]));
      }
      // Full ranges for the tile browser (debug only).
      for (let i = 0; i <= 131; i++) {
        this.load.image('town_' + i, assetPath('town', i));
        this.load.image('dungeon_' + i, assetPath('dungeon', i));
      }
      this.load.on('loaderror', (file) => console.warn('Failed to load:', file.src));
    }

    create() {
      this.buildMap();
      this.setupCollisions();
      this.setupInput();
      buildHud(this);
      this.personalityRing = this.add.graphics().setDepth(DEPTH.ring);

      // Camera follows an invisible zone we'll position at the party
      // midpoint every frame — keeps both characters in view as they
      // spread out.
      this.cameraTarget = this.add.zone(this.party[0].x, this.party[0].y, 1, 1);
      this.cameras.main.startFollow(this.cameraTarget, true, 0.15, 0.15);

      initCharacterSheets(this.party, this.inventory, {
        // Pass the scene so character-sheet.js can read scoreMulti /
        // scoreMultiHistory for the Score Multi panel and call back
        // into applyScoreMultiChange when items are fed to the demon.
        scene: this,
        onEquipChange: () => {
          this.party.forEach((c, i) => {
            this.recomputeSkillsFor(c);
            this.recalcCharacterStats(c);
            rebuildSkillIcons(this, c, i);
          });
        },
      });

      // Wire up the level-choice and revive modal buttons once.
      // Listeners are kept around for the lifetime of the scene —
      // the modals themselves are reused (shown / hidden via .open).
      const upBtn = document.getElementById('choice-level-up');
      const downBtn = document.getElementById('choice-level-down');
      if (upBtn)   upBtn.addEventListener('click', () => this.resolveLevelChoice('up'));
      if (downBtn) downBtn.addEventListener('click', () => this.resolveLevelChoice('down'));
      const continueBtn = document.getElementById('revive-continue');
      if (continueBtn) continueBtn.addEventListener('click', () => this.closeReviveModal());
    }

    update(time, delta) {
      // Hard pause: level-choice and revive modals freeze every
      // gameplay tick AND every key shortcut so the player can't
      // sneak inputs through. Re-zeroes velocities each frame so
      // anyone with leftover speed stops immediately.
      if (this.levelChoiceOpen || this.reviveModalOpen) {
        for (const c of this.party) if (c.active) c.setVelocity(0);
        if (this.enemies) this.enemies.children.iterate((e) => {
          if (e && e.body) e.setVelocity(0);
        });
        return;
      }

      if (Phaser.Input.Keyboard.JustDown(this.keys.B) && !isAnySheetOpen()) {
        toggleTileBrowser(this);
      }
      // C opens the read-only Attributes sheet (Stats + Resistances);
      // I opens the Inventory sheet (Personality, Skills, Equipment,
      // Inventory, Trash). They're mutually exclusive — opening one
      // closes the other.
      if (Phaser.Input.Keyboard.JustDown(this.keys.C) && !this.tileBrowserOn) {
        toggleAttributesSheet();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.I) && !this.tileBrowserOn) {
        toggleInventorySheet();
      }

      if (this.isModalOpen()) {
        for (const c of this.party) if (c.active) c.setVelocity(0);
        drawPersonalityRings(this);
        return;
      }

      for (const c of this.party) {
        if (!c.active) continue;
        this.updateCharacterMovement(c, time);
        this.updateCharacterSkills(c, time, delta);
      }
      this.tickPartySpeech(time);
      this.updateEnemies();
      this.updateCameraTarget();
      updateHud(this);
      updateFloatingHpBars(this);
      drawPersonalityRings(this);
    }

    isModalOpen() {
      return this.tileBrowserOn
        || isAnySheetOpen()
        || this.levelChoiceOpen
        || this.reviveModalOpen;
    }

    aliveParty() {
      return this.party.filter((c) => c.active);
    }

    // ---- map construction --------------------------------

    buildMap() {
      this.walls   = this.physics.add.staticGroup();
      this.chests  = this.physics.add.group();
      this.enemies = this.physics.add.group();
      // Plain images (ground tiles + decor like doors/torches) aren't
      // in any physics group, so we track them in a flat list and
      // tear them down when transitioning levels.
      this.groundTiles = [];

      const spawn = this.populateMapCells(this.mapData);

      // Pathfinding grid. Walls placed by populateMapCells live in
      // this.walls, but it's easier to derive the passable grid from
      // the map data directly — see path.js for the wall charset.
      this.passableGrid = buildPassableGrid(this.mapData);

      // Always spawn the full party from PARTY_TEMPLATES. The map's 'P'
      // marker sets the leader's spawn; subsequent members are placed
      // one tile to the right (and step further out if more land later).
      const baseX = (spawn.x !== null ? spawn.x : 2) * TILE + TILE / 2;
      const baseY = (spawn.y !== null ? spawn.y : 2) * TILE + TILE / 2;
      // Deal rainbow colours + personas without replacement so each
      // hero feels visually + tonally distinct. PARTY_COLORS has more
      // entries than the party so we shuffle and pick the first N.
      const colorPool = shuffleArray(PARTY_COLORS.slice()).slice(0, PARTY_TEMPLATES.length);
      const personaPool = shuffledPersonas().slice(0, PARTY_TEMPLATES.length);
      this.party = PARTY_TEMPLATES.map((tpl, i) =>
        this.createCharacter(
          baseX + i * TILE, baseY, tpl,
          colorPool[i], personaPool[i],
        ),
      );

      // Circular bodies for everything that needs to round corners.
      this.enemies.children.iterate((e) => { if (e) this.setCircleBody(e); });

      const W = this.mapData[0].length;
      const H = this.mapData.length;
      this.physics.world.setBounds(0, 0, W * TILE, H * TILE);
      this.cameras.main.setBounds(0, 0, W * TILE, H * TILE);
    }

    // Walks every cell of `map` and calls placeCell. Returns the
    // 'P' coordinate (or {x:null,y:null} if the map has no spawn).
    // Used both for the initial build and for level transitions.
    populateMapCells(map) {
      const W = map[0].length;
      const H = map.length;
      let spawnX = null, spawnY = null;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ch = map[y][x];
          if (ch === 'P') { spawnX = x; spawnY = y; }
          this.placeCell(ch, x, y);
        }
      }
      return { x: spawnX, y: spawnY };
    }

    // Destroys all level-scoped entities (walls, chests, enemies,
    // ground tiles) so loadLevel can repopulate. The groups
    // themselves stay alive so colliders/overlaps registered against
    // them continue to work for newly-spawned children.
    clearLevel() {
      if (this.groundTiles) {
        for (const t of this.groundTiles) {
          if (t && t.destroy) t.destroy();
        }
        this.groundTiles.length = 0;
      }
      if (this.walls) this.walls.clear(true, true);
      if (this.chests) this.chests.clear(true, true);
      if (this.enemies) this.enemies.clear(true, true);
      // The hovered-enemy reference is about to be destroyed along
      // with the rest of the enemy group — drop it so the next
      // updateFloatingHpBars doesn't try to read from a freed sprite.
      this.hoveredEnemy = null;
    }

    // Swaps in a new map without restarting the scene. The party stays
    // alive (HP, equipment, buffs, score all preserved) and is teleported
    // to the new spawn.
    loadLevel(mapData) {
      this.clearLevel();
      this.mapData = mapData;
      const spawn = this.populateMapCells(mapData);
      // Refresh the pathfinding grid for the new layout.
      this.passableGrid = buildPassableGrid(this.mapData);
      const baseX = (spawn.x !== null ? spawn.x : 2) * TILE + TILE / 2;
      const baseY = (spawn.y !== null ? spawn.y : 2) * TILE + TILE / 2;
      this.party.forEach((c, i) => {
        if (!c.active) return;
        c.setPosition(baseX + i * TILE, baseY);
        c.setVelocity(0);
        c.moveTarget = null;
        c.path = null;
        if (c.wander) { c.wander.target = null; c.wander.restUntil = 0; }
        c.castLockUntil = 0;
      });
      // Apply circle bodies to newly-spawned enemies.
      this.enemies.children.iterate((e) => { if (e) this.setCircleBody(e); });
      const W = mapData[0].length;
      const H = mapData.length;
      this.physics.world.setBounds(0, 0, W * TILE, H * TILE);
      this.cameras.main.setBounds(0, 0, W * TILE, H * TILE);
      // Reset transitioning so future clears can fire again.
      this.transitioning = false;
    }

    placeCell(ch, x, y) {
      // Ground layer.
      let groundKey;
      if ('F#~dft'.indexOf(ch) >= 0) {
        groundKey = (x + y) % 3 === 0 ? 'dun_floor_alt' : 'dun_floor';
      } else if (ch === '-') {
        groundKey = 'town_path';
      } else if (ch === 'f') {
        groundKey = 'dun_floor_alt';
      } else {
        groundKey = (x * 7 + y * 13) % 5 === 0 ? 'town_grass_alt' : 'town_grass';
      }
      this.placeImage(groundKey, x, y, DEPTH.ground);

      // Monster spawn (data-driven — see monsters.js).
      const monsterType = MONSTER_BY_MAP_CHAR[ch];
      if (monsterType) {
        this.placeMonster(monsterType, x, y);
        return;
      }

      // Static decor / walls.
      switch (ch) {
        case 'T': this.placePhys(this.walls, 'town_tree',       x, y, DEPTH.walls); break;
        case 'B': this.placePhys(this.walls, 'town_bush',       x, y, DEPTH.walls); break;
        case 'W': this.placePhys(this.walls, 'town_water',      x, y, DEPTH.walls); break;
        case 'H': this.placePhys(this.walls, 'town_house_wall', x, y, DEPTH.walls); break;
        case 'R': this.placePhys(this.walls, 'town_house_roof', x, y, DEPTH.walls); break;
        case 'D': this.placeImage('town_door', x, y, DEPTH.decor); break;
        case 'd': this.placeImage('dun_door',  x, y, DEPTH.decor); break;
        case '#': this.placePhys(this.walls, 'dun_wall',     x, y, DEPTH.walls); break;
        case '~': this.placePhys(this.walls, 'dun_wall_top', x, y, DEPTH.walls); break;
        case 't': this.placeImage('dun_torch', x, y, DEPTH.decor); break;
        case 'c': this.placeChest(x, y); break;
        // 'P' is handled in buildMap — the party always spawns from
        // PARTY_TEMPLATES with the P cell determining where.
      }
    }

    placeImage(key, tx, ty, depth = 0) {
      const s = this.add.image(tx * TILE + TILE/2, ty * TILE + TILE/2, key);
      s.setScale(SCALE);
      s.setDepth(depth);
      // Track for clearLevel — ground tiles and decor aren't in any
      // physics group, so we need this list to know what to tear down.
      if (this.groundTiles) this.groundTiles.push(s);
      return s;
    }

    placePhys(group, key, tx, ty, depth = 0) {
      const s = group.create(tx * TILE + TILE/2, ty * TILE + TILE/2, key);
      s.setScale(SCALE);
      s.setDepth(depth);
      if (s.refreshBody) s.refreshBody();
      return s;
    }

    placeChest(tx, ty) {
      // Walking near a chest fires the overlap handler in
      // setupCollisions → onCollectChest, which rolls a procgen item
      // and destroys the sprite. The body is enlarged into a
      // "pickup magnet" zone so the player doesn't have to step
      // exactly onto the chest tile to grab the loot.
      const c = this.placePhys(this.chests, 'chest', tx, ty, DEPTH.pickup);
      if (c && c.body) {
        // Source-pixel coords. Sprite source is SRC_TILE × SRC_TILE
        // (16×16); a 14-px radius gives an ~28-px world radius after
        // scaling, so the pickup triggers roughly a tile away from
        // the chest's centre. Offset so the circle stays centred.
        const r = 14;
        const off = (SRC_TILE / 2) - r;
        c.body.setCircle(r, off, off);
      }
      return c;
    }

    // Replaces a sprite's default rectangle physics body with a
    // centered circle. Used for the party and for monsters — circles
    // slide around tile corners instead of catching on them.
    setCircleBody(sprite) {
      const r = (SRC_TILE * HITBOX_RATIO) / 2;
      const offset = (SRC_TILE - 2 * r) / 2;
      sprite.body.setCircle(r, offset, offset);
    }

    placeMonster(typeKey, tx, ty) {
      // Resolve stats through monsters.statsFor so the level-scaling
      // hook is on the spawn path. Per-monster speed/aggroRange,
      // resistances, and attack tags live on the sprite so the damage
      // pipeline can read them uniformly with party members.
      const stats = statsFor(typeKey, this.mapLevel);
      const e = this.placePhys(this.enemies, stats.spriteKey, tx, ty, DEPTH.enemy);
      e.type = typeKey;
      e.displayName = stats.displayName || typeKey;
      e.hp = stats.hp;
      e.maxHp = stats.hp;
      e.dmg = stats.damage;
      e.speed = stats.speed;
      e.aggroRange = stats.aggroRange;
      e.resistances = stats.resistances;
      e.attackTags = stats.attackTags;
      e.points = stats.points || 1;
      e.dying = false;
      // Pathfinding state — enemies recompute toward the nearest
      // party member periodically, same data shape as party members.
      e.path = null;
      // Hover support: setInteractive enables Phaser's input system
      // to fire pointerover/pointerout when the cursor enters/leaves
      // the sprite's hit area. We just record/clear `hoveredEnemy`
      // here; updateFloatingHpBars consumes it each frame.
      e.setInteractive();
      e.on('pointerover', () => { this.hoveredEnemy = e; });
      e.on('pointerout', () => { if (this.hoveredEnemy === e) this.hoveredEnemy = null; });
      e.setCollideWorldBounds(true);
      return e;
    }

    createCharacter(x, y, template, color, persona) {
      const c = this.physics.add.sprite(x, y, template.spriteKey);
      c.setScale(SCALE);
      c.setDepth(DEPTH.player);
      c.setCollideWorldBounds(true);
      this.setCircleBody(c);

      // Identity. `heroName` is the player-chosen display name from
      // the start menu (keyed by class role); falls back to the role
      // string if no name was supplied. `role` is the class
      // ("Knight" / "Mage" / "Cleric"). `label` is the legacy slot
      // letter (A/B/C) still used by the HUD's skill-row label.
      c.label = template.label;
      c.role = template.role;
      c.heroName = (this.heroNames && this.heroNames[template.role]) || template.role;
      // Rainbow tint + hidden persona key, both dealt by buildMap.
      // Color drives the HP bar, hover label, and speech-bubble tint.
      // Persona drives the chatter system (see personas.js).
      c.color = color;
      c.persona = persona;
      // Speech timing. nextSpeakAt is the earliest time the character
      // is eligible to chime in with idle / order chatter; speakAs()
      // pushes it out by ~40–80 s to keep comments frequent enough to
      // give the party personality without becoming noise.
      c.nextSpeakAt = (this.time ? this.time.now : 0)
        + 8000 + Math.random() * 22000;
      // Active speech bubble (a Phaser Text) and its expiry — the
      // HUD repositions it each frame so it follows the character.
      c.speechBubble = null;

      // Hover support — pointerover / pointerout fire when the cursor
      // is over the sprite. Mirror the enemy hover pattern: store the
      // hovered character on the scene, let the HUD draw the name.
      c.setInteractive();
      c.on('pointerover', () => { this.hoveredCharacter = c; });
      c.on('pointerout', () => { if (this.hoveredCharacter === c) this.hoveredCharacter = null; });

      // Personality + equipment. The shared item bag lives on the
      // scene; equipment is per-character worn gear.
      c.personality = makePersonality(template.personalityOverrides);
      c.equipment = makeEquipment();

      // Movement / behaviour state
      c.facing = { x: 1, y: 0 };
      c.invuln = false;
      c.drift = 0;
      c.paceFactor = 1.0;
      c.wander = { target: null, restUntil: 0 };
      c.moveTarget = null;
      // Pathfinding state. Populated by recomputePathFor; consumed by
      // followPath. `tiles` is the waypoint list (tile coords), `index`
      // the next waypoint to head for, `goalTile` the destination this
      // path was computed for, and `recomputeAt` a throttle timestamp.
      c.path = null;

      // Stats. statsPerLevel doubles as the level-1 starting block
      // AND the per-level increment. We snapshot it on the character
      // so recomputePartyStats only needs the character object, not
      // the original template. Initial stats == statsPerLevel × the
      // current effectiveLevel (starts at 1 → matches the template).
      c.statsPerLevel = { ...template.statsPerLevel };
      c.stats = {};
      const eff = Math.max(0, this.effectiveLevel);
      for (const stat in c.statsPerLevel) {
        c.stats[stat] = c.statsPerLevel[stat] * eff;
      }

      // Per-tag resistance map. Class baselines from PARTY_TEMPLATES;
      // items stack on top via equipmentBonus(equipment, <tag>).
      c.resistances = makeEmptyResistances();
      if (template.resistances) Object.assign(c.resistances, template.resistances);

      // Active timed buffs (e.g. Guard). Each entry is
      // { stats: {…}, expiresAt }. scene.buffBonus reads from here.
      c.buffs = [];

      // Apply starting equipment from the template. Each entry maps
      // a slot key (weapon/armor/…) to an ITEMS key.
      if (template.startingEquipment) {
        for (const slot in template.startingEquipment) {
          c.equipment[slot] = makeItem(template.startingEquipment[slot]);
        }
      }

      // Derive the active skill list from unarmed defaults + skills
      // granted by equipped items. Cooldown state is per character.
      c.skills = {};
      this.recomputeSkillsFor(c);

      // Compute max HP from base + level + stats + gear, then spawn
      // at full. recalcCharacterStats handles all subsequent updates
      // (equipment swap, level-up).
      this.recalcCharacterStats(c);
      c.hp = c.maxHp;

      return c;
    }

    // Rebuilds character.skillKeys from defaults + the skills granted
    // by every equipped item. Preserves existing cooldown progress
    // for any skill that survives the recompute, so swapping a hat
    // doesn't reset your Fireball timer.
    recomputeSkillsFor(character) {
      const slots = { ...DEFAULT_SKILL_BY_SLOT };
      // An equipped weapon means "armed" — drop the unarmed defaults
      // BEFORE applying the weapon's skill grants, so a sword
      // wielder's loadout is exactly { primary: Slice } unless the
      // weapon also grants a secondary (e.g. Fire Staff → Bonk +
      // Fireball). Without this, a sword would leave Throw Rock
      // dangling in the secondary slot.
      if (character.equipment.weapon && character.equipment.weapon.skills) {
        slots.primary = null;
        slots.secondary = null;
      }
      for (const slotName in character.equipment) {
        const item = character.equipment[slotName];
        if (!item || !item.skills) continue;
        for (const grant of item.skills) {
          slots[grant.slot] = grant.id;
        }
      }
      const newKeys = SKILL_SLOTS.map((s) => slots[s]).filter((k) => k);
      const previous = character.skills || {};
      const fresh = {};
      for (const key of newKeys) {
        fresh[key] = previous[key] || { cooldown: 0 };
      }
      character.skillKeys = newKeys;
      character.skills = fresh;
    }

    // ---- collisions / input ------------------------------

    setupCollisions() {
      // Per-character: walls, chests, enemies.
      for (const character of this.party) {
        // Wall collision resolves automatically. With circular bodies
        // the character slides along walls, and the A* path finds a
        // route around them.
        this.physics.add.collider(character, this.walls);
        // Chests stay as OVERLAP — walking into one collects it, it
        // shouldn't block movement.
        this.physics.add.overlap(character, this.chests, (c, chest) => this.onCollectChest(c, chest));
        // Enemies are SOLID against the party. The collider's callback
        // still fires the damage logic every frame of contact, so
        // standing next to an enemy keeps hurting you (gated by the
        // invuln window in onPlayerHit). Previously this was an
        // overlap — meaning enemies could walk right through characters
        // and stand on top of them.
        this.physics.add.collider(character, this.enemies, (c, e) => this.onPlayerHit(c, e));
      }

      // Party members shouldn't overlap.
      for (let i = 0; i < this.party.length; i++) {
        for (let j = i + 1; j < this.party.length; j++) {
          this.physics.add.collider(this.party[i], this.party[j]);
        }
      }

      // Enemies vs world.
      this.physics.add.collider(this.enemies, this.walls);
      this.physics.add.collider(this.enemies, this.enemies);
    }

    setupInput() {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = this.input.keyboard.addKeys('W,A,S,D,B,C,I');
      this.input.mouse.disableContextMenu();
      this.input.on('pointerdown', (pointer) => {
        if (this.isModalOpen()) return;
        this.setMoveTarget(pointer.worldX, pointer.worldY);
      });
    }

    // ---- party movement (click target + personality) ----

    updateCharacterMovement(character, time) {
      // Cast lock: the caster is committed to the swing/cast for
      // skill.castTimeMs. While locked they hold their ground so
      // enemies can close, instead of tap-and-retreating with zero
      // exposure. Keyboard override still wins so dev movement
      // isn't blocked.
      if (character.castLockUntil && time < character.castLockUntil) {
        if (!this.handleKeyboardOverride(character)) {
          character.setVelocity(0);
        }
        return;
      }

      if (this.handleKeyboardOverride(character)) return;

      const fleeing = this.isFleeing(character);

      let dirX = 0, dirY = 0;

      // Arrival: clear moveTarget when within the arrival threshold.
      // Without this the character would keep micro-adjusting around
      // the click point.
      if (character.moveTarget) {
        const dx = character.moveTarget.x - character.x;
        const dy = character.moveTarget.y - character.y;
        if (Math.hypot(dx, dy) < ARRIVE_THRESHOLD) {
          this.clearMoveTargetTracking(character);
        }
      }

      // Pathfinding-driven primary direction. Goal is moveTarget if
      // set, else nearby chest, else nearest enemy outside the
      // preferred range, else regroup to the rest of the party.
      // determineCharacterGoal handles the priority logic; A* + path
      // smoothing handles wall navigation.
      const goal = fleeing ? null : this.determineCharacterGoal(character);
      if (goal) {
        if (this.shouldRecomputePath(character, goal.x, goal.y, time)) {
          this.recomputePathFor(character, goal.x, goal.y, time);
        }
        const dir = this.followPath(character);
        if (dir) {
          dirX = dir.dirX;
          dirY = dir.dirY;
        } else if (character.moveTarget) {
          // Path exhausted (or empty because we're already on the
          // best reachable tile) but a moveTarget is still set —
          // happens when the click lands on a wall and nearestWalkable
          // redirects us to a tile we've now reached. Clear so wander
          // takes over instead of stalling here forever.
          this.clearMoveTargetTracking(character);
        }
      } else {
        character.path = null;
      }

      // Panic retreat only takes over when no player command is active.
      // Once the player clicks, the click is the intent and the
      // character follows it even at low HP — flee re-engages on the
      // next idle frame after the moveTarget clears.
      const beingCommanded = !!character.moveTarget;

      // Enemy-influenced movement. preferredDistance is the *setpoint*
      // (not just a floor): the character actively closes when too far
      // and backs off when too close, settling at preferredDistance.
      // Strength is signed and continuous around the setpoint, so the
      // character glides to a stop instead of oscillating.
      const nearest = this.findNearestEnemy(character);
      if (nearest) {
        const ex = nearest.x - character.x;
        const ey = nearest.y - character.y;
        const ed = Math.hypot(ex, ey);
        if (ed > 0.01 && ed < SIGHT_RANGE) {
          const ux = ex / ed, uy = ey / ed;
          if (fleeing && !beingCommanded) {
            // Panic: push away from any visible enemy, full strength.
            const strength = 1 - ed / SIGHT_RANGE;
            dirX -= ux * strength;
            dirY -= uy * strength;
          } else {
            const desired = character.personality.preferredDistance;
            const error = ed - desired;
            let strength;
            if (error >= 0) {
              // Too far from desired — pull toward enemy. Strength
              // fades from 0 at the setpoint to 1 at sight range.
              strength = Math.min(1, error / Math.max(1, SIGHT_RANGE - desired));
            } else {
              // Too close — push away. Strength fades from 0 at the
              // setpoint to -1 when overlapping.
              strength = Math.max(-1, error / Math.max(1, desired));
            }
            dirX += ux * strength;
            dirY += uy * strength;
          }
        }
      }

      // Buddy spacing: push away from any teammate inside BUDDY_DISTANCE.
      // Linear falloff (was quadratic) means the push is felt across
      // the whole range, not just when shoulder-to-shoulder — so the
      // party visibly diverges while travelling, not only when idle.
      for (const other of this.party) {
        if (other === character || !other.active) continue;
        const dx = other.x - character.x;
        const dy = other.y - character.y;
        const d = Math.hypot(dx, dy);
        if (d > 0.01 && d < BUDDY_DISTANCE) {
          const ux = dx / d, uy = dy / d;
          const strength = 1 - d / BUDDY_DISTANCE;
          dirX -= ux * strength;
          dirY -= uy * strength;
        }
      }

      // No intent from click / personality / buddy push → wander.
      let wandering = false;
      const hasIntent = Math.hypot(dirX, dirY) > 0.05;
      if (hasIntent || fleeing) {
        character.wander.target = null;
        character.wander.restUntil = time + POST_INTENT_REST;
      } else {
        const w = this.applyWander(character, time);
        dirX = w.dirX;
        dirY = w.dirY;
        wandering = w.active;
      }

      const drifted = this.applyDrift(character, dirX, dirY);
      dirX = drifted.dirX;
      dirY = drifted.dirY;
      this.tickPaceFactor(character);

      const mag = Math.hypot(dirX, dirY);
      if (mag > 0.05) {
        // Gear "speed" stat is a fractional bonus that stacks across
        // every equipped item. Agility also contributes via
        // AGILITY_SPEED_PER_POINT — Agility's primary role is
        // movement speed (it doesn't scale damage).
        const gearSpeed = equipmentBonus(character.equipment, 'speed');
        const agilitySpeed = effectiveStat(character, 'agility') * AGILITY_SPEED_PER_POINT;
        const speedFactor = character.paceFactor
          * (wandering ? WANDER_SPEED_FACTOR : 1.0)
          * (1 + gearSpeed + agilitySpeed);
        character.setVelocity(
          (dirX / mag) * PLAYER_SPEED * speedFactor,
          (dirY / mag) * PLAYER_SPEED * speedFactor,
        );
        this.updateFacing(character, dirX, dirY);
      } else {
        character.setVelocity(0);
      }
    }

    handleKeyboardOverride(character) {
      // WASD/arrows steer every party member identically. Dev-only.
      const left  = this.cursors.left.isDown  || this.keys.A.isDown;
      const right = this.cursors.right.isDown || this.keys.D.isDown;
      const up    = this.cursors.up.isDown    || this.keys.W.isDown;
      const down  = this.cursors.down.isDown  || this.keys.S.isDown;
      if (!(left || right || up || down)) return false;

      character.moveTarget = null;
      let vx = 0, vy = 0;
      if (left)  vx -= 1;
      if (right) vx += 1;
      if (up)    vy -= 1;
      if (down)  vy += 1;
      const mag = Math.hypot(vx, vy) || 1;
      character.setVelocity((vx / mag) * PLAYER_SPEED, (vy / mag) * PLAYER_SPEED);
      this.updateFacing(character, vx, vy);
      return true;
    }

    updateFacing(character, dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) {
        character.facing = { x: dx > 0 ? 1 : -1, y: 0 };
        character.setFlipX(dx < 0);
      } else if (Math.abs(dy) > 0) {
        character.facing = { x: 0, y: dy > 0 ? 1 : -1 };
      }
    }

    setMoveTarget(x, y) {
      // Visible marker at exact click; each character lands at its own
      // jittered point so they don't pile up on top of each other.
      this.showClickMarker(x, y);
      const now = this.time.now;
      for (const c of this.party) {
        if (!c.active) continue;
        const angle = Math.random() * Math.PI * 2;
        const r = MOVE_JITTER_PX * Math.random();
        c.moveTarget = {
          x: x + Math.cos(angle) * r,
          y: y + Math.sin(angle) * r,
        };
        // Compute the path right away so the very next update tick
        // can follow it. Without this the character would head in a
        // straight line for one frame before the path resolves.
        this.recomputePathFor(c, c.moveTarget.x, c.moveTarget.y, now);
        // Occasional "ordered around" chatter — small per-character
        // chance so most clicks pass silently; the shared cooldown
        // on nextSpeakAt stops a chain of orders from spamming a
        // wall of quips.
        if (now >= c.nextSpeakAt && Math.random() < 0.15) {
          this.speakAs(c);
        }
      }
    }

    // Clears the click moveTarget and its derived path. Called on
    // arrival, on knockback, and when a level transitions.
    clearMoveTargetTracking(character) {
      character.moveTarget = null;
      character.path = null;
    }

    showClickMarker(x, y) {
      this.clearClickMarker();
      this.clickMarker = this.add.circle(x, y, 8, 0x4cc9f0, 0)
        .setStrokeStyle(2, 0x4cc9f0)
        .setDepth(DEPTH.fx);
      this.clickMarkerTween = this.tweens.add({
        targets: this.clickMarker, radius: 16, alpha: 0, duration: 500,
        onComplete: () => this.clearClickMarker(),
      });
    }

    clearClickMarker() {
      if (this.clickMarkerTween) {
        this.clickMarkerTween.stop();
        this.clickMarkerTween = null;
      }
      if (this.clickMarker) {
        this.clickMarker.destroy();
        this.clickMarker = null;
      }
    }

    // ---- organic movement helpers ------------------------

    applyWander(character, time) {
      const w = character.wander;
      if (time < w.restUntil) return { dirX: 0, dirY: 0, active: false };

      if (!w.target) {
        const angle = Math.random() * Math.PI * 2;
        const r = WANDER_MIN_DIST + Math.random() * (WANDER_MAX_DIST - WANDER_MIN_DIST);
        w.target = {
          x: character.x + Math.cos(angle) * r,
          y: character.y + Math.sin(angle) * r,
          expiresAt: time + WANDER_GIVEUP_MS,
        };
      }

      const dx = w.target.x - character.x;
      const dy = w.target.y - character.y;
      const dist = Math.hypot(dx, dy);
      const arrived = dist < 3;
      const gaveUp = time > w.target.expiresAt;
      if (arrived || gaveUp) {
        w.target = null;
        w.restUntil = time + WANDER_MIN_REST + Math.random() * (WANDER_MAX_REST - WANDER_MIN_REST);
        return { dirX: 0, dirY: 0, active: false };
      }
      return { dirX: dx / dist, dirY: dy / dist, active: true };
    }

    applyDrift(character, dirX, dirY) {
      character.drift = character.drift * DRIFT_DECAY
        + (Math.random() - 0.5) * DRIFT_STEP;
      character.drift = Math.max(-DRIFT_MAX, Math.min(DRIFT_MAX, character.drift));
      const c = Math.cos(character.drift);
      const s = Math.sin(character.drift);
      return { dirX: dirX * c - dirY * s, dirY: dirX * s + dirY * c };
    }

    tickPaceFactor(character) {
      const target = 1.0;
      character.paceFactor = target + (character.paceFactor - target) * PACE_DECAY
        + (Math.random() - 0.5) * PACE_STEP;
      character.paceFactor = Math.max(PACE_MIN, Math.min(PACE_MAX, character.paceFactor));
    }

    // ---- auto-skill system -------------------------------

    updateCharacterSkills(character, time, delta) {
      // Iterate the character's current loadout. Each skill fires
      // whenever it's off cooldown and a valid target is in range.
      // Self-targeted skills (e.g. Guard) trigger as long as some
      // threat is inside the skill's range — they cast on the caster.
      //
      // If the character is mid-cast (castLockUntil ahead of `time`),
      // no skill fires this frame — they're committed to the previous
      // swing and can't queue another action.
      if (character.castLockUntil && time < character.castLockUntil) {
        // Still tick cooldowns so they don't pause along with the
        // character — the lock represents recovery time, not freeze.
        for (const key of character.skillKeys) {
          const state = character.skills[key];
          if (state) state.cooldown = Math.max(0, state.cooldown - delta);
        }
        return;
      }

      // Attack-speed gear lowers every skill's effective cooldown
      // by 1/(1 + bonus) for this iteration. We stash the resulting
      // value on the skill state as `maxCooldown` so the HUD bar
      // fills relative to the *current* effective duration — without
      // that, equipping +50% attack speed would leave the bar
      // partially filled at fire-time and look broken.
      const atkSpeed = equipmentBonus(character.equipment, 'attack_speed');
      const agilityAttackSpeed = effectiveStat(character, 'agility') * AGILITY_ATTACK_SPEED_PER_POINT;
      const speedScale = 1 / (1 + atkSpeed + agilityAttackSpeed);

      for (const key of character.skillKeys) {
        const skill = SKILLS[key];
        if (!skill) continue;
        const state = character.skills[key];
        state.cooldown = Math.max(0, state.cooldown - delta);
        if (state.cooldown > 0) continue;

        const effCooldown = skill.cooldownMs * speedScale;

        let fired = false;
        if (skill.targetType === 'self') {
          // Use the skill's range as a threat-detection radius so the
          // character doesn't burn cooldowns in safety.
          const threat = this.findNearestEnemyInRange(character, skill.range);
          if (threat) {
            skill.cast(this, character);
            state.cooldown = effCooldown;
            state.maxCooldown = effCooldown;
            fired = true;
          }
        } else if (skill.targetType === 'ally') {
          // Support skill — picks the lowest-HP ally within range.
          // findInjuredAllyInRange treats the caster as an ally, so
          // a hurt healer will heal themselves if nobody else needs it.
          const target = this.findInjuredAllyInRange(character, skill.range);
          if (target) {
            this.faceCharacterToward(character, target.x, target.y);
            skill.cast(this, character, target);
            state.cooldown = effCooldown;
            state.maxCooldown = effCooldown;
            fired = true;
          }
        } else {
          // minRange enforces a "don't fire ranged spells in melee"
          // floor — ice_knife, fireball, etc. each set one so they
          // pass on point-blank targets and let the melee skill in
          // the same loadout take that swing instead.
          const target = this.findNearestEnemyInRange(
            character, skill.range, skill.minRange || 0,
          );
          if (target) {
            this.faceCharacterToward(character, target.x, target.y);
            skill.cast(this, character, target);
            state.cooldown = effCooldown;
            state.maxCooldown = effCooldown;
            fired = true;
          }
        }

        // Commit window: while castTimeMs is in effect the caster
        // can't move (handled in updateCharacterMovement) and can't
        // start another skill (the early return above).
        if (fired && skill.castTimeMs) {
          character.castLockUntil = time + skill.castTimeMs;
          // Only one cast per frame — break so a single character
          // doesn't fire melee + ranged in the same instant.
          break;
        }
      }
    }

    faceCharacterToward(character, x, y) {
      this.updateFacing(character, x - character.x, y - character.y);
    }

    // Returns { t, wall } describing the first wall a line from
    // (x1,y1) → (x2,y2) crosses, or null if the path is clear.
    // `t` is the parametric distance along the line (0..1).
    // Used by ranged skill projectiles so attacks don't pass
    // through walls.
    findFirstWallHit(x1, y1, x2, y2) {
      let bestT = null;
      let bestWall = null;
      this.walls.children.iterate((wall) => {
        if (!wall || !wall.body) return;
        const b = wall.body;
        const t = lineRectIntersection(x1, y1, x2, y2, b.x, b.y, b.width, b.height);
        if (t !== null && (bestT === null || t < bestT)) {
          bestT = t;
          bestWall = wall;
        }
      });
      return bestT === null ? null : { t: bestT, wall: bestWall };
    }

    damageEnemy(caster, enemy, skill) {
      if (!enemy || !enemy.active || enemy.dying) return;
      // Base damage = skill's nominal damage plus any flat weapon bonus.
      // applyDamageFormula then layers stat scaling and target
      // resistance on top.
      const weapon = caster ? equipmentBonus(caster.equipment, 'damage') : 0;
      const base = (skill.damage || 0) + weapon;
      const dealt = applyDamageFormula(base, skill.tags, caster, enemy);
      enemy.hp -= dealt;
      showDamageNumber(this, enemy, dealt, skill.color || 0xffffff);
      // Star-burst impact spark on every hit — applies uniformly to
      // melee, ranged projectiles, AoE bursts, and lightning beams
      // since they all flow through damageEnemy. Size scales with
      // damage dealt so a chunky cleave looks more emphatic than a
      // chip-damage jab.
      showHitSpark(this, enemy.x, enemy.y, skill.color || 0xffffff, dealt);
      enemy.setTint(0xffaaaa);
      this.time.delayedCall(80, () => {
        if (enemy.active && !enemy.dying && enemy.clearTint) enemy.clearTint();
      });

      if (enemy.hp <= 0) {
        enemy.dying = true;
        enemy.setActive(false);
        if (enemy.body) enemy.body.enable = false;
        // Hover label clears as soon as the kill registers — without
        // this, the red HP bar at "0" would linger over the corpse
        // for the duration of the death tween.
        if (this.hoveredEnemy === enemy) this.hoveredEnemy = null;
        // Encouragement popup ("DEAD!" / "Nice shot!" etc.) above the
        // dying sprite. AoE skills that down multiple targets in one
        // hit each fire their own message — the per-message jitter +
        // colour randomisation keeps them legible.
        showKillMessage(this, enemy.x, enemy.y);
        // Score awarded at kill time, scaled by the live Score
        // Multiplier. Higher-point archetypes (zombies) are worth
        // more than fast cannon-fodder (skeletons); spending multi
        // (or letting it drop via Level UP) reduces every future
        // award proportionally.
        const raw = enemy.points || 1;
        this.score += Math.round(raw * this.scoreMulti);
        // XP is just a kill count — every monster counts as 1 toward
        // the party's next level. Triggers level-up here (multi-step
        // safe via the while-loop in checkPartyLevelUp).
        this.monstersKilled += 1;
        this.checkPartyLevelUp();
        this.tweens.add({
          targets: enemy, alpha: 0, scale: enemy.scale * 1.4, duration: 200,
          onComplete: () => { if (enemy.scene) enemy.destroy(); },
        });
        // Last enemy of a level? Schedule the completion check.
        this.checkLevelCleared();
      }
    }

    findNearestEnemy(character) {
      return this.findNearestEnemyInRange(character, Infinity);
    }

    // Nearest enemy within an annulus around the character.
    // - range: maximum distance (skill.range typically).
    // - minRange: minimum distance. Ranged skills set this so the
    //   wielder doesn't waste a Fireball on someone in melee — the
    //   melee skill in the same loadout handles point-blank fights.
    findNearestEnemyInRange(character, range, minRange = 0) {
      let best = null;
      let bestD = range;
      this.enemies.children.iterate((e) => {
        if (!e || !e.active || e.dying) return;
        const d = Phaser.Math.Distance.Between(character.x, character.y, e.x, e.y);
        if (d < minRange) return;
        if (d <= bestD) { bestD = d; best = e; }
      });
      return best;
    }

    // Closest chest within `range` px. Used by determineCharacterGoal
    // to auto-pathfind toward nearby loot — a tighter radius than the
    // enemy-engage check so the party only swings for chests they're
    // already walking near.
    findNearestChestInRange(character, range) {
      let best = null;
      let bestD = range;
      this.chests.children.iterate((c) => {
        if (!c || !c.active) return;
        const d = Phaser.Math.Distance.Between(character.x, character.y, c.x, c.y);
        if (d <= bestD) { bestD = d; best = c; }
      });
      return best;
    }

    // Returns the lowest-HP party member within `range` of the
    // caster that is below maxHp. Includes the caster — a hurt
    // healer with no other casualties heals themselves.
    findInjuredAllyInRange(caster, range) {
      let best = null;
      let bestNeed = 0;
      for (const c of this.party) {
        if (!c.active) continue;
        if (c.hp >= c.maxHp) continue;
        const d = Phaser.Math.Distance.Between(caster.x, caster.y, c.x, c.y);
        if (d > range) continue;
        const need = c.maxHp - c.hp;
        if (need > bestNeed) { bestNeed = need; best = c; }
      }
      return best;
    }

    // Restores HP to an ally. The caster's Intelligence scales the
    // amount with the same coefficient as magic damage scaling, so
    // gear and stats that improve the healer's INT improve their
    // healing in the same readable way.
    healAlly(caster, ally, baseAmount) {
      if (!ally || !ally.active) return;
      let amount = baseAmount;
      if (caster) {
        // Reads both base Intelligence and gear-bonus Intelligence
        // (e.g. an Amulet of Wisdom). Same scaling coefficient as
        // magic damage scaling, so gear effects are consistent.
        const baseInt = caster.stats?.intelligence || 0;
        const gearInt = caster.equipment ? equipmentBonus(caster.equipment, 'intelligence') : 0;
        amount += (baseInt + gearInt) * 0.2;
      }
      amount = Math.max(1, Math.round(amount));
      ally.hp = Math.min(ally.maxHp, ally.hp + amount);
      // Floats a green "+N" above the target, matching the damage
      // popup style so heals read as the inverse of hits.
      showDamageNumber(this, ally, '+' + amount, 0x88ff88);
    }

    nearestAlivePartyMember(from) {
      let best = null, bestD = Infinity;
      for (const c of this.party) {
        if (!c.active) continue;
        const d = Phaser.Math.Distance.Between(from.x, from.y, c.x, c.y);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    }

    // Like nearestAlivePartyMember but excludes the caller — used by
    // the regroup goal so a character doesn't pick themselves as the
    // "nearest ally". Falls back to null for a one-member party (or
    // when the rest of the party is dead).
    nearestAliveAlly(character) {
      let best = null, bestD = Infinity;
      for (const c of this.party) {
        if (!c.active || c === character) continue;
        const d = Phaser.Math.Distance.Between(character.x, character.y, c.x, c.y);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    }

    isFleeing(character) {
      return character.hp <= character.maxHp * character.personality.fleeAtHpFraction;
    }

    // Called at spawn, on every party level-up, and after any
    // drag-and-drop change to equipment. Computes maxHp from:
    //   STARTING_HP                                      // class-agnostic base
    //   + (trueLevel - 1) * HP_PER_PARTY_LEVEL          // flat per-level
    //   + effective Resolve * RESOLVE_HP_PER_POINT       // 1 HP per RES
    //   + effective Strength * STRENGTH_HP_PER_POINT     // 0.5 HP per STR
    //   + equipment maxHp                                // gear +HP rolls
    // "Effective" stats include gear bonuses to that stat, so an
    // amulet with +intelligence and a ring of vigor both contribute.
    //
    // When maxHp goes up, current HP rises by the same delta so
    // equipping a +HP item or hitting a new level feels like a power
    // boost rather than making you take more hits to feel full.
    recalcCharacterStats(character) {
      const oldMax = character.maxHp || 0;
      const effectiveResolve = effectiveStat(character, 'resolve');
      const effectiveStrength = effectiveStat(character, 'strength');
      const fromResolve = effectiveResolve * RESOLVE_HP_PER_POINT;
      const fromStrength = effectiveStrength * STRENGTH_HP_PER_POINT;
      const fromGear = equipmentBonus(character.equipment, 'maxHp');
      // HP scales off effectiveLevel — every LEVEL DOWN choice
      // shrinks the per-level HP block right alongside the per-level
      // stat bumps. Floor at 0 so an effective level below 1 just
      // contributes nothing rather than negative HP.
      const fromLevel = Math.max(0, this.effectiveLevel - 1) * HP_PER_PARTY_LEVEL;
      // Round at the end so the half-point STR contribution doesn't
      // produce a fractional HP bar.
      const newMax = Math.round(
        STARTING_HP + fromLevel + fromResolve + fromStrength + fromGear,
      );
      character.maxHp = newMax;
      const delta = newMax - oldMax;
      if (delta > 0) character.hp = Math.min(newMax, (character.hp || 0) + delta);
      else if (character.hp > newMax) character.hp = newMax;
    }

    // ---- party chatter -----------------------------------
    //
    // Each character carries a hidden persona (assigned at creation)
    // and a `nextSpeakAt` timestamp. tickPartySpeech polls every
    // frame; when a character's timer has expired AND they're in a
    // "quiet" state (no immediate threat, not casting, not fleeing)
    // we roll a 50% chance to actually speak. If they pass the roll
    // the cooldown jumps to 90–150 s; if not (or if they're in
    // combat) we push the next eligibility check out by 5–10 s and
    // try again later. Net effect: roughly one comment per character
    // every two minutes when wandering, almost none in combat.

    tickPartySpeech(time) {
      for (const c of this.party) {
        if (!c.active) continue;
        if (time < c.nextSpeakAt) continue;
        if (!this.isCharacterQuiet(c, time)) {
          // In combat / mid-cast / fleeing — try again soon.
          c.nextSpeakAt = time + 5000 + Math.random() * 5000;
          continue;
        }
        if (Math.random() < 0.75) {
          this.speakAs(c);
        } else {
          c.nextSpeakAt = time + 10000 + Math.random() * 15000;
        }
      }
    }

    // "Quiet" = safe enough to chat. No fleeing, no active cast lock,
    // no enemy crowding within ~5 tiles. Movement and click moveTarget
    // are explicitly NOT disqualifiers — characters happily comment
    // while strolling.
    isCharacterQuiet(c, time) {
      if (this.isFleeing(c)) return false;
      if (c.castLockUntil && time < c.castLockUntil) return false;
      if (this.findNearestEnemyInRange(c, TILE * 5)) return false;
      return true;
    }

    // Pulls a line from the character's persona, fills in ally names,
    // and pushes it through the HUD speech-bubble system. Always
    // resets the cooldown so a successful speak buys a long quiet
    // window before this character speaks again.
    speakAs(character) {
      const time = this.time.now;
      const allies = this.party
        .filter((p) => p !== character && p.active)
        .map((p) => p.heroName);
      const line = pickComment(character.persona, allies);
      if (!line) return;
      showCharacterComment(this, character, line);
      character.nextSpeakAt = time + 40000 + Math.random() * 40000;
    }

    // ---- party progression -------------------------------
    //
    // Each monster kill bumps monstersKilled and calls
    // checkPartyLevelUp. The party EARNS a level each time the
    // cumulative-kills curve passes a threshold, but applying that
    // level is gated by the player's choice (😇 Level UP for stats,
    // 😈 LEVEL DOWN for +1.0× Score Multi). pendingLevelUps tracks
    // the gap between earned and applied so an AoE wipe that
    // crosses two thresholds at once produces two prompts in
    // sequence rather than collapsing into one.
    //
    // The very first level-up (1 → 2) skips the prompt — the player
    // hasn't seen the system yet, so we auto-apply Level UP with no
    // multi penalty as a freebie. Every subsequent level shows the
    // choice modal.

    checkPartyLevelUp() {
      const earned = this.earnedPartyLevelFromXp();
      const gap = earned - (this.trueLevel + this.pendingLevelUps);
      if (gap > 0) this.pendingLevelUps += gap;
      this.tryAdvanceLevelUp();
    }

    // Highest party level the team has earned given monstersKilled.
    // Walks up the curve from current trueLevel — cheap because the
    // gap is at most a handful of levels per call.
    earnedPartyLevelFromXp() {
      let L = this.trueLevel;
      while (this.monstersKilled >= cumulativeKillsForLevel(L + 1)) L += 1;
      return L;
    }

    tryAdvanceLevelUp() {
      if (this.pendingLevelUps <= 0) return;
      if (this.levelChoiceOpen || this.reviveModalOpen) return;
      // Every threshold pops the modal — including the very first
      // one. The first-level case hides the LEVEL DOWN button (see
      // openLevelChoiceModal) and waives the −0.1× penalty (see
      // resolveLevelChoice's `wasFirst` branch), so the popup is
      // a forced single-button intro rather than a trade-off.
      this.openLevelChoiceModal();
    }

    // Show the angel-vs-demon choice modal. The actual mutation
    // happens in resolveLevelChoice once the player clicks.
    //
    // LEVEL DOWN is hidden when either:
    //   - It's the very first level-up (trueLevel === 1) — Down
    //     wouldn't make sense before the player has had a chance to
    //     gain stats.
    //   - effectiveLevel is already at 1 — Down would push it to 0
    //     and zero out every stat. Forcing Up here keeps the party
    //     viable.
    // The subtitle adapts so the player understands why they only
    // see the one option.
    openLevelChoiceModal() {
      this.levelChoiceOpen = true;
      const isFirst = this.trueLevel === 1;
      const atFloor = this.effectiveLevel <= 1;
      const lockToUp = isFirst || atFloor;
      const lvlEl = document.getElementById('level-up-modal-level');
      if (lvlEl) lvlEl.textContent = String(this.trueLevel + 1);
      const downBtn = document.getElementById('choice-level-down');
      if (downBtn) downBtn.style.display = lockToUp ? 'none' : '';
      const subEl = document.querySelector('#level-up-modal .popup-sub');
      if (subEl) {
        let msg;
        if (isFirst) {
          msg = 'Your first level-up — only Level UP is available. Future levels will also let you trade stats for Score Multi via LEVEL DOWN.';
        } else if (atFloor) {
          msg = 'Effective level is already at 1 — LEVEL DOWN is locked. Take the stat boost.';
        } else {
          msg = 'The party crossed an XP threshold. Choose how to take it:';
        }
        subEl.textContent = msg;
      }
      const modal = document.getElementById('level-up-modal');
      if (modal) modal.classList.add('open');
    }

    resolveLevelChoice(choice) {
      if (!this.levelChoiceOpen) return;
      const modal = document.getElementById('level-up-modal');
      if (modal) modal.classList.remove('open');
      this.levelChoiceOpen = false;
      this.applyLevelUp(choice);
    }

    // Applies one level. `choice` is 'up' or 'down':
    //   - 'up':   trueLevel++, effectiveLevel++, stats grow, −0.10×
    //             Score Multi penalty (applies on EVERY Level UP,
    //             including the forced first one).
    //   - 'down': trueLevel++, effectiveLevel−−, stats SHRINK,
    //             +1.00× Score Multi gain. Mirrors a real "going
    //             back to level N−1" — maxHp drops, current HP is
    //             clamped via recalcCharacterStats, no free heal.
    applyLevelUp(choice) {
      this.trueLevel += 1;
      this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
      const isUp = choice !== 'down';
      if (isUp) {
        this.effectiveLevel += 1;
        this.recomputePartyStats({ heal: true });
        this.applyScoreMultiChange(
          -0.1, `Level UP → Lv ${this.trueLevel}`, 'level_up',
        );
      } else {
        // Clamped at 1 so stats never zero out. The modal hides the
        // Down button when effectiveLevel is already 1 (see
        // openLevelChoiceModal), so this Math.max is defence-in-depth.
        this.effectiveLevel = Math.max(1, this.effectiveLevel - 1);
        this.recomputePartyStats({ heal: false });
        this.applyScoreMultiChange(
          +1.0, `LEVEL DOWN → Lv ${this.trueLevel}`, 'level_down',
        );
      }
      showLevelUpMessage(this, choice);
      refreshEquipment();
      // If multiple thresholds were crossed at once, the next prompt
      // fires immediately after this one resolves.
      this.tryAdvanceLevelUp();
    }

    // Rebuilds every character's stats block from their per-level
    // template multiplied by the current effectiveLevel (floored at
    // 0 so a negative effective level zeroes stats rather than
    // flipping them negative). Then runs recalcCharacterStats to
    // resync maxHp and clamp current HP. Heals to full only when
    // requested (Level UP) — LEVEL DOWN just lets the HP clamp do
    // its work so the loss actually stings.
    recomputePartyStats(opts = {}) {
      const eff = Math.max(0, this.effectiveLevel);
      for (const c of this.party) {
        if (!c.statsPerLevel) continue;
        for (const stat in c.statsPerLevel) {
          c.stats[stat] = c.statsPerLevel[stat] * eff;
        }
        this.recalcCharacterStats(c);
        if (opts.heal && c.active) c.hp = c.maxHp;
      }
    }

    // Mutates this.scoreMulti and appends an entry to the history
    // ledger. The Score Multiplier panel in the character sheet
    // reads both via refreshScoreMulti and aggregates entries by
    // `source` so the breakdown stays compact across long runs.
    //
    // Source tags: 'level_up' | 'level_down' | 'feed' | 'revive'.
    applyScoreMultiChange(delta, label, source = 'other') {
      if (!delta) return;
      this.scoreMulti = Math.max(0, this.scoreMulti + delta);
      this.scoreMultiHistory.push({ delta, label, source });
      // Refresh the panel if the sheet's already open so the
      // numbers don't go stale mid-run.
      refreshScoreMulti();
    }

    // ---- pathfinding -------------------------------------
    //
    // Pathing model: each pathable entity carries a `path` field:
    //   { tiles, index, goalTile, recomputeAt }
    // - tiles: ordered waypoint list of {tx, ty} (start tile excluded;
    //   findPath drops it). When index >= tiles.length the path is
    //   exhausted.
    // - goalTile: the tile the path was solved for. We only recompute
    //   when the live goal drifts ≥ 2 tiles away from this one, so a
    //   chasing enemy doesn't burn A* every frame.
    // - recomputeAt: earliest `time` we'll allow another recompute. Caps
    //   recompute frequency to ~2/sec per entity even when the goal
    //   keeps wiggling.
    //
    // Path direction is the *primary* movement intent. Buddy-push,
    // close-range retreat, and the flee response still layer on as
    // additive forces in updateCharacterMovement, so the navigation
    // feel stays organic.

    // Recompute or reuse a path from (entity.x, entity.y) toward the
    // given world goal. Snaps to tile coords, falls back to the
    // nearest walkable tile if the goal is on a wall, and stores the
    // result on `entity.path`. `time` gates the recompute throttle.
    recomputePathFor(entity, goalX, goalY, time) {
      if (!this.passableGrid) return;
      const startTile = worldToTile(entity.x, entity.y);
      const rawGoal = worldToTile(goalX, goalY);
      // Goal on a wall (or out of bounds) — find the nearest walkable
      // tile so clicks on trees / chasing through a doorway still work.
      const goalTile = isPassable(this.passableGrid, rawGoal.tx, rawGoal.ty)
        ? rawGoal
        : nearestWalkable(this.passableGrid, rawGoal, 8);
      if (!goalTile) { entity.path = null; return; }
      const tiles = findPath(
        startTile.tx, startTile.ty, goalTile.tx, goalTile.ty,
        this.passableGrid,
      );
      if (!tiles || tiles.length === 0) {
        entity.path = null;
        return;
      }
      entity.path = {
        tiles,
        index: 0,
        goalTile,
        // Next recompute eligible in ~500ms. The shouldRecomputePath
        // check additionally requires the goal to have moved meaningfully.
        recomputeAt: time + 500,
      };
    }

    // True if `entity.path` is missing, exhausted, or stale relative
    // to the live world goal. Throttle: even with a moved goal, we
    // don't recompute before `recomputeAt`.
    shouldRecomputePath(entity, goalX, goalY, time) {
      const path = entity.path;
      if (!path || !path.tiles || path.index >= path.tiles.length) return true;
      if (time < path.recomputeAt) return false;
      const liveGoal = worldToTile(goalX, goalY);
      const dx = liveGoal.tx - path.goalTile.tx;
      const dy = liveGoal.ty - path.goalTile.ty;
      // Recompute when the live goal has drifted ≥ 2 tiles. The
      // 500ms-throttled checks above keep this cheap even on moving
      // targets.
      return (dx * dx + dy * dy) >= 4;
    }

    // Returns a direction vector toward the entity's current path
    // waypoint, advancing the path index as it goes. Skips waypoints
    // that the entity can see directly (line of sight clear of walls),
    // which smooths the path around corners — A* gives a tile-step
    // sequence but the entity can usually cut straight across an
    // open room without ricocheting between cells.
    //
    // Returns null if the path is finished or missing.
    followPath(entity) {
      const path = entity.path;
      if (!path || !path.tiles) return null;

      // Advance past any waypoints the entity has already reached, and
      // opportunistically jump to a farther waypoint if direct sight
      // is clear (path-smoothing). Cap the lookahead so we don't scan
      // the whole path each frame.
      const SKIP_LIMIT = 4;
      let advanced = 0;
      while (path.index < path.tiles.length) {
        const wp = path.tiles[path.index];
        const wpWorld = tileToWorld(wp.tx, wp.ty);
        const dx = wpWorld.x - entity.x;
        const dy = wpWorld.y - entity.y;
        const d = Math.hypot(dx, dy);
        // Close enough — pop this waypoint and continue.
        if (d < 6) {
          path.index += 1;
          continue;
        }
        // Try to skip ahead: if the *next* waypoint is also in sight,
        // jump to it (and keep going up to SKIP_LIMIT times). Saves
        // the wiggling tile-by-tile approach when the corridor is wide.
        if (advanced < SKIP_LIMIT && path.index + 1 < path.tiles.length) {
          const next = path.tiles[path.index + 1];
          const nextWorld = tileToWorld(next.tx, next.ty);
          if (!this.findFirstWallHit(entity.x, entity.y, nextWorld.x, nextWorld.y)) {
            path.index += 1;
            advanced += 1;
            continue;
          }
        }
        // Current waypoint is the right one — emit its direction.
        return { dirX: dx / d, dirY: dy / d };
      }
      return null;
    }

    // Convenience for goal-determination. Returns a world point
    // {x, y} for the character's *primary* intent. Priority:
    //   1. Explicit moveTarget (player click) — always wins.
    //   2. Chest within ~3 tiles — auto-pickup. Tighter than enemy
    //      aggro so the party only veers for loot they're nearly
    //      walking over already.
    //   3. Enemy outside preferredDistance + buffer — auto-engage.
    //   4. Regroup with the rest of the party when drifted > 4 tiles
    //      from the nearest ally. Keeps an idle party loosely
    //      clustered without freezing wander — once they're back
    //      within the threshold the goal disappears and wander
    //      / drift takes over again.
    //   5. None — character idles / wanders.
    determineCharacterGoal(character) {
      if (character.moveTarget) return { x: character.moveTarget.x, y: character.moveTarget.y };

      // Nearby chest — grab it before fighting if it's right there.
      const chest = this.findNearestChestInRange(character, TILE * 3);
      if (chest) return { x: chest.x, y: chest.y };

      // Enemy outside the preferred ring — auto-engage.
      const enemy = this.findNearestEnemy(character);
      if (enemy) {
        const dx = enemy.x - character.x;
        const dy = enemy.y - character.y;
        const d = Math.hypot(dx, dy);
        if (d < SIGHT_RANGE) {
          const desired = character.personality.preferredDistance;
          // Only auto-pathfind to engage if we're meaningfully outside
          // the preferred ring. Close-range positioning is handled by
          // the setpoint force in updateCharacterMovement.
          if (d > desired + 24) return { x: enemy.x, y: enemy.y };
        }
      }

      // Regroup — head back toward the nearest ally when we've drifted
      // too far. Threshold is generous (4 tiles) so a normal wander
      // step doesn't constantly retrigger this; the buddy push handles
      // close-range spacing once they're back together.
      const ally = this.nearestAliveAlly(character);
      if (ally) {
        const ax = ally.x - character.x;
        const ay = ally.y - character.y;
        if (Math.hypot(ax, ay) > TILE * 4) return { x: ally.x, y: ally.y };
      }

      return null;
    }

    // ---- enemy AI ----------------------------------------

    updateEnemies() {
      const time = this.time.now;
      this.enemies.children.iterate((e) => {
        if (!e || !e.active || e.dying) return;
        // Slow status (applied by Ice Knife and similar). Speed is
        // multiplied by slowFactor until the timer expires. Visuals
        // for the slow live in the skill's own onHit (a frost puff)
        // — leaving the enemy's tint alone here keeps the damage
        // flash readable while a slow is active.
        const slowed = e.slowUntil && time < e.slowUntil;
        if (!slowed && e.slowUntil) e.slowUntil = 0;
        const speed = e.speed * (slowed ? (e.slowFactor || 1) : 1);

        const target = this.nearestAlivePartyMember(e);
        if (!target) { e.setVelocity(0); e.path = null; return; }
        const d = Phaser.Math.Distance.Between(e.x, e.y, target.x, target.y);
        if (d >= e.aggroRange) {
          e.setVelocity(0);
          e.path = null;
          return;
        }
        // Within aggro range — pathfind toward the target. Fast path:
        // if line of sight is clear we move straight toward them and
        // skip A*. The shouldRecomputePath throttle still caps
        // recomputes at ~2/sec even when the target is sprinting.
        let dirX = 0, dirY = 0;
        const losClear = !this.findFirstWallHit(e.x, e.y, target.x, target.y);
        if (losClear) {
          e.path = null;
          dirX = (target.x - e.x) / d;
          dirY = (target.y - e.y) / d;
        } else {
          if (this.shouldRecomputePath(e, target.x, target.y, time)) {
            this.recomputePathFor(e, target.x, target.y, time);
          }
          const dir = this.followPath(e);
          if (dir) {
            dirX = dir.dirX;
            dirY = dir.dirY;
          } else {
            // Path failed (e.g. target unreachable) — fall back to a
            // straight push so the enemy at least pressures the wall.
            dirX = (target.x - e.x) / d;
            dirY = (target.y - e.y) / d;
          }
        }
        e.setVelocity(dirX * speed, dirY * speed);
        e.setFlipX(target.x < e.x);
      });
    }

    // ---- camera ------------------------------------------

    updateCameraTarget() {
      const alive = this.aliveParty();
      if (alive.length === 0) return;
      let cx = 0, cy = 0;
      for (const c of alive) { cx += c.x; cy += c.y; }
      this.cameraTarget.setPosition(cx / alive.length, cy / alive.length);
    }

    // ---- player collisions / damage ----------------------

    // ---- level progression -------------------------------

    // A level is cleared once no active enemies remain (dying ones
    // count as down — the tween just hasn't finished) AND no chest
    // pickups are still on the ground.
    isLevelCleared() {
      let hasEnemy = false;
      this.enemies.children.iterate((e) => {
        if (e && e.active && !e.dying) hasEnemy = true;
      });
      if (hasEnemy) return false;
      let hasChest = false;
      this.chests.children.iterate((c) => {
        if (c && c.active) hasChest = true;
      });
      return !hasChest;
    }

    // Called after every kill and every chest pickup. In adventure
    // mode, kicks off the level-completion sequence. The
    // `transitioning` guard prevents triggering twice if both the
    // last enemy and last chest get cleared on the same frame.
    checkLevelCleared() {
      if (this.mode !== 'adventure') return;
      if (this.transitioning) return;
      if (!this.isLevelCleared()) return;
      this.transitioning = true;
      // Small grace period so the kill / chest-pickup effects play
      // before the message appears.
      this.time.delayedCall(500, () => showLevelCompleteMessage(this));
    }

    // Called when the level-complete banner finishes. If any hero
    // died during the level, we pause first and offer the revive
    // prompt before generating the next map. Otherwise we go
    // straight to loadLevel.
    advanceToNextLevel() {
      const dead = this.party.filter((c) => !c.active);
      if (dead.length > 0) {
        this.openReviveModal();
        return;
      }
      this.loadNextMapLevel();
    }

    // The actual "build the next map" step — split out so the
    // revive modal can call it after the player decides what to
    // do with their fallen heroes.
    loadNextMapLevel() {
      this.mapLevel += 1;
      const width = 32 + 4 * this.mapLevel;
      const height = 20 + 2 * this.mapLevel;
      const monsters = 4 * this.mapLevel;
      const loot = 4 + this.mapLevel;
      const newMap = generateMap({ width, height, monsters, loot });
      this.loadLevel(newMap);
    }

    // ---- revive modal -----------------------------------------

    openReviveModal() {
      this.reviveModalOpen = true;
      this.refreshReviveModal();
      const modal = document.getElementById('revive-modal');
      if (modal) modal.classList.add('open');
    }

    // Rebuilds the per-dead-hero row list. Called when opening the
    // modal and after every successful revive (which removes a row).
    // Buttons get fresh listeners each refresh — simpler than
    // diffing the DOM for a transient modal.
    refreshReviveModal() {
      const list = document.getElementById('revive-list');
      const multiEl = document.getElementById('revive-multi');
      if (multiEl) multiEl.textContent = this.scoreMulti.toFixed(2) + '×';
      if (!list) return;
      list.innerHTML = '';
      const dead = this.party.filter((c) => !c.active);
      for (const c of dead) {
        const row = document.createElement('div');
        row.className = 'revive-row';
        const name = document.createElement('span');
        name.className = 'revive-name';
        const color = '#' + (c.color || 0xffffff).toString(16).padStart(6, '0');
        name.style.color = color;
        name.textContent = c.heroName || c.role || 'Hero';
        const btn = document.createElement('button');
        btn.className = 'revive-btn';
        btn.textContent = 'Revive · −0.50×';
        btn.disabled = this.scoreMulti < 0.5;
        btn.addEventListener('click', () => this.reviveCharacter(c));
        row.appendChild(name);
        row.appendChild(btn);
        list.appendChild(row);
      }
    }

    reviveCharacter(character) {
      if (this.scoreMulti < 0.5) return;
      this.applyScoreMultiChange(
        -0.5, `Revived ${character.heroName}`, 'revive',
      );
      character.setActive(true).setVisible(true);
      if (character.body) character.body.enable = true;
      character.hp = character.maxHp;
      character.invuln = false;
      character.moveTarget = null;
      character.path = null;
      this.refreshReviveModal();
      // If everyone's back on their feet, close the modal and move
      // on — no point holding the player on an empty list.
      if (this.party.every((p) => p.active)) {
        this.closeReviveModal();
      }
    }

    closeReviveModal() {
      const modal = document.getElementById('revive-modal');
      if (modal) modal.classList.remove('open');
      this.reviveModalOpen = false;
      this.loadNextMapLevel();
    }

    onCollectChest(_character, chest) {
      // If the bag is full, leave the chest on the ground — picking
      // it up would silently drop a roll, which feels punishing.
      // The player can free up space by dragging items to the trash
      // slot in the character sheet.
      const item = generateRandomItem();
      if (!addToInventory(this.inventory, item)) return;
      // Snapshot the chest position before destroying it — the loot
      // popup wants to anchor at where the chest was, not where the
      // character ended up after the overlap.
      const chestX = chest.x;
      const chestY = chest.y;
      chest.destroy();
      // Popup colour matches the item's rarity so the player can read
      // the haul at a glance — same palette as the inventory card.
      showItemPopup(this, _character, item.name, itemRarityColor(item));
      // Big celebratory line above the chest spot ("SHINY!" / "New
      // swag!" etc.). Offset upward from the item popup so the two
      // don't collide visually.
      showLootMessage(this, chestX, chestY - 8);
      // Update the panel immediately so an already-open sheet shows
      // the new item. Closed sheets also re-render on next open.
      refreshEquipment();
      // Picking up the last chest may complete an adventure level.
      this.checkLevelCleared();
    }

    // Apply a timed stat buff to a character. The buff is also shown
    // as a quick label above the character ('+DEF', etc.) so the
    // player can see what just popped.
    applyBuff(character, buff) {
      character.buffs = character.buffs || [];
      const entry = {
        stats: { ...buff.stats },
        expiresAt: this.time.now + buff.durationMs,
      };
      character.buffs.push(entry);
      this.time.delayedCall(buff.durationMs, () => {
        const i = character.buffs.indexOf(entry);
        if (i >= 0) character.buffs.splice(i, 1);
      });
      const labelBits = [];
      for (const stat in buff.stats) {
        labelBits.push('+' + buff.stats[stat] + ' ' + statShortLabel(stat));
      }
      showBuffPopup(this, character, labelBits.join(' '));
    }

    // Sum of active buff bonuses for a given stat. Used by damage/
    // defense calcs alongside equipmentBonus.
    buffBonus(character, stat) {
      if (!character.buffs) return 0;
      let total = 0;
      for (const b of character.buffs) {
        const v = b.stats && b.stats[stat];
        if (typeof v === 'number') total += v;
      }
      return total;
    }

    onPlayerHit(character, enemy) {
      if (character.invuln || enemy.dying || !character.active) return;
      // Treat the enemy attack as a pseudo-skill: armor + active
      // buffs (e.g. Guard) reduce the base, then the damage pipeline
      // applies Resolve + per-tag resistance from the character's
      // resistances map.
      const defense = equipmentBonus(character.equipment, 'defense')
        + this.buffBonus(character, 'defense');
      const base = Math.max(0, (enemy.dmg || 1) - defense);
      const tags = enemy.attackTags || [TAGS.PHYSICAL, TAGS.MELEE];
      const damage = applyDamageFormula(base, tags, null, character);
      character.hp -= damage;
      character.invuln = true;
      character.setTint(0xff6666);

      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, character.x, character.y);
      character.setVelocity(Math.cos(angle) * 250, Math.sin(angle) * 250);
      character.moveTarget = null;
      // Knockback teleports the character off the prior path — the
      // next frame's pathfinding goal-selection will compute a fresh
      // one if anything's worth chasing.
      character.path = null;

      this.time.delayedCall(500, () => {
        if (character.clearTint) character.clearTint();
        character.invuln = false;
      });

      if (character.hp <= 0) {
        character.setActive(false).setVisible(false);
        // Tear down any active speech bubble so a final quip doesn't
        // linger in midair above the (now invisible) corpse.
        if (character.speechBubble) {
          character.speechBubble.destroy();
          character.speechBubble = null;
        }
        if (this.aliveParty().length === 0) this.gameOver();
      }
    }

    gameOver() {
      const cam = this.cameras.main;
      this.add.text(cam.midPoint.x, cam.midPoint.y - 28, 'GAME OVER', {
        font: 'bold 48px monospace', fill: '#fff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.modal);
      // End-of-run summary. Shows the level the party reached, the
      // final score, and the closing Score Multiplier so the player
      // can see how their LEVEL DOWN gambles paid off. Effective
      // level is shown alongside true level only when they diverge.
      const multiStr = `×${(this.scoreMulti || 1).toFixed(2)}`;
      const effStr = (this.effectiveLevel !== this.trueLevel)
        ? ` (eff ${this.effectiveLevel})`
        : '';
      const summary = this.mode === 'adventure'
        ? `Reached Map ${this.mapLevel}  ·  Party Lv ${this.trueLevel}${effStr}  ·  ${multiStr}  ·  Score: ${this.score}`
        : `Party Lv ${this.trueLevel}${effStr}  ·  ${multiStr}  ·  Score: ${this.score}`;
      this.add.text(cam.midPoint.x, cam.midPoint.y + 24, summary, {
        font: '20px monospace', fill: '#ccc',
        stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.modal);
    }


  };
}
