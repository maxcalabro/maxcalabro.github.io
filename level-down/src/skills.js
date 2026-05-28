// Cooldown abilities the character auto-casts.
//
// SKILLS is the catalog of every skill in the game. Each character
// carries its own `skillKeys` array — computed from class defaults
// plus skills granted by equipped items (see scene.recomputeSkillsFor).
//
// Each skill carries:
//   - name, cooldownMs, range
//   - minRange (optional): a floor on engagement distance. Ranged
//     skills set this so the character can't fire bow-style attacks
//     at point-blank — pairs with melee skills in the same loadout to
//     produce a natural inner/outer engagement band.
//   - color: used both for the cast effect and the floating damage
//     number's tint
//   - damageType (optional): one of DAMAGE_TYPES (physical / fire /
//     poison / lightning / cold / bleeding). Every offensive skill
//     sets exactly one; resistance lookup uses this. Heal / buff
//     skills omit it.
//   - tags: array of SKILL_TAGS (Melee / Ranged / Magic). Purely
//     descriptive — drives stat scaling via SCALING_TAGS and is the
//     hook for future buffs like "+25% magic damage". Never affects
//     resistance.
//   - damage: nominal base damage (omitted for non-damage skills).
//   - targetType: 'enemy' (default) or 'self' or 'ally'.
//   - buff: optional { stats: {…}, mult: {…}, durationMs } for buff
//     skills. `stats` are additive (e.g. +3 defense); `mult` are
//     multiplicative (e.g. ×2 damage) — see scene.buffMultiplier.
//   - cast(scene, caster, target?): performs the effect.
//
// Two skill *kinds* beyond the usual cast-and-hit:
//   - Warcry: a cast skill that emanates from the caster and buffs
//     allies within `range`. Marked with `warcry: true` and an
//     `includeCaster` flag; its cast plays an expanding ring
//     (warcryRing) and calls scene.applyWarcry. Fires like a 'self'
//     skill (gated on an enemy being near so it isn't wasted).
//   - Aura: a PASSIVE — never cast. Marked with an `aura` map of
//     stat→bonus (keys match the gear-stat keys the speed pipelines
//     read). Every frame scene.recomputeAuras grants the bonus to all
//     allies (self included) within `range`. The skill loop skips
//     anything carrying `aura`.
//
// Damage skills end with `scene.applyDamage(caster, target, this)` —
// the scene dispatches to damageEnemy (player→enemy) or
// damageCharacter (enemy→party) based on which group `target`
// belongs to. The same SKILLS catalog is used for both directions,
// so monsters share the player skill pipeline (see updateEnemies
// in scene.js).

import { TILE, DEPTH } from './config.js';
import { TAGS } from './tags.js';

