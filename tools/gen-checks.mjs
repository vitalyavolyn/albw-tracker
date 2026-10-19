import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'tools', '.cache');

const UPSTREAM = {
  ap: { url: 'https://github.com/randomsalience/albw-archipelago', commit: 'e226d68f92d38a53c9ad73e3e81063ba30802209' },
  z17: { url: 'https://github.com/rickfay/z17-randomizer', commit: 'dc1a9c945bed9da96a14e7e40c7eaf7e0636eaf2' },
};

const ITEM_NAMES = {
  HeartPiece: 'Piece of Heart', HeartContainer: 'Heart Container', RupeeG: 'Green Rupee', RupeeB: 'Blue Rupee',
  RupeeR: 'Red Rupee', RupeePurple: 'Purple Rupee', RupeeSilver: 'Silver Rupee', RupeeGold: 'Gold Rupee',
  KeySmall: 'Small Key', KeyBoss: 'Big Key', Compass: 'Compass', LiverPurple: 'Monster Tail',
  LiverYellow: 'Monster Guts', LiverBlue: 'Monster Horn', OreRed: 'Master Ore', OreYellow: 'Master Ore',
  OreGreen: 'Master Ore', OreBlue: 'Master Ore', ItemKandelaar: 'Lamp', ItemSwordLv1: 'Forgotten Sword',
  ItemSwordLv2: 'Master Sword', ItemSwordLv3: 'Master Sword Lv2', ItemSwordLv4: 'Master Sword Lv3',
  ItemBell: "Irene's Bell", Pouch: 'Pouch', MessageBottle: 'Message in a Bottle', ItemBottle: 'Bottle',
  ItemStoneBeauty: 'Smooth Gem', ItemRentalHookShot: 'Hookshot (rental)', ItemMizukaki: "Zora's Flippers",
  PowerGlove: 'Power Glove', PowerfulGlove: "Titan's Mitt", PackageSword: "Captain's Sword", ZeldaAmulet: 'Charm',
  HintGlasses: 'Hint Glasses', ItemInsectNet: 'Bug Net', BadgeBee: 'Bee Badge', ClothesBlue: 'Blue Mail',
  ClothesRed: 'Red Mail', GanbariPowerUp: 'Stamina Scroll', HyruleShield: 'Hylian Shield', ItemBowLight: 'Bow of Light',
  ItemRentalBow: 'Bow (rental)', RingHekiga: "Ravio's Bracelet", ItemKandelaarLv2: 'Super Lamp',
  PegasusBoots: 'Pegasus Boots',
};

const DUNGEONS = {
  hyrule_sanctuary: 'Sanctuary', lorule_sanctuary: "Philosopher's Cave", eastern: 'Eastern Palace',
  gales: 'House of Gales', hera: 'Tower of Hera', dark: 'Dark Palace', swamp: 'Swamp Palace', skull: 'Skull Woods',
  thieves: "Thieves' Hideout", ice: 'Ice Ruins', desert: 'Desert Palace', turtle: 'Turtle Rock',
  lorule_castle: 'Lorule Castle',
};

// Irene had just 1 check
const REGION_RENAME = { 'Lorule Castle Area': 'Central Lorule', 'Irene the Witch': 'Hyrule Castle Area' };

// The 28 vanilla heart piece flags are the event block 968..995. AP uses randomizer-only flags for these two
// minigames. 991 is set by FieldDark_2A_GameMaster (Octoball Derby); 993 is the one left over and matches real saves.
const HEART_PIECE_FLAGS = { 'Octoball Derby': 991, "Fortune's Choice": 993 };

// Inventory level bytes, in order from 0xC8: sword, shield, bombs, boomerang, bow, bow of light, hammer,
// sand rod, fire rod, ice rod, tornado rod, hookshot, lamp, net, ...
const INV = 0xc8;

const RAVIO_ITEMS = [
  [2, 'Bombs'], [3, 'Boomerang'], [4, 'Bow'], [6, 'Hammer'], [7, 'Sand Rod'],
  [8, 'Fire Rod'], [9, 'Ice Rod'], [10, 'Tornado Rod'], [11, 'Hookshot'],
];

const SAGES = [[437, 'Gulley'], [473, 'Oren'], [505, 'Seres'], [529, 'Osfala'], [557, 'Rosso'], [581, 'Irene'], [617, 'Impa']];

