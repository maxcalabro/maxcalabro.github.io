// Player-tunable behavior knobs.
//
// Each character has its own personality object — call makePersonality()
// to mint a fresh one. The character-sheet UI wires sliders/dropdowns to
// a specific character's knobs; the scene reads them per character when
// computing movement and selecting targets.
//
// Knobs:
//   - preferredDistance: try to stay this far from the chosen target.
//     Below this distance, the character pushes away (fades to zero at
//     the boundary). The character's "comfort zone" radius.
//   - targetMode: which enemy to focus on when more than one is in range.
//     One of:
//       'closest'    — nearest enemy (the legacy default)
//       'lowest_hp'  — enemy with the least HP remaining (finish them)
//       'ranged'     — enemies whose attack skill is tagged RANGED
//       'melee'      — enemies whose attack skill is tagged MELEE
//     Filtered modes fall back to "closest" if no enemy matches.
//   - independence: leash radius (px) measured from the group centre
//     (the average position of all living party members). Inside the
//     leash the character roams / wanders freely; once they stray past
//     it, returning to the group becomes their goal. Higher = longer
//     leash = more willing to wander off alone. The scene clamps this
//     to INDEPENDENCE_MIN so the leash always sits clear of the buddy
//     push range (otherwise cohesion and separation fight and the
//     party jitters / drifts).
//   - greed: loot-detour radius (px). A chest inside this radius becomes
//     a movement goal that sits ABOVE combat in the priority order, so
//     a greedy character will break off mid-fight to grab distant loot
//     while a frugal one only veers for chests they're nearly on top
//     of. Greed 0 = never detour (they still pick up chests they walk
//     over via the collision handler).
//
// Earlier knobs (aggressiveness, skillPriority, fleeAtHpFraction) were
// removed — the first two overlapped too much with preferredDistance and
// the auto-skill system; the panic-flee behavior produced odd movement
// when characters got low and didn't feel impactful to tune.

export const TARGET_MODES = ['closest', 'lowest_hp', 'ranged', 'melee'];

export function makePersonality(overrides = {}) {
  return {
    preferredDistance: 64,
    targetMode: 'closest',
    independence: 128,
    greed: 96,
    ...overrides,
  };
}