export const SKILLS = {
  // ---- Unarmed defaults ------------------------------------------
  // Used only when a character has no weapon at all. Equipping a
  // weapon removes BOTH of these (see scene.recomputeSkillsFor) — a
  // weapon-bearer doesn't punch or throw rocks anymore, they use the
  // skills their weapon grants.
  //
  // castTimeMs is the "commit window": the caster's movement is
  // frozen for this long after the cast fires, so attackers can't
  // tap-and-retreat with impunity.
  punch: {
    name: 'Punch',
    cooldownMs: 200,
    castTimeMs: 100,
    // Melee ranges run a little long (1.3+ tiles) so that two solid
    // circular bodies pressed against each other are still inside
    // strike range — centre-to-centre distance at contact is ~0.85
    // tile, the skill reaches comfortably past that.
    range: TILE * 1.3,
    damage: 2,
    color: 0xcccccc,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },
  throw_rock: {
    name: 'Throw Rock',
    cooldownMs: 1000,
    castTimeMs: 300,
    range: TILE * 5,
    // Don't lob a rock at someone already in your face — melee range.
    minRange: TILE * 2,
    damage: 5,
    color: 0xaaaaaa,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.RANGED],
    cast(scene, caster, target) { projectile(scene, caster, target, this, { radius: 4 }); },
  },

  // ---- Melee weapon attacks --------------------------------------
  // Slice / Cleave / Jab differentiate the three core weapon
  // archetypes. All physical+melee tags so Strength drives scaling.
  slice: {
    // Sword's bread-and-butter: fast, single target, modest damage.
    name: 'Slice',
    cooldownMs: 300,
    castTimeMs: 150,
    range: TILE * 1.6,
    damage: 10,
    color: 0xffffff,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },
  cleave: {
    // Axe sweeps in a cone in front of the caster — hits the primary
    // target and any other enemies inside the arc. Slower than Slice
    // and harder hitting, with a wider effective area against a pack.
    name: 'Cleave',
    cooldownMs: 400,
    castTimeMs: 250,
    range: TILE * 2.0,
    damage: 15,
    color: 0xffaa66,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    // 120-degree cone.
    coneHalfAngle: Math.PI / 3,
    cast(scene, caster, target) {
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const angle = Math.atan2(dy, dx);
      coneSwing(scene, caster, angle, this.coneHalfAngle, this.range, this.color);
      // Damage every enemy inside the cone, primary target included.
      scene.enemies.children.iterate((e) => {
        if (!e || !e.active || e.dying) return;
        const ex = e.x - caster.x;
        const ey = e.y - caster.y;
        const d = Math.hypot(ex, ey);
        if (d > this.range) return;
        const a = Math.atan2(ey, ex);
        let diff = a - angle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) > this.coneHalfAngle) return;
        scene.applyDamage(caster, e, this);
      });
    },
  },
  jab: {
    // Dagger's quick stab — very low cooldown, low damage. Stacks
    // small chip damage onto faster characters.
    name: 'Jab',
    cooldownMs: 220,
    castTimeMs: 120,
    range: TILE * 1.3,
    damage: 6,
    color: 0xffeecc,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },
  bonk: {
    // Universal staff melee. Lets every spellcaster smack a nearby
    // enemy when ranged would be wasted (target too close, or to
    // conserve the slower main spell). Low damage by design — the
    // staff's value is in the magical skill it grants.
    name: 'Bonk',
    cooldownMs: 400,
    castTimeMs: 200,
    range: TILE * 1.4,
    damage: 8,
    color: 0xddddff,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },

  // ---- Bow attack ------------------------------------------------
  // The Archer's bread-and-butter. A fast physical arrow with no
  // minRange (so the archer can still fire when something closes to
  // point-blank — kiting is driven by the Archer's preferredDistance,
  // not a skill floor). Physical damage scales with Strength; the
  // Archer's real edge is Agility, which speeds up both this attack
  // (attack-speed) and their footwork (move-speed) so they can keep
  // the range open and out-fire most enemies.
  arrow_shot: {
    name: 'Arrow Shot',
    cooldownMs: 600,
    castTimeMs: 120,
    range: TILE * 6,
    minRange: 0,
    damage: 10,
    color: 0xd8c070,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.RANGED],
    cast(scene, caster, target) { projectile(scene, caster, target, this, { radius: 4 }); },
  },

  // ---- Staff / wand spells ---------------------------------------
  fireball: {
    // Now an AoE: detonates on impact and hits everything within
    // aoeRadius of the burst centre. Slower than the old single-target
    // version to keep it a "commit" spell.
    name: 'Fireball',
    cooldownMs: 2500,
    castTimeMs: 500,
    range: TILE * 6,
    minRange: TILE * 2,
    damage: 80,
    color: 0xff8800,
    damageType: TAGS.FIRE,
    tags: [TAGS.RANGED, TAGS.MAGIC],
    aoeRadius: TILE * 2.1,
    cast(scene, caster, target) {
      projectile(scene, caster, target, this, {
        radius: 7,
        alpha: 1.0,
        duration: 360,
        skipTargetDamage: true,
        onHit: (s, tx, ty, skill) => {
          // Bright core flash that fades fast, sized to the actual
          // area of effect — reads as "this whole circle just got
          // cooked".
          const burst = s.add.circle(tx, ty, skill.aoeRadius, skill.color, 0.85)
            .setDepth(DEPTH.fx);
          s.tweens.add({
            targets: burst, scale: 1.4, alpha: 0, duration: 520,
            onComplete: () => burst.destroy(),
          });
          // Damage every enemy inside the burst radius.
          s.enemies.children.iterate((e) => {
            if (!e || !e.active || e.dying) return;
            const d = Math.hypot(e.x - tx, e.y - ty);
            if (d <= skill.aoeRadius) s.applyDamage(caster, e, skill);
          });
        },
      });
    },
  },
  firebolt: {
    // Very small aoe: detonates on impact and hits everything within
    // aoeRadius of the burst centre. Faster than fireball
    name: 'Firebolt',
    cooldownMs: 800,
    castTimeMs: 300,
    range: TILE * 6,
    minRange: TILE * 2,
    damage: 25,
    color: 0xff8800,
    damageType: TAGS.FIRE,
    tags: [TAGS.RANGED, TAGS.MAGIC],
    aoeRadius: TILE * 0.3,
    cast(scene, caster, target) {
      projectile(scene, caster, target, this, {
        radius: 7,
        alpha: 1.0,
        duration: 360,
        skipTargetDamage: false,
        onHit: (s, tx, ty, skill) => {
          // Bright core flash that fades fast, sized to the actual
          // area of effect — reads as "this whole circle just got
          // cooked".
          const burst = s.add.circle(tx, ty, skill.aoeRadius, skill.color, 0.85)
            .setDepth(DEPTH.fx);
          s.tweens.add({
            targets: burst, scale: 1.4, alpha: 0, duration: 520,
            onComplete: () => burst.destroy(),
          });
          // Damage every enemy inside the burst radius.
          s.enemies.children.iterate((e) => {
            if (!e || !e.active || e.dying) return;
            const d = Math.hypot(e.x - tx, e.y - ty);
            if (d <= skill.aoeRadius) s.applyDamage(caster, e, skill);
          });
        },
      });
    },
  },
  lightning_bolt: {
    // Linear beam: extends from caster through the target direction
    // out to skill.range, stopping at the first wall. Damages every
    // enemy whose centre lies within `halfWidth` of the line.
    name: 'Lightning Bolt',
    cooldownMs: 2200,
    castTimeMs: 420,
    range: TILE * 10,
    minRange: TILE * 2,
    damage: 60,
    color: 0xaaccff,
    damageType: TAGS.LIGHTNING,
    tags: [TAGS.RANGED, TAGS.MAGIC],
    halfWidth: TILE * 0.8,
    cast(scene, caster, target) {
      const dx = target.x - caster.x;
      const dy = target.y - caster.y;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist, uy = dy / dist;
      const fullEndX = caster.x + ux * this.range;
      const fullEndY = caster.y + uy * this.range;
      // Truncate at the first wall along the line.
      let endX = fullEndX, endY = fullEndY;
      const hit = scene.findFirstWallHit(caster.x, caster.y, fullEndX, fullEndY);
      if (hit) {
        endX = caster.x + (fullEndX - caster.x) * hit.t;
        endY = caster.y + (fullEndY - caster.y) * hit.t;
      }
      // Layered bolt: a thick outer glow + a bright white core. The
      // outer line sits on top of the floor and the core makes the
      // bolt read as electricity rather than a paintbrush stroke.
      const g = scene.add.graphics().setDepth(DEPTH.fx);
      g.lineStyle(6, this.color, 1.0);
      g.lineBetween(caster.x, caster.y, endX, endY);
      g.lineStyle(3, 0xffffff, 1.0);
      g.lineBetween(caster.x, caster.y, endX, endY);
      scene.tweens.add({
        targets: g, alpha: 0, duration: 480,
        onComplete: () => g.destroy(),
      });
      // Damage all enemies near the line.
      scene.enemies.children.iterate((e) => {
        if (!e || !e.active || e.dying) return;
        const d = pointToSegmentDistance(e.x, e.y, caster.x, caster.y, endX, endY);
        if (d <= this.halfWidth) scene.applyDamage(caster, e, this);
      });
    },
  },
  ice_knife: {
    // Single target with a 2s slow on hit (50% speed). Lower damage
    // than fireball but the chill controls a target's repositioning.
    name: 'Ice Knife',
    cooldownMs: 600,
    castTimeMs: 120,
    range: TILE * 5,
    minRange: TILE * 2,
    damage: 12,
    color: 0x88ccff,
    damageType: TAGS.COLD,
    tags: [TAGS.RANGED, TAGS.MAGIC],
    slowFactor: 0.5,
    slowDurationMs: 1500,
    cast(scene, caster, target) {
      projectile(scene, caster, target, this, {
        radius: 6,
        duration: 260,
        onHit: (s, tx, ty, skill) => {
          // Apply slow before damageEnemy fires (projectile handles
          // that). If the hit kills the target the slow is moot.
          if (target && target.active && !target.dying) {
            target.slowUntil = s.time.now + skill.slowDurationMs;
            target.slowFactor = skill.slowFactor;
          }
          // Frost puff visual — chunkier ring that hangs on briefly.
          const puff = s.add.circle(tx, ty, 12, skill.color, 0.95).setDepth(DEPTH.fx);
          s.tweens.add({
            targets: puff, scale: 2.4, alpha: 0, duration: 540,
            onComplete: () => puff.destroy(),
          });
        },
      });
    },
  },
  shock: {
    // Judgement Staff's offensive option — single target, ranged,
    // medium damage lightning. Pairs with Light Heal in the same
    // loadout so the wielder both buffs and pressures.
    name: 'Shock',
    cooldownMs: 800,
    castTimeMs: 300,
    range: TILE * 5,
    minRange: TILE * 2,
    damage: 15,
    color: 0xddeeff,
    damageType: TAGS.LIGHTNING,
    tags: [TAGS.RANGED, TAGS.MAGIC],
    cast(scene, caster, target) {
      projectile(scene, caster, target, this, {
        radius: 5,
        duration: 200,
        onHit: (s, tx, ty, skill) => {
          const flash = s.add.circle(tx, ty, 10, skill.color, 1.0).setDepth(DEPTH.fx);
          s.tweens.add({
            targets: flash, scale: 2.8, alpha: 0, duration: 380,
            onComplete: () => flash.destroy(),
          });
        },
      });
    },
  },

  // ---- Heals -----------------------------------------------------
  heal: {
    // Restores HP to the lowest-HP ally in range (caster counts as
    // an ally). Scales with Intelligence in healAlly().
    name: 'Heal',
    cooldownMs: 2000,
    castTimeMs: 300,
    range: TILE * 5,
    healing: 5,
    color: 0x88ff88,
    targetType: 'ally',
    tags: [TAGS.MAGIC],
    cast(scene, caster, target) {
      const glow = scene.add.circle(target.x, target.y, 18, 0x88ff88, 0.85)
        .setDepth(DEPTH.fx);
      scene.tweens.add({
        targets: glow, scale: 2.2, alpha: 0, duration: 750,
        onComplete: () => glow.destroy(),
      });
      scene.healAlly(caster, target, this.healing);
    },
  },
  light_heal: {
    // Cheaper, smaller heal. Faster cooldown so the Judgement Staff
    // user can top off allies between casts of Shock.
    name: 'Light Heal',
    cooldownMs: 2000,
    castTimeMs: 200,
    range: TILE * 5,
    healing: 2,
    color: 0xccffcc,
    targetType: 'ally',
    tags: [TAGS.MAGIC],
    cast(scene, caster, target) {
      const glow = scene.add.circle(target.x, target.y, 14, 0xccffcc, 0.85)
        .setDepth(DEPTH.fx);
      scene.tweens.add({
        targets: glow, scale: 1.9, alpha: 0, duration: 600,
        onComplete: () => glow.destroy(),
      });
      scene.healAlly(caster, target, this.healing);
    },
  },

  // ---- Armor-granted ---------------------------------------------
  guard: {
    name: 'Guard',
    cooldownMs: 8000,
    castTimeMs: 100,
    // The "range" for self-skills is the threat-detection radius —
    // we won't cast Guard if there are no enemies anywhere near.
    range: TILE * 6,
    color: 0x88ccff,
    targetType: 'self',
    tags: [],
    // Stat bonuses applied for durationMs ms via scene.applyBuff.
    // buffBonus(character, 'defense') sums these into the damage
    // pipeline when the character is hit.
    buff: { stats: { defense: 3 }, durationMs: 2500 },
    cast(scene, caster) { scene.applyBuff(caster, this.buff); },
  },

  // ---- Accessory-granted -----------------------------------------
  rejuvenation: {
    // Restores HP to the lowest-HP ally in range (caster counts as
    // an ally). Scales with Intelligence in healAlly().
    name: 'Rejuvenation',
    cooldownMs: 2000,
    castTimeMs: 300,
    range: TILE * 20,
    healing: 1,
    color: 0x88ff88,
    targetType: 'ally',
    tags: [TAGS.MAGIC],
    cast(scene, caster, target) {
      const glow = scene.add.circle(target.x, target.y, 18, 0x88ff88, 0.85)
        .setDepth(DEPTH.fx);
      scene.tweens.add({
        targets: glow, scale: 2.2, alpha: 0, duration: 750,
        onComplete: () => glow.destroy(),
      });
      scene.healAlly(caster, caster, this.healing);
    },
  },

  enrage: {
    name: 'Enrage',
    cooldownMs: 8000,
    castTimeMs: 100,
    // The "range" for self-skills is the threat-detection radius —
    // we won't cast Guard if there are no enemies anywhere near.
    range: TILE * 6,
    color: 0x88ccff,
    targetType: 'self',
    tags: [],
    // Stat bonuses applied for durationMs ms via scene.applyBuff.
    // buffBonus(character, 'defense') sums these into the damage
    // pipeline when the character is hit.
    buff: { stats: { damage: 5 }, durationMs: 2500 },
    cast(scene, caster) { scene.applyBuff(caster, this.buff); },
  },

  // ---- Helmet-granted --------------------------------------------
  // Warcry: rallies the team. An expanding ring bursts from the caster
  // and every OTHER ally within range gets a short multiplicative
  // damage buff (×2). The caster is excluded (includeCaster:false) —
  // it's a "lead the charge, empower the rest" effect. Fires like a
  // self-skill: only when an enemy is within range, so it isn't wasted
  // while wandering. Lives in the `head` skill slot (see scene.js).
  strengthening_warcry: {
    name: 'Strengthening Warcry',
    cooldownMs: 12000,
    castTimeMs: 250,
    range: TILE * 5,
    color: 0xff5544,
    targetType: 'self',
    tags: [],
    warcry: true,
    includeCaster: false,
    buff: { mult: { damage: 2 }, durationMs: 4000 },
    cast(scene, caster) {
      warcryRing(scene, caster, this.range, this.color);
      scene.applyWarcry(caster, this);
    },
  },

  // Aura: a persistent field. Never cast — scene.recomputeAuras grants
  // its bonuses to every ally (self included) inside `range` each
  // frame. Keys in `aura` match the gear-stat keys the attack-speed /
  // movement pipelines already read, so the bonus folds straight in.
  // Each specific aura is deduped per character (can't be double-
  // hasted). Lives in the `head` skill slot.
  haste_aura: {
    name: 'Haste Aura',
    range: TILE * 5,
    color: 0xffd23f,
    tags: [],
    aura: { attack_speed: 0.15, speed: 0.15 },
  },

  // ---- Enemy attacks --------------------------------------------
  // These live in the same SKILLS catalog so the cast / damage /
  // projectile pipeline is one system. Monsters carry one skill key
  // (see monsters.js `skill`) and updateEnemies fires it at the
  // nearest party member when the cooldown clears.
  //
  // `damage` on these is a fallback — scene.damageCharacter uses the
  // monster archetype's `dmg` as base when present so map-level
  // scaling carries through. `extraDamage` is a separately-resisted
  // per-type bonus, used to model attacks that mix elements (a
  // goblin's poison-tipped arrow, a skeleton's bone-chilling claw).

  // Fast melee biter — rats and bats. Cooldown matches the player's
  // invuln window so contact-range targets take steady damage.
  bite: {
    name: 'Bite',
    cooldownMs: 500,
    castTimeMs: 0,
    range: TILE * 1.2,
    damage: 3,
    color: 0xff8888,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },

  // Skeleton's signature claw — physical hit with a sliver of cold
  // damage tacked on. The cold portion is taxed by the target's
  // cold resistance independently.
  claw_cold: {
    name: 'Cold Claw',
    cooldownMs: 700,
    castTimeMs: 0,
    range: TILE * 1.3,
    damage: 2,
    color: 0xaaddff,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    extraDamage: { [TAGS.COLD]: 2 },
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },

  // Crab pincer — heavier physical hit with a bleeding side-effect.
  pinch: {
    name: 'Pinch',
    cooldownMs: 1000,
    castTimeMs: 0,
    range: TILE * 1.3,
    damage: 2,
    color: 0xffaaaa,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    extraDamage: { [TAGS.BLEEDING]: 2 },
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },

  // Slow shambling zombie melee. Lower cooldown than a rat bite so
  // the zombie reads as a slow-but-scary threat rather than a
  // chip-damage chip.
  zombie_grab: {
    name: 'Zombie Grab',
    cooldownMs: 1200,
    castTimeMs: 0,
    range: TILE * 1.3,
    damage: 5,
    color: 0xaadd88,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.MELEE],
    cast(scene, caster, target) { meleeSwing(scene, caster, target, this); },
  },

  // Plain ranged arrow — pure physical. Player-usable too if we add
  // a bow item later (the skill stands on its own).
  shoot_arrow: {
    name: 'Shoot Arrow',
    cooldownMs: 1000,
    castTimeMs: 0,
    range: TILE * 5,
    minRange: 0,
    damage: 3,
    color: 0xc8a060,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.RANGED],
    cast(scene, caster, target) { projectile(scene, caster, target, this, { radius: 4 }); },
  },

  // Goblin's poison-tipped arrow — same projectile look as
  // shoot_arrow but with a separately-resisted poison rider.
  goblin_shot: {
    name: 'Poison Arrow',
    cooldownMs: 1100,
    castTimeMs: 0,
    range: TILE * 5,
    minRange: 0,
    damage: 2,
    color: 0xaacc66,
    damageType: TAGS.PHYSICAL,
    tags: [TAGS.RANGED],
    extraDamage: { [TAGS.POISON]: 3 },
    cast(scene, caster, target) { projectile(scene, caster, target, this, { radius: 4 }); },
  },

  // Spider venom — single-type poison ranged spit. No physical
  // damage to balance the very high poison resistance some targets
  // could carry; the player can shut it down with poison resist.
  spider_spit: {
    name: 'Venom Spit',
    cooldownMs: 1300,
    castTimeMs: 0,
    range: TILE * 4,
    minRange: 0,
    damage: 3,
    color: 0x88dd44,
    damageType: TAGS.POISON,
    tags: [TAGS.RANGED],
    cast(scene, caster, target) { projectile(scene, caster, target, this, { radius: 5 }); },
  },

  // Evil wizard's fire bolt — single-target fire projectile with a
  // bright burst on impact. Kept single-target (no AoE) so the
  // wizard is a damage threat without needing the cleave-style
  // group-iterate code.
  wizard_fire: {
    name: 'Wizard Fire',
    cooldownMs: 2200,
    castTimeMs: 0,
    range: TILE * 6,
    minRange: TILE * 2,
    damage: 6,
    color: 0xff8800,
    damageType: TAGS.FIRE,
    tags: [TAGS.RANGED, TAGS.MAGIC],
    cast(scene, caster, target) {
      projectile(scene, caster, target, this, {
        radius: 6,
        alpha: 0.95,
        duration: 320,
        onHit: (s, tx, ty, skill) => {
          // Small impact burst — purely cosmetic since damage is
          // single-target via the projectile's default path.
          const burst = s.add.circle(tx, ty, 14, skill.color, 0.7)
            .setDepth(DEPTH.fx);
          s.tweens.add({
            targets: burst, scale: 1.6, alpha: 0, duration: 280,
            onComplete: () => burst.destroy(),
          });
        },
      });
    },
  },
};