const eventFlag = (n) => ['f', -1, n];
const areaFlag = (course, n) => ['f', course, n];
const level = (offset, min) => ['v', offset, min];

// Rewards that are real items get one row each in the Equipment section, named after the item. Where the
// inventory byte is known the row reads it directly; otherwise it keeps the check's flag. Within a kind,
// rows keep this table's order (Forgotten, Master, ores, Lv2, Lv3).
const EQUIPMENT = {
  ItemSwordLv1: { kind: 'Sword', rule: level(INV, 2) },
  ItemSwordLv2: { kind: 'Sword', rule: level(INV, 3) },
  OreRed: { kind: 'Sword' },
  OreYellow: { kind: 'Sword' },
  OreGreen: { kind: 'Sword' },
  OreBlue: { kind: 'Sword' },
  ItemSwordLv3: { kind: 'Sword', rule: level(INV, 4) },
  ItemSwordLv4: { kind: 'Sword', rule: level(INV, 5) },
  RingHekiga: { kind: 'Armor & gear', rule: level(0xdf, 1) },
  PowerGlove: { kind: 'Armor & gear', rule: level(0xe6, 2) },
  PowerfulGlove: { kind: 'Armor & gear', rule: level(0xe6, 3) },
  ItemMizukaki: { kind: 'Armor & gear', rule: level(0xe4, 1) },
  PegasusBoots: { kind: 'Armor & gear', rule: level(0xe8, 1) },
  ClothesBlue: { kind: 'Armor & gear', rule: level(0xe7, 3) },
  ClothesRed: { kind: 'Armor & gear', rule: level(0xe7, 4) },
  HyruleShield: { kind: 'Armor & gear' },
  GanbariPowerUp: { kind: 'Armor & gear', rule: level(0xee, 1) },
  ItemKandelaar: { kind: 'Tool', rule: level(INV + 12, 1) },
  ItemInsectNet: { kind: 'Tool', rule: level(INV + 13, 1) },
  ItemBell: { kind: 'Tool', rule: level(0xd7, 1) },
  HintGlasses: { kind: 'Tool', rule: level(0xd6, 1) },
  BadgeBee: { kind: 'Tool', rule: level(0xe9, 1) },
  Pouch: { kind: 'Tool', rule: level(0xef, 1) },
  ItemBottle: { kind: 'Bottle' },
  PackageSword: { kind: 'Quest item' },
  ZeldaAmulet: { kind: 'Quest item' },
  ItemStoneBeauty: { kind: 'Quest item' },
  MessageBottle: { kind: 'Quest item' },
};
const EQUIPMENT_IDS = Object.keys(EQUIPMENT);
const KIND_ORDER = ['Sword', 'Armor & gear', 'Tool', 'Super upgrade', "Ravio's item", 'Nice item', 'Bottle', 'Quest item'];

// Names from the AP world's vane_* and crack_* keys that need fixing up for display.
const NAME_FIXES = [
  [/\bDm\b/g, 'Death Mountain'],
  [/\bDeath Mtn\b/g, 'Death Mountain'],
  [/\bKus\b/g, "Ku's"],
  [/\bRossos\b/g, "Rosso's"],
  [/\bSahasrahlas\b/g, "Sahasrahla's"],
  [/\bWitchs\b/g, "Witch's"],
  [/\bZoras\b/g, "Zora's"],
  [/\bPhilosophers\b/g, "Philosopher's"],
  [/\bThieves Town\b/g, "Thieves' Town"],
  [/\bSe\b/g, 'SE'],
  [/\bSw\b/g, 'SW'],
  [/\bN Shaped\b/g, 'n-Shaped'],
  [/ Of /g, ' of '],
];

function checkout(name) {
  const { url, commit } = UPSTREAM[name];
  const dir = join(CACHE, name);
  if (!existsSync(dir)) {
    mkdirSync(CACHE, { recursive: true });
    execFileSync('git', ['clone', '--quiet', url, dir], { stdio: 'inherit' });
  }
  execFileSync('git', ['-C', dir, 'checkout', '--quiet', commit], { stdio: 'inherit' });
  return dir;
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function readVanilla(z17Dir) {
  const vanilla = new Map();
  for (const file of walk(join(z17Dir, 'randomizer/src/regions')).filter((f) => f.endsWith('.rs'))) {
    const text = readFileSync(file, 'utf8');
    const world = file.includes('/hyrule/') ? 'Hyrule' : file.includes('/lorule/') ? 'Lorule' : 'Dungeon';
    for (const match of text.matchAll(/"([^"]+)": (\w+) @/g)) {
      const regionNames = [...text.slice(0, match.index).matchAll(/name: "([^"]+)"/g)];
      vanilla.set(match[1], { item: match[2], region: regionNames.at(-1)[1], world });
    }
  }
  return vanilla;
}

