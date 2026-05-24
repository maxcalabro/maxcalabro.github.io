// Player-tunable behavior knobs.
//
// Each character has its own personality object — call makePersonality()
// to mint a fresh one. The character-sheet UI wires sliders to a
// specific character's knobs; the scene reads them per character when
// computing movement.
//
// Knobs:
//   - preferredDistance: try to stay this far from the nearest visible
//     enemy. Below this distance, the character pushes away (fades to
//     zero at the boundary). The character's "comfort zone" radius.
//   - fleeAtHpFraction: 0 to 1. When hp/maxHp drops at or below this,
//     the character enters panic mode: a strong retreat force replaces
//     normal personality movement and the click-to-move target is
//     cancelled.
//
// Two earlier knobs (aggressiveness, skillPriority) were removed —
// they overlapped too much with preferredDistance and the natural
// behavior of the auto-skill system, respectively.

export function makePersonality(overrides = {}) {
  return {
    preferredDistance: 64,
    fleeAtHpFraction: 0.2,
    ...overrides,
  };
}
