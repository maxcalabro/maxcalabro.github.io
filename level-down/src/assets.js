// Named tiles used by gameplay, plus the pack each lives in.
//
// To find the right number for a tile: press B in-game to open
// the tile browser, hover any tile to see its number.

export const TILES = {
  // Tiny Town (outdoor)
  town_grass:      0,
  town_grass_alt:  1,
  town_flowers:    2,
  town_yellow_tree:       3,
  town_green_tree:       4,
  town_bush:       5,
  town_dirt_in_southeast: 12,
  town_dirt_in_south: 13,
  town_dirt_in_southwest: 14,
  town_dirt_in_east: 24,
  town_dirt_full: 25,
  town_dirt_in_west: 26,
  town_yellow_tree_2: 27,
  town_green_tree_2: 28,
  town_dirt_in_northeast: 36,
  town_dirt_in_north: 37,
  town_dirt_in_northwest: 38,
  town_grass_in_northwest: 39,
  town_grass_in_northeast: 40,
  town_grass_in_southeast: 41,
  town_grass_in_southwest: 42,
  town_rock_patch: 43,
  town_water:      108,
  town_house_wall: 45,
  town_house_roof: 12,
  town_door:       59,

  // Tiny Dungeon (indoor)
  dun_floor:       48,
  dun_floor_alt:   49,
  dun_wall:        40,
  dun_wall_top:    24,
  dun_door:        59,
  dun_torch:       107,

  // Characters. `player` is the Knight (A), `player_b` the Mage (B),
  // `player_c` the Cleric (C). Enemy sprites live alongside.
  player:          97,
  player_b:        84,
  player_c:        100,

  // Enemies
  enemy_skeleton:  121,
  enemy_goblin:    108,
  enemy_zombie:    109,
  enemy_rat:       124,

  // Items. `chest` is currently a coin-style sprite (tile 89). To
  // swap in a more chest-looking tile, press B in-game to open the
  // tile browser, pick a number, and update this entry.
  chest:           89,

  // Inventory item icons. Each ITEMS entry in items.js references one
  // of these by key. Multiple items can share an icon for now —
  // when per-item art arrives, each item becomes a unique key here.
  item_weapon:     103,
  item_armor:      102,
  item_helmet:     101,
  item_accessory:  113,
};

// Every TILES key needs a corresponding PACK entry so assetPath knows
// which folder (`kenney_tiny-town` vs `kenney_tiny-dungeon`) the asset
// lives in. Adding a new tile? Append it here AND to TILES above —
// preload() iterates TILES and feeds (tile, PACK[tile]) into assetPath.
export const PACK = {
  // Tiny Town (outdoor)
  town_grass:              'town',
  town_grass_alt:          'town',
  town_flowers:            'town',
  town_yellow_tree:        'town',
  town_green_tree:         'town',
  town_bush:               'town',
  town_dirt_in_southeast:  'town',
  town_dirt_in_south:      'town',
  town_dirt_in_southwest:  'town',
  town_dirt_in_east:       'town',
  town_dirt_full:          'town',
  town_dirt_in_west:       'town',
  town_yellow_tree_2:      'town',
  town_green_tree_2:       'town',
  town_dirt_in_northeast:  'town',
  town_dirt_in_north:      'town',
  town_dirt_in_northwest:  'town',
  town_grass_in_northwest: 'town',
  town_grass_in_northeast: 'town',
  town_grass_in_southeast: 'town',
  town_grass_in_southwest: 'town',
  town_rock_patch:         'town',
  town_water:              'town',
  town_house_wall:         'town',
  town_house_roof:         'town',
  town_door:               'town',

  // Tiny Dungeon (indoor)
  dun_floor:        'dungeon',
  dun_floor_alt:    'dungeon',
  dun_wall:         'dungeon',
  dun_wall_top:     'dungeon',
  dun_door:         'dungeon',
  dun_torch:        'dungeon',

  // Characters + enemies (all from the dungeon sheet for now)
  player:           'dungeon',
  player_b:         'dungeon',
  player_c:         'dungeon',
  enemy_skeleton:   'dungeon',
  enemy_goblin:     'dungeon',
  enemy_zombie:     'dungeon',
  enemy_rat:        'dungeon',
  chest:            'dungeon',

  // Inventory icons (dungeon sheet)
  item_weapon:      'dungeon',
  item_armor:       'dungeon',
  item_helmet:      'dungeon',
  item_accessory:   'dungeon',
};

export function assetPath(pack, tileNum) {
  const folder = pack === 'town' ? 'kenney_tiny-town' : 'kenney_tiny-dungeon';
  return 'assets/' + folder + '/Tiles/tile_' + String(tileNum).padStart(4, '0') + '.png';
}
