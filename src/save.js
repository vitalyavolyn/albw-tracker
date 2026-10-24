const SLOT_SIZE = 0x1604;
const COMMON_SIZE = 0x200;

// Each slot has three blocks, each followed by a CRC-32 of the block.
const SLOT_BLOCKS = [
  [0x0000, 0x0dfc],
  [0x0e00, 0x13fc],
  [0x1400, 0x15fc],
];

const SWORDS = { 2: 'Forgotten Sword', 3: 'Master Sword', 4: 'Master Sword Lv2', 5: 'Master Sword Lv3' };
const MAILS = { 2: 'Green Mail', 3: 'Blue Mail', 4: 'Red Mail' };

const BOTTLE_CONTENTS = [
  'Empty', 'Red Potion', 'Blue Potion', 'Purple Potion', 'Yellow Potion', 'Fairy', 'Bee', 'Golden Bee', 'Heart',
  'Apple', 'Green Apple', 'Letter in a Bottle', 'Milk', 'Premium Milk',
];

// Item levels at 0xC8+: 0 none, 1 rented, 2 owned, 3 Nice (or Super for the lamp and net).
const ITEMS = [
  [0xca, 'Bombs'], [0xcb, 'Boomerang'], [0xcc, 'Bow'], [0xce, 'Hammer'], [0xcf, 'Sand Rod'], [0xd0, 'Fire Rod'],
  [0xd1, 'Ice Rod'], [0xd2, 'Tornado Rod'], [0xd3, 'Hookshot'], [0xd4, 'Lamp'], [0xd5, 'Net'],
];

// The nine items Mother Maiamai can make Nice.
const UPGRADABLE = [0xca, 0xcb, 0xcc, 0xce, 0xcf, 0xd0, 0xd1, 0xd2, 0xd3];

