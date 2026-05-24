// All HUD, floating-UI, and visual-popup code for the game scene.
//
// Split out of scene.js so the scene class focuses on gameplay logic
// (movement, combat, pathfinding, progression) and presentation lives
// here. Every function takes the scene as its first argument and
// reaches into scene state directly — they're conceptually still
// "methods on the scene", just hosted in a separate module.
//
// What lives here:
//   - HUD chrome:       buildHud, updateHud, rebuildSkillIcons
//   - Floating bars:    updateFloatingHpBars (party HP + hovered enemy)
//   - Floating rings:   drawPersonalityRings
//   - Popups:           showDamageNumber, showItemPopup, showBuffPopup
//   - Banner messages:  showLevelCompleteMessage, showLevelUpMessage
//
// The scene owns the underlying objects (text refs, graphics, etc.)
// because they have to persist across frames and survive level
// transitions; these functions just mutate them.

import { TILE, SIGHT_RANGE, DEPTH } from './config.js';
import { SKILLS } from './skills.js';
import { isAnySheetOpen } from './character-sheet.js';
import { cumulativeKillsForLevel } from './scene.js';

// ---- HUD chrome -----------------------------------------------------

// Builds the static HUD: per-character HP texts top-left, the items
// and score readouts beneath, and the bottom-anchored skill cooldown
// rows. Also creates the shared graphics + text used by the floating
// HP bars (those are world-space and live at DEPTH.overlay, not on
// the screen-space HUD layer).
export function buildHud(scene) {
  const hudStyle = {
    font: '14px monospace', fill: '#fff',
    backgroundColor: '#000a', padding: { x: 6, y: 3 },
  };

  // Per-character HP, stacked top-left.
  let y = 8;
  for (const c of scene.party) {
    c.hpText = scene.add.text(8, y, '', hudStyle)
      .setScrollFactor(0).setDepth(DEPTH.hud);
    y += 22;
  }
  scene.inventoryText = scene.add.text(8, y, 'Items: 0/12', hudStyle)
    .setScrollFactor(0).setDepth(DEPTH.hud);
  y += 22;
  scene.scoreText = scene.add.text(8, y, 'Score: 0', hudStyle)
    .setScrollFactor(0).setDepth(DEPTH.hud);

  // Floating HP bars (party: always green; hovered enemy: red).
  // Single shared graphics object — cleared and redrawn each frame by
  // updateFloatingHpBars. World-space (no scrollFactor=0) so the bars
  // follow their sprites around the map.
  scene.floatingHpBars = scene.add.graphics().setDepth(DEPTH.overlay);
  // Name label that appears below a hovered enemy. Hidden by default;
  // updateFloatingHpBars positions/shows it.
  scene.hoveredEnemyName = scene.add.text(0, 0, '', {
    font: 'bold 11px monospace', fill: '#ffaaaa',
    stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5, 0).setDepth(DEPTH.overlay).setVisible(false);
  // Name label for hovered party member — tinted with their rainbow
  // colour so the player can tell at a glance which hero they're
  // pointing at. Colour is set per-frame in updateFloatingHpBars.
  scene.hoveredCharacterName = scene.add.text(0, 0, '', {
    font: 'bold 11px monospace', fill: '#ffffff',
    stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5, 0).setDepth(DEPTH.overlay).setVisible(false);

  // Skill cooldown bars: one row per character, anchored bottom-left.
  // The character label stays put; the skill icons rebuild on
  // equipment changes (rebuildSkillIcons).
  scene.party.forEach((c, charIdx) => {
    const baseY = skillRowBaseY(scene, charIdx);
    const lbl = scene.add.text(8, baseY + 2, c.label, {
      font: '12px monospace', fill: '#fff',
    }).setScrollFactor(0).setDepth(DEPTH.hud);
    c._hudCharLabel = lbl;
    rebuildSkillIcons(scene, c, charIdx);
  });
}

function skillRowBaseY(scene, charIdx) {
  const h = 18, rowGap = 4;
  const totalRows = scene.party.length;
  return scene.cameras.main.height - 8 - h - (totalRows - 1 - charIdx) * (h + rowGap);
}

// Destroys and recreates a character's skill cooldown icons. The
// character label stays put — this only touches the bar widgets, so
// changes to skillKeys (from equipping a weapon, etc.) update the
// HUD without flashing the label.
export function rebuildSkillIcons(scene, character, charIdx) {
  if (character.skillIcons) {
    for (const key in character.skillIcons) {
      const icon = character.skillIcons[key];
      if (icon.bg) icon.bg.destroy();
      if (icon.fill) icon.fill.destroy();
      if (icon.label) icon.label.destroy();
    }
  }
  character.skillIcons = {};

  const w = 88, h = 18, gap = 5;
  const baseY = skillRowBaseY(scene, charIdx);
  let x = 8 + 16; // step past the character label slot
  for (const key of character.skillKeys || []) {
    const skill = SKILLS[key];
    if (!skill) continue;
    const bg = scene.add.rectangle(x, baseY, w, h, 0x111111, 0.85)
      .setOrigin(0, 0).setStrokeStyle(1, 0x555555);
    const fill = scene.add.rectangle(x, baseY, w, h, skill.color || 0xffffff, 0.35)
      .setOrigin(0, 0);
    const label = scene.add.text(x + 6, baseY + 2, skill.name, {
      font: '11px monospace', fill: '#fff',
    });
    [bg, fill, label].forEach((o) => o.setScrollFactor(0).setDepth(DEPTH.hud));
    character.skillIcons[key] = { bg, fill, label, fullW: w };
    x += w + gap;
  }
}

// Per-frame refresh of all HUD text + cooldown fill widths.
export function updateHud(scene) {
  for (const c of scene.party) {
    const who = c.heroName || c.label;
    const hpStr = `${who}: ${Math.max(0, c.hp)}/${c.maxHp}`;
    c.hpText.setText(c.active ? hpStr : `${who}: DEAD`);
    if (!c.active) {
      c.hpText.setColor('#666666');
    } else if (scene.isFleeing(c)) {
      // Override with red so the danger state is unmistakable even
      // for a character whose normal tint is also warm-toned.
      c.hpText.setColor('#ff8888');
    } else {
      // Normal state — tinted with the character's rainbow colour
      // so each hero's HP line is identifiable at a glance.
      const colorHex = '#' + (c.color || 0xffffff).toString(16).padStart(6, '0');
      c.hpText.setColor(colorHex);
    }
  }
  const itemCount = scene.inventory.items.filter(Boolean).length;
  scene.inventoryText.setText('Items: ' + itemCount + '/12');
  // XP progress within the current party level: kills since the
  // last level-up out of kills needed for the next one. The running
  // total (scene.monstersKilled) is cumulative; subtract the
  // cumulative-at-current-level floor to get a "per-level" count.
  const xpFloor = cumulativeKillsForLevel(scene.trueLevel);
  const xpCeiling = cumulativeKillsForLevel(scene.trueLevel + 1);
  const xpInLevel = scene.monstersKilled - xpFloor;
  const xpNeeded = xpCeiling - xpFloor;
  // Show effective level alongside true level only when they
  // diverge (i.e. the player has chosen LEVEL DOWN at least once).
  // Keeps the HUD clean for the common "always Level UP" path.
  const effLabel = (scene.effectiveLevel != null && scene.effectiveLevel !== scene.trueLevel)
    ? ` (eff ${scene.effectiveLevel})`
    : '';
  const xpLabel = `Lv ${scene.trueLevel}${effLabel} [${xpInLevel}/${xpNeeded}]`;
  // Score Multiplier display — toFixed(2) lines up the 0.01 ticks
  // from "Feed the Demon" with the 0.10 / 0.50 / 1.00 chunks from
  // level-choice and revive prompts.
  const multiLabel = `×${(scene.scoreMulti || 1).toFixed(2)}`;
  const scoreLabel = scene.mode === 'adventure'
    ? `Score: ${scene.score} (${multiLabel}) · Map ${scene.mapLevel} · ${xpLabel}`
    : `Score: ${scene.score} (${multiLabel}) · ${xpLabel}`;
  scene.scoreText.setText(scoreLabel);

  for (const c of scene.party) {
    if (!c.active) continue;
    for (const key of c.skillKeys) {
      const skill = SKILLS[key];
      const state = c.skills[key];
      // Bar fills relative to the *actual* cooldown that was set on
      // the last fire — which is reduced by attack_speed gear. Falls
      // back to the skill's base cooldown for the first frame before
      // a skill has fired.
      const denom = state.maxCooldown || skill.cooldownMs;
      const ready = 1 - (state.cooldown / denom);
      c.skillIcons[key].fill.width = c.skillIcons[key].fullW * ready;
    }
  }
}

// ---- Floating HP bars + hovered-enemy name --------------------------

// Per-frame redraw. Party bars (green) always show above each active
// character; the hovered enemy (if any) gets a red bar above and its
// display name below. Pointer tracking happens via setInteractive in
// placeMonster.
//
// Single shared graphics object: cleared and rebuilt each frame.
// Cheap for ~15 bars, and lets us drive everything from current hp /
// maxHp without per-sprite bar objects to keep in sync.
export function updateFloatingHpBars(scene) {
  const g = scene.floatingHpBars;
  g.clear();

  // Party: always-on HP bars tinted with each hero's rainbow colour.
  // Falls back to white for any character missing a color assignment.
  for (const c of scene.party) {
    if (!c.active) continue;
    drawHpBar(g, c.x, c.y - TILE * 0.6, c.hp, c.maxHp, c.color || 0xffffff);
    // Speech bubbles follow the character — reposition each frame so
    // the thought cloud stays anchored above them while they move.
    // Offset matches the container y in showCharacterComment so the
    // tail puffs hover just above the HP bar.
    if (c.speechBubble) {
      c.speechBubble.setPosition(c.x, c.y - TILE * 1.3);
    }
  }

  // Hovered party member: show their name below the sprite in their
  // own colour. Skips the rendering for a dead/inactive character so
  // pointing at a corpse doesn't display a label.
  const hc = scene.hoveredCharacter;
  if (hc && hc.active) {
    const label = hc.heroName || hc.role || 'Hero';
    const colorHex = '#' + (hc.color || 0xffffff).toString(16).padStart(6, '0');
    if (scene.hoveredCharacterName.text !== label) {
      scene.hoveredCharacterName.setText(label);
    }
    scene.hoveredCharacterName.setColor(colorHex);
    scene.hoveredCharacterName.setPosition(hc.x, hc.y + TILE * 0.45);
    if (!scene.hoveredCharacterName.visible) scene.hoveredCharacterName.setVisible(true);
  } else if (scene.hoveredCharacterName.visible) {
    scene.hoveredCharacterName.setVisible(false);
  }

  // Hovered enemy: red bar above + name label below. The active /
  // dying check guards against pointing at a sprite that's been
  // killed or destroyed since the last pointerover.
  const h = scene.hoveredEnemy;
  if (h && h.active && !h.dying) {
    drawHpBar(g, h.x, h.y - TILE * 0.6, h.hp, h.maxHp, 0xff5555);
    // Only rebuild the text object when the displayed name actually
    // changes — keeps per-frame allocation down.
    const label = h.displayName || h.type || 'Enemy';
    if (scene.hoveredEnemyName.text !== label) {
      scene.hoveredEnemyName.setText(label);
    }
    scene.hoveredEnemyName.setPosition(h.x, h.y + TILE * 0.45);
    if (!scene.hoveredEnemyName.visible) scene.hoveredEnemyName.setVisible(true);
  } else if (scene.hoveredEnemyName.visible) {
    scene.hoveredEnemyName.setVisible(false);
  }
}

// Draws one floating HP bar at world (cx, cy), where cy is the *top
// edge* of the bar. Fill colour is the party / enemy tint; the
// background and border are constant for visual consistency.
function drawHpBar(g, cx, cy, hp, maxHp, fillColor) {
  const w = 28, h = 4;
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy);
  // Dark outline so the bar reads against any tile colour.
  g.fillStyle(0x000000, 0.7);
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  // Empty bar background.
  g.fillStyle(0x222226, 0.95);
  g.fillRect(x, y, w, h);
  // Filled portion. Clamp the ratio so an over-heal (or post-recalc
  // negative delta) doesn't draw outside the bar.
  const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
  g.fillStyle(fillColor, 1.0);
  g.fillRect(x, y, Math.round(w * ratio), h);
}

// Per-character personality rings (preferred-distance ring always,
// plus a faint sight-range ring when a character sheet is open as
// a tuning aid).
export function drawPersonalityRings(scene) {
  scene.personalityRing.clear();
  const sheetOpen = isAnySheetOpen();
  for (const c of scene.party) {
    if (!c.active) continue;
    const fleeing = scene.isFleeing(c);
    const color = fleeing ? 0xff5555 : 0x4cc9f0;
    const alpha = fleeing ? 0.45 : 0.22;
    if (c.personality.preferredDistance > 0) {
      scene.personalityRing.lineStyle(1, color, alpha);
      scene.personalityRing.strokeCircle(c.x, c.y, c.personality.preferredDistance);
    }
    if (sheetOpen) {
      scene.personalityRing.lineStyle(1, 0xff8800, 0.18);
      scene.personalityRing.strokeCircle(c.x, c.y, SIGHT_RANGE);
    }
  }
}

// ---- Encouragement messages ----------------------------------------
//
// Big celebratory text that pops when a monster dies or a chest is
// opened. Independent of the smaller "+ Item Name" / damage-number
// popups — those still fire alongside, layered underneath.

const KILL_MESSAGES = [
  'DEAD!', 'Nice shot!', 'Eat that!', 'BOOM!', 'Smashed!',
  'Splat!', 'Take that!', 'Annihilated!', 'Yeet!', 'Toast!',
  'Get rekt!', 'Bonk!', 'K.O.!', 'Smithereens!', 'Adios!',
  'Cooked!', 'Lights out!', 'Goodnight!', 'Bye-bye!', 'Crispy!',
  'Nailed it!', 'Hasta la vista!', 'POW!', 'Crunch!', 'Wallop!',
  'Yikes!', 'Whoops!', 'Vanquished!', 'DECEASED!', "Got 'em!",
];

const LOOT_MESSAGES = [
  'New swag!', 'This will look good on me!', 'MINE!', 'SHINY!',
  'Treasure!', 'Score!', 'Sweet loot!', 'Cha-ching!',
  'Finders keepers!', 'Look at that!', 'Ooh, fancy!', 'Jackpot!',
  'Pocket it!', "I'll take that!", "Don't mind if I do!",
  "What's this?", 'Shopping spree!', 'Loot get!', 'Bling bling!',
  'All mine!',
];

// Fun-leaning palette — random colour picked per message so a burst
// of kills doesn't read as one solid block of text.
const ENCOURAGEMENT_COLORS = [
  0xffdd55, 0xffa53b, 0xff77dd, 0xaa99ff,
  0x88ccff, 0x66ee88, 0xff8866, 0xffeeaa,
];

export function showKillMessage(scene, x, y) {
  showEncouragement(scene, x, y, KILL_MESSAGES);
}

export function showLootMessage(scene, x, y) {
  showEncouragement(scene, x, y, LOOT_MESSAGES);
}

// Picks a random line from `messages`, plops it above (x, y) with a
// little rotation + horizontal jitter, then runs a two-stage tween:
//   1. Pop in (scale 0.3 → 1.0, alpha 0 → 1, Back.easeOut) — feels
//      springy without being slow.
//   2. Hold briefly, then float up + scale slightly more while
//      fading to 0 — gives the message a definite "delivered" beat
//      before it leaves.
function showEncouragement(scene, x, y, messages) {
  const msg = messages[Math.floor(Math.random() * messages.length)];
  const color = ENCOURAGEMENT_COLORS[Math.floor(Math.random() * ENCOURAGEMENT_COLORS.length)];
  const fill = '#' + color.toString(16).padStart(6, '0');
  // Horizontal jitter spreads simultaneous messages (an AoE kill that
  // takes out three goblins) instead of stacking them on top of each
  // other. Rotation gives the text a comic-book tilt.
  const jitterX = (Math.random() - 0.5) * 36;
  const jitterY = (Math.random() - 0.5) * 8;
  const rotation = (Math.random() - 0.5) * 0.32;

  const t = scene.add.text(x + jitterX, y - 28 + jitterY, msg, {
    font: 'bold 20px monospace', fill,
    stroke: '#000', strokeThickness: 5,
  })
    .setOrigin(0.5)
    .setDepth(DEPTH.fx + 2)
    .setScale(0.3)
    .setAlpha(0)
    .setRotation(rotation);

  scene.tweens.add({
    targets: t,
    scale: 1.0,
    alpha: 1,
    duration: 220,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: t,
        y: t.y - 30,
        alpha: 0,
        scale: 1.25,
        duration: 800,
        delay: 220,
        ease: 'Cubic.easeIn',
        onComplete: () => t.destroy(),
      });
    },
  });
}

