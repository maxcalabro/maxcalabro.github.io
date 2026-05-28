// Shared class registry — the single source of truth for which
// classes exist, their player-facing blurbs, and their default
// personality knobs.
//
// Split out of scene.js so the menu (single-hero creation) and the
// in-game recruit modal can present the same class list without
// importing the heavy scene module. The scene's CLASS_TEMPLATES owns
// the *gameplay* numbers (sprite, per-level stats, resistances,
// starting weapon) and pulls its personality defaults from here so
// there's exactly one place to tune a class's behaviour.

// Display + selection order. The party can hold at most 3 of these 4.
export const CLASS_ORDER = ['Knight', 'Mage', 'Cleric', 'Archer'];

// Per-class default personality. Used to seed the menu sliders when a
// class is picked, and imported by scene.js as each template's
// personalityOverrides — so editing a class's feel is a one-line
// change here.
export const CLASS_PERSONALITY = {
  // Front-liner — hugs enemies, roams ahead, grabs loot on the way.
  Knight: { preferredDistance: 8,   targetMode: 'closest', independence: 160, greed: 112 },
  // Glass-cannon caster — keeps its distance and stays near the group.
  Mage:   { preferredDistance: 120, targetMode: 'closest', independence: 112, greed: 96  },
  // Support — mid distance to reach allies, short leash, low greed.
  Cleric: { preferredDistance: 60,  targetMode: 'closest', independence: 96,  greed: 80  },
  // Kiter — the farthest standoff of the party, happy to range around.
  Archer: { preferredDistance: 140, targetMode: 'closest', independence: 128, greed: 104 },
};

// Player-facing copy for the class picker (menu) and recruit modal.
// `statsLine` mirrors the per-level stat block in scene.CLASS_TEMPLATES
// — keep the two in sync when rebalancing a class.
export const CLASS_INFO = {
  Knight: {
    role: 'Knight',
    blurb: 'Sturdy melee bruiser — wades in with a sword and soaks hits.',
    statsLine: 'STR 3 · AGI 1 · INT 1 · RES 3',
  },
  Mage: {
    role: 'Mage',
    blurb: 'Ranged elementalist — fragile, but devastating from afar.',
    statsLine: 'STR 1 · AGI 2 · INT 3 · RES 2',
  },
  Cleric: {
    role: 'Cleric',
    blurb: 'Support healer — keeps the party standing through long fights.',
    statsLine: 'STR 1 · AGI 2 · INT 3 · RES 2',
  },
  Archer: {
    role: 'Archer',
    blurb: 'Agile bowman — fast and mobile, peppers foes while kiting.',
    statsLine: 'STR 2 · AGI 3 · INT 1 · RES 2',
  },
};