// English names for the area keys at 0x0C (loc_name_* in the game's message files).
const AREAS = {
  east: 'Eastern Palace', wind: 'House of Gales', hera: 'Tower of Hera', castle: 'Hyrule Castle', dark: 'Dark Palace',
  water: 'Swamp Palace', dokuro: 'Skull Woods', hagure: "Thieves' Town", ice: 'Ice Ruins', sand: 'Desert Palace',
  kame: 'Turtle Rock', ganon: 'Lorule Castle', church: 'Sanctuary', villagelight: 'Kakariko Village', lake: 'Lake Hylia',
  linkhouse: 'Your House', MtHebura: 'Death Mountain', MagicShop: "Witch's House", TheHoleOfHyakkai: 'Treacherous Tower',
  FortuneHouseDark: 'Fortune-Teller', HakabaDark: 'Graveyard', MagicShopDark: 'Magic Shop', BlackSmithDark: 'Blacksmith',
  LinkHouseDark: 'Vacant House', milkbar: 'Milk Bar', DevilsMarsh: 'Misery Mire', ZorasVillage: "Zora's Domain",
  DeathMountain: 'Death Mountain', Boss: 'Throne Room', hsd_00: 'Dodge the Cuccos', minigame_race: 'Hyrule Hotfoot',
  minigame_baseball: 'Octoball Derby', minigame_girigiri: 'Rupee Rush', minigame_takarabako: "Fortune's Choice",
  mayoinomori: 'Lost Woods', hagure_ajito: "Thieves' Hideout", inside_castle: 'Hyrule Castle Interior',
};

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(bytes, start, end) {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readName(bytes) {
  let name = '';
  for (let i = 0xd60; i < 0xd76; i += 2) {
    const c = u16(bytes, i);
    if (!c) break;
    name += String.fromCharCode(c);
  }
  return name;
}

function readAscii(bytes, start, end) {
  let text = '';
  for (let i = start; i < end && bytes[i]; i++) {
    text += String.fromCharCode(bytes[i]);
  }
  return text;
}

export function parseSlot(name, bytes) {
  if (bytes.length !== SLOT_SIZE) {
    throw new Error(`${name} is ${bytes.length} bytes; a save slot is ${SLOT_SIZE} bytes.`);
  }
  for (const [start, end] of SLOT_BLOCKS) {
    if (crc32(bytes, start, end) !== u32(bytes, end)) {
      throw new Error(`${name} failed its checksum at 0x${end.toString(16)}.`);
    }
  }
  return {
    slot: Number(/Save_(\d)/i.exec(name)[1]) + 1,
    player: readName(bytes),
    heroMode: bytes[0xd76] !== 0,
    bytes,
  };
}

export function parseCommon(name, bytes) {
  if (bytes.length !== COMMON_SIZE || crc32(bytes, 0, 0x1fc) !== u32(bytes, 0x1fc)) {
    throw new Error(`${name} is not a valid SaveCommon.bin.`);
  }
  return { clearedMask: bytes[0x08] };
}

export function isCleared(slot, common) {
  if (!common) return null;
  return ((common.clearedMask >> (slot.slot - 1)) & 1) === 1;
}

// Event flags are at 0x40. Area ("course") flags are at 0x560 + course * 0x40.
function hasFlag(bytes, course, n) {
  const base = course < 0 ? 0x40 : 0x560 + course * 0x40;
  return ((bytes[base + (n >> 3)] >> (n & 7)) & 1) === 1;
}

// Rules:
//   ['f', course, flag]   flag is set (course -1 means an event flag)
//   ['v', offset, min]    byte at offset is at least min
//   ['m', offset, mask]   byte at offset has any of the mask bits
//   ['clr']               the slot has beaten the game
//   ['or', ...rules]
export function detect(slot, rule, common = null) {
  if (!rule) return false;
  const bytes = slot.bytes;
  switch (rule[0]) {
    case 'f': {
      const [, course, n] = rule;
      if (hasFlag(bytes, course, n)) return true;
      // Overworld flags from 0x100 up are shared with the indoor and cave areas of the same world.
      if (course === 0 && n >= 0x100) return hasFlag(bytes, 2, n) || hasFlag(bytes, 4, n);
      if (course === 1 && n >= 0x100) return hasFlag(bytes, 3, n) || hasFlag(bytes, 5, n);
      return false;
    }
    case 'v':
      return bytes[rule[1]] >= rule[2];
    case 'm':
      return (bytes[rule[1]] & rule[2]) !== 0;
    case 'clr':
      return isCleared(slot, common) === true;
    case 'or':
      return rule.slice(1).some((r) => detect(slot, r, common));
    default:
      throw new Error(`Unknown rule ${rule[0]}`);
  }
}

function worldOf(course) {
  if (course > 5) return 'Dungeon';
  return course % 2 ? 'Lorule' : 'Hyrule';
}

// Finding a Maiamai adds 1 to both 0x190 and 0x191. Handing them to Mother Maiamai only lowers 0x191.
// She gives one Nice item per 10.
function maiamai(bytes) {
  const found = bytes[0x190];
  const onHand = bytes[0x191];
  const upgrades = UPGRADABLE.filter((offset) => bytes[offset] >= 3).length;
  return {
    found,
    onHand,
    handedIn: found - onHand,
    upgrades,
    waiting: Math.max(0, Math.floor(found / 10) - upgrades),
  };
}

export function summarize(slot) {
  const bytes = slot.bytes;
  const areaKey = readAscii(bytes, 0x0c, 0x40).split('/').pop().replace(/^loc_name_/, '');
  const hotfootFrames = u32(bytes, 0xd90);

  const bottles = [];
  for (let i = 0; i < 5; i++) {
    if (!bytes[0xda + i]) continue;
    const contents = bytes[0xc3 + i];
    bottles.push(BOTTLE_CONTENTS[contents] ?? `Unknown (${contents})`);
  }

  return {
    area: AREAS[areaKey] ?? areaKey,
    world: worldOf(bytes[0x00]),
    hearts: bytes[0xc1] / 4,
    heartPieces: bytes[0xc2],
    rupees: u16(bytes, 0x18e),
    sword: SWORDS[bytes[0xc8]] ?? 'None',
    mail: MAILS[bytes[0xe7]] ?? 'Green Mail',
    items: ITEMS.map(([offset, name]) => ({ name, level: bytes[offset] })),
    bottles,
    monsterParts: { tails: bytes[0x18b], guts: bytes[0x18c], horns: bytes[0x18d] },
    maiamai: maiamai(bytes),
    // The two counters on the game's Play Record screen.
    timesDefeated: u32(bytes, 0x194),
    totalRupees: u32(bytes, 0x198),
    hotfootBest: hotfootFrames ? hotfootFrames / 60 : null,
  };
}