function readApLocations(apDir) {
  const source = readFileSync(join(apDir, 'Locations.py'), 'utf8');
  const entry = /LocationData\((None|\d+), (None|\d+), (None|\d+), "([^"]+)"(?:, (\w+))?(?:, Items\.(\w+))?\)/g;
  const locations = [];
  for (const block of source.matchAll(/^(\w+)_locations: List\[LocationData\] = \[([\s\S]*?)^\]/gm)) {
    for (const [, , course, flag, name, type] of block[2].matchAll(entry)) {
      locations.push({
        group: block[1],
        name,
        type: type ?? 'Normal',
        course: course === 'None' ? null : Number(course),
        flag: flag === 'None' ? null : Number(flag),
      });
    }
  }
  return locations;
}

const apDir = checkout('ap');
const z17Dir = checkout('z17');
const vanilla = readVanilla(z17Dir);
const hints = JSON.parse(readFileSync(join(ROOT, 'data/hints.json'), 'utf8')).hints;

const checks = [];
const equipment = [];

function add(cat, name, region, world, item, rule, note = hints[name]) {
  const check = { id: `${cat}:${name}`, cat, name, region, world, item, rule };
  if (note) check.note = note;
  checks.push(check);
}

// `from` is either a location ("Dampe, River Area") or a full sentence, which is shown as it is.
function addEquipment(kind, name, region, world, rule, from, itemId = null) {
  const order = itemId ? EQUIPMENT_IDS.indexOf(itemId) : EQUIPMENT_IDS.length;
  const note = from && (from.endsWith('.') ? from : `From: ${from}`);
  equipment.push({ kind, name, region, world, rule, order, note });
}

function placeOf(location) {
  if (DUNGEONS[location.group]) return [DUNGEONS[location.group], 'Dungeon'];
  const { region, world } = vanilla.get(location.name);
  return [REGION_RENAME[region] ?? region, world];
}

const SKIPPED_TYPES = new Set(['Vane', 'Event', 'Prize', 'Shop', 'Ravio']);

for (const location of readApLocations(apDir)) {
  const { name, type } = location;
  if (SKIPPED_TYPES.has(type) && name !== "Fortune's Choice") continue;
  // Mother Maiamai's upgrades and the Treacherous Tower are added below with their vanilla rewards.
  if (type === 'Upgrade' || name === 'Treacherous Tower') continue;

  // In the normal game the Shady Guy gives the Pegasus Boots; z17 lists a rental Hookshot there.
  const itemId = name === 'Shady Guy' ? 'PegasusBoots' : vanilla.get(name).item;
  const item = ITEM_NAMES[itemId] ?? itemId;
  const [region, world] = placeOf(location);
  let rule = location.flag == null ? null : areaFlag(location.course ?? -1, location.flag);
  if (HEART_PIECE_FLAGS[name]) rule = eventFlag(HEART_PIECE_FLAGS[name]);

  const equipmentInfo = EQUIPMENT[itemId];
  if (equipmentInfo) {
    let shown = item;
    let from = `${name}, ${region}`;
    if (itemId.startsWith('Ore')) shown = `Master Ore (${region})`;
    if (itemId === 'ItemBottle') {
      shown = `Bottle (${name.replace(/ \(Left\)$/, '')})`;
      from = null;
    }
    addEquipment(equipmentInfo.kind, shown, region, world, equipmentInfo.rule ?? rule, hints[name] ?? from, itemId);
  } else if (type === 'Maiamai') {
    add('maiamai', name.replace('[Mai] ', ''), region, world, 'Lost Maiamai', rule);
  } else if (itemId === 'HeartPiece') {
    add('heartPiece', name, region, world, item, rule);
  } else if (itemId === 'HeartContainer') {
    add('heartContainer', name.split('] ').at(-1), region, world, item, rule);
  } else if (name === 'Hyrule Hotfoot 75s') {
    add('minigame', 'Hyrule Hotfoot (75 s)', region, world, item, ['m', 0xda5, 1]);
  } else if (name === 'Hinox (1)') {
    add('minigame', 'Hinox bomb game (all 6 prizes)', region, world, 'Rupees', rule);
  } else if (name.startsWith('Hinox (')) {
    // Hinox (2) to (6) share the same flag as Hinox (1).
  } else if (name === '[LC] Zelda') {
    // The Bow of Light is taken away after the credits, so a beaten game also counts.
    add('story', 'Zelda gives the Bow of Light', 'Lorule Castle', 'Dungeon', 'Bow of Light', ['or', rule, ['clr']]);
  } else if (type === 'Minigame') {
    add('minigame', name, region, world, item, rule);
  } else {
    add(world === 'Dungeon' ? 'dungeon' : 'overworld', name, region, world, item, rule);
  }
}

