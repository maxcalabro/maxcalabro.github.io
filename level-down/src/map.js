// World layouts.
//
// Each map is a 40-wide × 30-tall grid. To swap worlds, change
// the `MAP` assignment at the bottom of this file — no other
// code touches the map by name.
//
// Legend:
//   .   grass             ,  grass alt
//   -   path              T  tree (wall)
//   B   bush (wall)       W  water (wall)
//   H   house wall        R  house roof
//   D   town door         d  dungeon door
//   F   dungeon floor     f  dungeon floor alt
//   #   dungeon wall      ~  dungeon wall top
//   t   torch             c  coin
//   s/g/z  enemy spawn (skeleton/goblin/zombie)
//   P   player spawn      anything else → grass
//
// Path-width rule: every walkable channel is at least 2 cells
// wide so the player can navigate it without pixel-perfect
// movement. Wall clusters are placed in 2×2+ blocks and gaps
// between them are kept ≥ 2 cells in both axes.

// ----------------------------------------------------------
// MAP_MEADOW — open outdoor area with a small bush enclosure.
// Forgiving layout for an early/tutorial zone.
// ----------------------------------------------------------
export const MAP_MEADOW = [
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "T......................................T",
  "T..,.g.,...............................T",
  "T......................................T",
  "T......................................T",
  "T...........BBBBBBBB...................T",
  "T...........B......B...............g...T",
  "T...........B..c...B...................T",
  "T...........B......B...................T",
  "T...........BBB..BBB...................T",
  "T............................z.........T",
  "T....,..................,..............T",
  "T......................................T",
  "T......................................T",
  "T................P.....................T",
  "T......................................T",
  "T......................................T",
  "T..........s...........................T",
  "T......................................T",
  "T............................z.........T",
  "T......................................T",
  "T...z.......................,..........T",
  "T......................................T",
  "T.....,................................T",
  "T.................c....................T",
  "T..............................g.......T",
  "T......................................T",
  "T......,...............................T",
  "T......................................T",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
];

// ----------------------------------------------------------
// MAP_GROVE — forest with 2×2 tree clumps and a small bush
// pen. Mid-difficulty exploration zone.
// ----------------------------------------------------------
export const MAP_GROVE = [
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
  "T......................................T",
  "T......................................T",
  "T....TT......TT......TT..........TT....T",
  "T....TT......TT......TT..........TT....T",
  "T......................................T",
  "T....,................c................T",
  "T..........z...........................T",
  "T...........TT...........TT............T",
  "T...........TT...........TT............T",
  "T......................................T",
  "T...........................,..........T",
  "T......................................T",
  "T....TT.............TT.................T",
  "T....TT.............TT.................T",
  "T...............P......................T",
  "T......................................T",
  "T......................................T",
  "T...........s..........................T",
  "T..........BB......BB..................T",
  "T..........BB......BB..................T",
  "T......................................T",
  "T......................................T",
  "T....TT.................TT.............T",
  "T....TT.................TT.............T",
  "T......................................T",
  "T...........g..............c...........T",
  "T......................................T",
  "T......................................T",
  "TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT",
];

// ----------------------------------------------------------
// MAP_DUNGEON — three stone rooms connected by 2-wide corridors.
//   Room A (NW) and Room B (NE) sit above a long Room C (S).
//   A↔B corridor: cols 14-15, rows 4-5
//   A↔C corridor: cols 5-6,   rows 10-11
//   B↔C corridor: cols 27-28, rows 10-11
// ----------------------------------------------------------
export const MAP_DUNGEON = [
  "########################################",
  "#FFFFFFFFFFFFF##FFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFF##FFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFcFFFFF##FFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFsFFFFFFFFFFFFF#",
  "#FFFFFFPFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFsFFFFFFFFF##FFFFFFFFFFFFFFcFFFFFFF#",
  "#FFFFFFFFFFFFF##FFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFF##FFFFFFFFFFFFFFFFFFFgFFF#",
  "#FFFFFFFFFFFFF##FFFFFFFFFFFFFFFFFFFFFFF#",
  "#####FF####################FF###########",
  "#####FF####################FF###########",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFcFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFzFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFsFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFcFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "#FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF#",
  "########################################",
];

// Map selection happens in the start menu (see menu.js) — there's no
// global "active" map here anymore. To change the default highlighted
// in the menu, edit the `checked` attribute on the radio inputs in
// game-starter.html.