// ---- helpers (private to this module) --------------------

function meleeSwing(scene, caster, target, skill) {
  // Melee strikes used to draw a tile-sized rectangle here, but
  // damageEnemy now emits a star-burst spark sized to the damage
  // dealt — that handles all the impact feedback in one place,
  // shared with ranged and AoE attacks. meleeSwing just lands the
  // hit; the spark does the visual work.
  scene.applyDamage(caster, target, skill);
}

// Filled cone fanning out from caster at the given orientation. Used
// by Cleave's visual; the hit detection runs in cleave's cast.
function coneSwing(scene, caster, angle, halfCone, range, color) {
  const g = scene.add.graphics().setDepth(DEPTH.fx);
  g.fillStyle(color, 0.65);
  g.beginPath();
  g.moveTo(caster.x, caster.y);
  g.arc(caster.x, caster.y, range, angle - halfCone, angle + halfCone, false);
  g.closePath();
  g.fillPath();
  scene.tweens.add({
    targets: g, alpha: 0, duration: 420,
    onComplete: () => g.destroy(),
  });
}

// Expanding ring centred on the caster — the visual for a Warcry.
// Starts as a tiny disc and scales out to `range`, fading as it goes,
// with a bright stroked edge so it reads as a pulse sweeping over the
// allies it buffs.
function warcryRing(scene, caster, range, color) {
  const ring = scene.add.circle(caster.x, caster.y, range, color, 0.18)
    .setDepth(DEPTH.fx);
  ring.setStrokeStyle(3, color, 0.9);
  ring.setScale(0.1);
  scene.tweens.add({
    targets: ring, scale: 1, alpha: 0, duration: 500,
    onComplete: () => ring.destroy(),
  });
}

