// World layouts and pre-made template snippets.
//
// Adventure runs use procgen maps from map-generator.js; the named
// exports below remain as hand-authored snapshots that could be
// dropped in as templates or pasted into the generator for future
// "structured rooms" features.
//
// Legend:
//   .  grass              ,  grass alt
//   *  flowers            m  mushrooms           o  rock patch
//
//   Dirt path tiles (all walkable). Each char is picked by the map
//   generator from the diagonal-quadrant rule so the dirt visual
//   stays contiguous and the path has clean grass borders:
//     -  full dirt
//     ^  N-half dirt     v  S-half dirt
//     <  W-half dirt     >  E-half dirt
//     [  NW corner       ]  SE corner
//     (  NE corner       )  SW corner
//     1  inner corner — NW grass (rest dirt)
//     2  inner corner — NE grass
//     3  inner corner — SE grass
//     4  inner corner — SW grass
//
//   Walls:
//     T  tree             B  bush               W  water
//     H  house wall       R  house roof         #  dungeon wall
//     ~  dungeon wall top
//   Doors / floors / decor:
//     D  town door        d  dungeon door
//     F  dungeon floor    f  dungeon floor alt
//     t  torch
//   Entities:
//     c  chest            P  player spawn
//     s / g / z / r  enemy spawn (skeleton / goblin / zombie / rat)
//   anything else  → grass
//
// Walkability: the ONLY wall chars are `TBWHR#~`. Every other char
// is passable, including all dirt / decoration / floor tiles.
// Single-tile passages are fine — the A* pathfinder handles them.

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