// ---- Transient popups ---------------------------------------------

// Floating "+ Item Name" above a character when a chest is collected.
// Colour matches the item's rarity (see itemRarityColor in
// item-generator.js).
export function showItemPopup(scene, near, label, color = 0xffe680) {
  const fill = '#' + (color & 0xffffff).toString(16).padStart(6, '0');
  const t = scene.add.text(near.x, near.y - 20, '+ ' + label, {
    font: '11px monospace', fill,
    stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5).setDepth(DEPTH.fx);
  scene.tweens.add({
    targets: t, y: t.y - 22, alpha: 0, duration: 900,
    onComplete: () => t.destroy(),
  });
}

// Floating damage number that rises and fades above the target.
// Colour matches the skill so fire hits look orange, physical white,
// etc. — a quick visual readout of what just connected.
export function showDamageNumber(scene, target, amount, color) {
  const fill = '#' + (color & 0xffffff).toString(16).padStart(6, '0');
  const t = scene.add.text(target.x, target.y - 14, String(amount), {
    font: 'bold 14px monospace', fill,
    stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5).setDepth(DEPTH.fx);
  scene.tweens.add({
    targets: t, y: t.y - 28, alpha: 0, duration: 700,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

// Star-burst impact spark that pops at the hit location. Used by
// every successful attack via damageEnemy — gives a consistent
// "thunk" of feedback on top of any skill-specific visual (the
// fireball burst, lightning beam, frost puff, etc. still play
// underneath). Size scales gently with the damage dealt so a heavy
// crit looks weightier without spiraling on huge numbers.
//
// The star tweens out with a slight rotation so it reads as a
// flash rather than a static decal — short duration (~320 ms) so
// repeated hits don't pile up visually.
export function showHitSpark(scene, x, y, color, magnitude = 1) {
  const m = Math.max(1, Number(magnitude) || 1);
  const outer = Math.min(20, 7 + m * 1.2);
  const inner = outer * 0.42;
  const star = scene.add.star(x, y, 5, inner, outer, color, 0.95)
    .setDepth(DEPTH.fx + 1)
    .setScale(0.35)
    .setRotation(Math.random() * Math.PI * 2);
  scene.tweens.add({
    targets: star,
    scale: 1.25,
    alpha: 0,
    angle: star.angle + 45,
    duration: 320,
    ease: 'Cubic.easeOut',
    onComplete: () => star.destroy(),
  });
}

// Short "+3 DEF for 4s" style label above a character when a buff
// activates. applyBuff (scene-side) builds the label string.
export function showBuffPopup(scene, character, label) {
  const t = scene.add.text(character.x, character.y - 16, label, {
    font: 'bold 10px monospace', fill: '#88ccff',
    stroke: '#000', strokeThickness: 3,
  }).setOrigin(0.5).setDepth(DEPTH.fx);
  scene.tweens.add({
    targets: t, y: t.y - 14, alpha: 0, duration: 1100,
    onComplete: () => t.destroy(),
  });
}

// ---- Character speech bubbles -------------------------------------

// Total visible hold (before fade-out begins). Generous because the
// bubbles are sentence-length lines that the player should be able
// to read without rushing.
const SPEECH_HOLD_MS = 5000;
const SPEECH_FADE_IN_MS = 220;
const SPEECH_FADE_OUT_MS = 600;

// Pops a thought-bubble comment above the character. The bubble is
// a Phaser Container holding:
//   - A rounded white background with a thin dark stroke.
//   - Two small "thought puffs" dangling below the bubble toward
//     the character, giving the cloud a tail.
//   - The line of text in the character's rainbow colour.
// updateFloatingHpBars repositions the container each frame so the
// bubble follows the speaker as they move. If the character already
// has an active bubble we tear it down first — one line at a time.
export function showCharacterComment(scene, character, text) {
  if (character.speechBubble) {
    character.speechBubble.destroy();
    character.speechBubble = null;
  }

  const color = character.color || 0xffffff;
  const fill = '#' + color.toString(16).padStart(6, '0');

  // Build the text first so we can measure it. Thin black stroke
  // gives the coloured letters definition against the white bg
  // without the bold-outlined look the on-canvas popups need.
  const txt = scene.add.text(0, 0, text, {
    font: 'bold 16px monospace', fill,
    stroke: '#222222', strokeThickness: 1,
    wordWrap: { width: 240, useAdvancedWrap: true },
    align: 'center',
  }).setOrigin(0.5, 1);

  const pad = 9;
  const w = txt.width  + pad * 2;
  const h = txt.height + pad * 2;

  // Rounded white bubble background. Anchored so the bottom-centre
  // of the bg matches the bottom-centre of the text (which itself
  // sits at the container's local origin, so the container's
  // position is the bubble's bottom-centre in world space).
  const bg = scene.add.graphics();
  bg.fillStyle(0xffffff, 0.96);
  bg.lineStyle(2, 0x222222, 0.9);
  bg.fillRoundedRect(-w / 2, -h + pad, w, h, 10);
  bg.strokeRoundedRect(-w / 2, -h + pad, w, h, 10);
  // Thought-bubble tail: two shrinking puffs trailing toward the
  // character below. Drawn last so they sit beneath the cloud's
  // border but visually feel like part of the bubble.
  bg.fillStyle(0xffffff, 0.96);
  bg.fillCircle(3,  pad + 4,  5);
  bg.strokeCircle(3, pad + 4, 5);
  bg.fillCircle(0,  pad + 14, 3);
  bg.strokeCircle(0, pad + 14, 3);

  // Order: bg first so it draws behind the text.
  const container = scene.add
    .container(character.x, character.y - TILE * 1.3, [bg, txt])
    .setDepth(DEPTH.overlay)
    .setAlpha(0);
  character.speechBubble = container;

  // Fade in, hold for SPEECH_HOLD_MS, fade out, destroy. Splitting
  // the tween into two stages (vs one with a `hold` property) keeps
  // the bubble at full opacity for the readable window.
  scene.tweens.add({
    targets: container, alpha: 1, duration: SPEECH_FADE_IN_MS,
  });
  scene.time.delayedCall(SPEECH_HOLD_MS, () => {
    if (!container.scene) return;
    scene.tweens.add({
      targets: container, alpha: 0, duration: SPEECH_FADE_OUT_MS,
      onComplete: () => {
        if (character.speechBubble === container) character.speechBubble = null;
        container.destroy();
      },
    });
  });
}

// ---- Banner messages ----------------------------------------------

// Big "LEVEL N COMPLETED" banner that pops in, holds, then fades and
// triggers the scene's level advancement.
export function showLevelCompleteMessage(scene) {
  const cam = scene.cameras.main;
  const text = scene.add.text(
    cam.midPoint.x, cam.midPoint.y,
    'LEVEL ' + scene.mapLevel + ' COMPLETED',
    {
      font: 'bold 36px monospace', fill: '#88ccff',
      stroke: '#000', strokeThickness: 5,
    },
  ).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.modal).setAlpha(0);
  scene.tweens.add({ targets: text, alpha: 1, duration: 400 });
  scene.time.delayedCall(1500, () => {
    scene.tweens.add({
      targets: text, alpha: 0, duration: 400,
      onComplete: () => {
        text.destroy();
        scene.advanceToNextLevel();
      },
    });
  });
}

// LEVEL UP / LEVEL DOWN banner. Called once per applied level — the
// scene's tryAdvanceLevelUp pipeline only ever applies one level at
// a time (the player's choice modal sits between thresholds), so we
// no longer need a (+N levels) suffix.
//
// `choice` is the string 'up' or 'down'. Both variants include the
// score-multi delta on a second line so the player sees the cost /
// reward without having to open the character sheet.
export function showLevelUpMessage(scene, choice) {
  const isDown = choice === 'down';
  const cam = scene.cameras.main;
  const headline = isDown
    ? 'LEVEL DOWN!'
    : `LEVEL UP!  Party reached level ${scene.trueLevel}`;
  const multiLine = isDown ? '+1.00× Score Multi' : '−0.10× Score Multi';
  const fill = isDown ? '#ff77aa' : '#ffe066';
  const multiFill = isDown ? '#88ff88' : '#ff8888';
  const headlineText = scene.add.text(
    cam.midPoint.x, cam.midPoint.y - 50, headline,
    {
      font: 'bold 22px monospace', fill,
      stroke: '#000', strokeThickness: 4,
    },
  ).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.modal).setAlpha(0);
  const multiText = scene.add.text(
    cam.midPoint.x, cam.midPoint.y - 22, multiLine,
    {
      font: 'bold 16px monospace', fill: multiFill,
      stroke: '#000', strokeThickness: 3,
    },
  ).setOrigin(0.5).setScrollFactor(0).setDepth(DEPTH.modal).setAlpha(0);
  scene.tweens.add({ targets: [headlineText, multiText], alpha: 1, duration: 250 });
  scene.time.delayedCall(1200, () => {
    scene.tweens.add({
      targets: [headlineText, multiText],
      alpha: 0, y: '-=30', duration: 500,
      onComplete: () => {
        headlineText.destroy();
        multiText.destroy();
      },
    });
  });
}