// Perpendicular distance from point P to segment AB. Used by
// Lightning Bolt to decide which enemies the beam grazes.
function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const ab2 = abx * abx + aby * aby;
  if (ab2 === 0) return Math.hypot(apx, apy);
  let t = (apx * abx + apy * aby) / ab2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

// Shared projectile launcher. Used by throw_rock, fireball, ice_knife,
// shock. Honours walls in the path: a line-segment vs AABB check
// (provided by scene.findFirstWallHit) finds the first wall in the
// way. If one is in range, the tween ends at the wall-hit point and
// damage is skipped — a small puff plays so the player sees the
// deflection.
//
// On clear line: opts.onHit (if provided) fires at the impact point,
// then damageEnemy runs against the original target — unless
// opts.skipTargetDamage is set, in which case onHit is responsible
// for all damage (used by AoE skills like Fireball, where the burst
// hits the original target along with everyone else).
function projectile(scene, caster, target, skill, opts = {}) {
  const radius = opts.radius ?? 4;
  const alpha = opts.alpha ?? 1.0;
  const fullDuration = opts.duration ?? 260;

  const hit = scene.findFirstWallHit(caster.x, caster.y, target.x, target.y);
  const blocked = hit && hit.t !== null && hit.t < 1;
  const t = blocked ? hit.t : 1;
  const tx = caster.x + (target.x - caster.x) * t;
  const ty = caster.y + (target.y - caster.y) * t;
  const duration = Math.max(40, Math.round(fullDuration * t));

  const proj = scene.add.circle(caster.x, caster.y, radius, skill.color, alpha)
    .setDepth(DEPTH.fx);
  scene.tweens.add({
    targets: proj, x: tx, y: ty, duration,
    onComplete: () => {
      proj.destroy();
      if (blocked) {
        // Scatter on the wall so the player can see why no damage
        // landed — chunky enough to read clearly.
        const puff = scene.add.circle(tx, ty, radius * 1.0, skill.color, 0.85)
          .setDepth(DEPTH.fx);
        scene.tweens.add({
          targets: puff, scale: 1.8, alpha: 0, duration: 320,
          onComplete: () => puff.destroy(),
        });
      } else {
        if (opts.onHit) opts.onHit(scene, tx, ty, skill);
        if (!opts.skipTargetDamage) scene.applyDamage(caster, target, skill);
      }
    },
  });
}