const tower = ['Lorule Death Mountain', 'Lorule'];
add('minigame', 'Treacherous Tower: Beginner', ...tower, 'Rupees', eventFlag(956));
add('heartPiece', 'Treacherous Tower: Intermediate', ...tower, 'Piece of Heart', eventFlag(994),
  'Lorule Death Mountain: clear the Intermediate course (200 rupees, 15 floors).');
addEquipment('Super upgrade', 'Super Lamp', ...tower, level(INV + 12, 3), 'Treacherous Tower: clear the Advanced course.');
addEquipment('Super upgrade', 'Super Net', ...tower, level(INV + 13, 3),
  'Treacherous Tower: clear the Advanced course a second time.');

for (const [slot, name] of RAVIO_ITEMS) {
  addEquipment("Ravio's item", name, "Ravio's Shop", 'Hyrule', level(INV + slot, 2), 'Buy it from Ravio.');
}
for (const [slot, name] of RAVIO_ITEMS) {
  addEquipment('Nice item', `Nice ${name}`, 'Lake Hylia', 'Hyrule', level(INV + slot, 3),
    'Mother Maiamai, for every 10 Maiamai you bring her.');
}
addEquipment('Nice item', 'Great Spin', 'Lake Hylia', 'Hyrule', eventFlag(866), 'Mother Maiamai, after all 100 Maiamai.');

for (const [offset, name] of [[0xe2, 'Pendant of Courage'], [0xe0, 'Pendant of Wisdom'], [0xe1, 'Pendant of Power']]) {
  add('story', name, 'Hyrule', 'Hyrule', name, level(offset, 1));
}
for (const [flag, name] of SAGES) {
  add('story', `Rescue ${name}`, 'Lorule', 'Lorule', 'Sage', eventFlag(flag));
}
add('story', 'Beat the game', 'Lorule Castle', 'Dungeon', 'Credits', ['or', ['clr'], eventFlag(727)],
  'Read from SaveCommon.bin. The game reloads the save from before the final battle, so the slot itself never records the win.');

equipment.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.order - b.order);
for (const e of equipment) add('equipment', e.name, e.region, e.world, e.kind, e.rule, e.note);

const dataSource = readFileSync(join(apDir, 'Data.py'), 'utf8');
for (const [, flagText, kind, key] of dataSource.matchAll(/\((\d+), "(vane|crack)_(\w+)"\)/g)) {
  const flag = Number(flagText);
  let name = key.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  for (const [pattern, replacement] of NAME_FIXES) name = name.replace(pattern, replacement);
  if (kind === 'vane') {
    const world = flag >= 932 ? 'Lorule' : 'Hyrule';
    add('weatherVane', name, world, world, 'Weather Vane', eventFlag(flag));
  } else {
    const world = flag >= 831 ? 'Lorule' : 'Hyrule';
    add('fissure', name, world, world, 'Fissure', eventFlag(flag));
  }
}

const ids = new Set();
for (const check of checks) {
  if (ids.has(check.id)) throw new Error(`Duplicate check id ${check.id}`);
  ids.add(check.id);
}

const header = `// Generated by tools/gen-checks.mjs. Do not edit by hand.
// Derived from randomsalience/albw-archipelago@${UPSTREAM.ap.commit.slice(0, 7)} and rickfay/z17-randomizer@${UPSTREAM.z17.commit.slice(0, 7)} (GPL-2.0).
`;
const body = checks.map((check) => '  ' + JSON.stringify(check)).join(',\n');
writeFileSync(join(ROOT, 'src/checks.js'), `${header}export default [\n${body},\n];\n`);

const counts = {};
for (const check of checks) counts[check.cat] = (counts[check.cat] ?? 0) + 1;
console.log(`Wrote ${checks.length} checks`, counts);
