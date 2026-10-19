# Save format

Notes on the parts of the *A Link Between Worlds* save that this tracker reads. Offsets are the same for
the USA and EUR releases (checked against EUR saves exported with Checkpoint). Multi-byte values are little-endian.

## Sources

- Block layout and checksums: [7akeem0/albw-decomp-ai](https://github.com/7akeem0/albw-decomp-ai)
- Item and stat offsets: [Brionjv/TLOZ-A-Link-Between-Worlds-Save-Editor](https://github.com/Brionjv/TLOZ-A-Link-Between-Worlds-Save-Editor)
- Per-location flags: [randomsalience/albw-archipelago](https://github.com/randomsalience/albw-archipelago)
- Flag lookup table and the flag map from the ROM: [rickfay/z17-randomizer](https://github.com/rickfay/z17-randomizer)
- Hero Mode byte and Play Record fields: disassembly of the USA code binary and the game's message files (from a decrypted
  dump of your own copy; neither is in this repo).
- `SaveCommon.bin` fields, the minigame heart piece flags and the item-level meanings were worked out by comparing
  real saves at different points in a playthrough.

## Files

Checkpoint exports one folder per backup:

| File | Size | Contents |
|---|---|---|
| `Save_0.bin`, `Save_1.bin`, `Save_2.bin` | 0x1604 | One per file slot on the title screen |
| `SaveCommon.bin` | 0x200 | Shared data, including which slots have beaten the game |

## Save_N.bin

Most of the player block (`0xC3`–`0x19B`) is written by one function, `0x25538C` in the USA code, which copies the
inventory object into the save: 45 item levels as bytes from `0xC8`, bottle contents, rupees, monster parts, the Maiamai
counters and the two Play Record counters.

Three blocks, each followed by a CRC-32 (standard zlib polynomial) of the block:

| Block | CRC at |
|---|---|
| `0x0000`–`0x0DFB` | `0x0DFC` |
| `0x0E00`–`0x13FB` | `0x13FC` |
| `0x1400`–`0x15FB` | `0x15FC` |

The first block is the game state (`SaveData::init` in the decomp clears it as 0xE00 bytes with the CRC at 0xDFC).

| Offset | Size | Meaning |
|---|---|---|
| `0x00` | 4 | Area (course) the game was saved in; 0 Hyrule, 1 Lorule. `SaveData::init` sets 8 (Demo) for a new file |
| `0x04` | 4 | Scene within that area |
| `0x08` | 4 | Entrance |
| `0x0C` | string | Area name key, e.g. `LocationNameUpper/loc_name_linkhouse`. The English names are `loc_name_*` in `LanguageBoot.szs` |
| `0x40` | 0x80 | Event flags, 1024 bits |
| `0xC0` | 1 | Current health in quarter hearts |
| `0xC1` | 1 | Max health in quarter hearts (12 = 3 hearts, 80 = 20) |
| `0xC2` | 1 | Pieces of Heart held toward the next heart (0–3) |
| `0xC3`–`0xC7` | 5 | Bottle contents: 0 Empty, 1 Red Potion, 2 Blue Potion, 3 Purple Potion, 4 Yellow Potion, 5 Fairy, 6 Bee, 7 Golden Bee, 8 Heart, 9 Apple, 10 Green Apple, 11 Letter in a Bottle, 12 Milk, 13 Premium Milk |
| `0xC8` | 1 | Sword: 2 Forgotten, 3 Master, 4 Master Lv2, 5 Master Lv3 |
| `0xC9`… | 1 each | Item levels, see below |
| `0x18B` | 1 | Monster Tails |
| `0x18C` | 1 | Monster Guts |
| `0x18D` | 1 | Monster Horns |
| `0x188`–`0x18A` | 3 | Equipped item slots, -1 when empty (`Cls::save` at 0x1DB87C in the decomp) |
| `0x18E` | 2 | Rupees |
| `0x148`–`0x187` | 2 × 0x20 | Two 32-byte arrays copied from the inventory object (unknown) |
| `0x190` | 1 | Lost Maiamai found |
| `0x191` | 1 | Maiamais on hand: found but not yet returned to Mother Maiamai (the Gear screen's "Maiamais on hand"). Finding one adds 1 to both `0x190` and `0x191` (`0x2559B4`) |
| `0x192` | 2 | Unknown. 50 on a finished file, 0 on the others |
| `0x194` | 4 | Times defeated, shown on the Play Record screen after the credits |
| `0x198` | 4 | Total Rupees found, also on the Play Record screen. Rises by exactly what the wallet gains |
| `0x260` | 2 | Random file ID, picked when the file is created (`SaveData::init` with id 0xdead). Tells a recreated file apart from an old one with the same name |
| `0x360` | 2 × 20 × 6 | Two tables of 20 six-byte records (defaults 0x50 and 0x9C in the last byte). Owned by the item menu manager, so menu state; exact meaning unknown |
| `0x450` | 20 | Item menu order (`Sav360::mF0`, initialised to 0..19) |
| `0x560` | 32 × 0x40 | Area flags, 512 bits per area |
| `0xD60` | 0x16 | Player name, UTF-16, up to 11 characters |
| `0xD76` | 1 | Hero Mode when non-zero |
| `0xD84`, `0xD8C`, `0xDA4` | | Minigame records, not identified yet |
| `0xD90` | 4 | Hyrule Hotfoot best time in frames (60 per second) |
| `0xDA5` | 1 | Minigame records; bit 0 = Hyrule Hotfoot under 75 s |
| `0xE00` | 20 × 0x38 | StreetPass opponents: u32 ID, name and title (UTF-16, 12 chars each), 4 flag bytes. Ships with 20 built-in "Shade" opponents |

### Item levels

Bytes from `0xC8` follow the inventory order: sword, shield, bombs, boomerang, bow, bow of light, hammer,
sand rod, fire rod, ice rod, tornado rod, hookshot, lamp, net, hint glasses, bell, scoot fruit, foul fruit,
five bottles (`0xDA`–`0xDE`), Ravio's bracelet (`0xDF`), the pendants of wisdom, power and courage (`0xE0`–`0xE2`), charm, flippers,
smooth gem, glove (`0xE6`, 3 = Titan's Mitt), mail (`0xE7`: 2 green, 3 blue, 4 red), Pegasus Boots, Bee Badge,
stamina scroll (`0xEE`) and pouch (`0xEF`).

For Ravio's items the value is 0 none, 1 rented, 2 owned, 3 Nice (upgraded by Mother Maiamai).
Lamp 3 is the Super Lamp and Net 3 the Super Net (Treacherous Tower Advanced, first and second clear).

### Flags

Flag *n* is bit `n & 7` of byte `base + (n >> 3)`:

- event flags: `base = 0x40`
- area flags: `base = 0x560 + area * 0x40`

Areas ("courses") use the game's numbering. Names are the game's internal course names, from
`game/src/courses.rs` in z17-randomizer. The last column says what the tracker reads from each area.

| Course | Internal name | Contents | Checks in the tracker |
|---|---|---|---|
| 0 | FieldLight | Hyrule overworld | Overworld chests, Hyrule Maiamai |
| 1 | FieldDark | Lorule overworld | Overworld chests, Lorule Maiamai, Zaganaga |
| 2 | IndoorLight | Hyrule houses and buildings | Kakariko Jail, Rosso (2), Woman, Hyrule Castle west wing |
| 3 | IndoorDark | Lorule houses and buildings | Stalblind |
| 4 | CaveLight | Hyrule caves | Cave chests, e.g. Kakariko Well (Bottom), Rosso Cave |
| 5 | CaveDark | Lorule caves | Swamp caves, Philosopher's Cave ore, Thief Girl |
| 6 | LanguageBoot | | none (z17 marks this number as unverified) |
| 7 | CrossBattle | | none |
| 8 | Demo | | none; `SaveData::init` saves a new file in this course |
| 9 | DungeonEast | Eastern Palace | dungeon chests |
| 10 | DungeonWind | House of Gales | dungeon chests |
| 11 | DungeonHera | Tower of Hera | dungeon chests |
| 12 | DungeonCastle | Hyrule Castle | none; its checks use courses 0 and 2 |
| 13 | DungeonDark | Dark Palace | dungeon chests |
| 14 | DungeonWater | Swamp Palace | dungeon chests |
| 15 | DungeonDokuro | Skull Woods | dungeon chests |
| 16 | DungeonHagure | Thieves' Hideout | dungeon chests |
| 17 | DungeonIce | Ice Ruins | dungeon chests |
| 18 | DungeonSand | Desert Palace | dungeon chests |
| 19 | DungeonKame | Turtle Rock | dungeon chests |
| 20 | DungeonGanon | Lorule Castle | dungeon chests |
| 21 | DungeonBoss | | none |
| 22 | AttractionLight | Hyrule mini-dungeons | Cucco, Merge, River, Flippers and Hookshot mini-dungeons |
| 23 | AttractionDark | Lorule mini-dungeons | Sand mini-dungeon, Pegasus Boots Pyramid, Philosopher's Cave ([LS]) chests |
| 24–26 | EnemyAttackS/M/L | Treacherous Tower | none; the tower is tracked with event flags |

Overworld flags at 0x100 and above are shared with the indoor and cave areas of the same world, so a check on
course 0 also looks at courses 2 and 4 (and 1 at 3 and 5).

Event and stage scripts refer to flags through a lookup table in the game code (`TRUE_FLAG_LUT` in z17-randomizer);
the numbers in `src/checks.js` are the stored bit indexes, after that table.

Known event flags:

| Flags | Meaning |
|---|---|
| 801–857 | Fissures used |
| 920–944 | Weather vanes activated |
| 956 / 957 / 958 | Treacherous Tower Beginner / Intermediate / Advanced cleared |
| 968–995 | The 28 Pieces of Heart (991 Octoball Derby, 993 Fortune's Choice, 994 Treacherous Tower) |
| 437–617 | Sage portraits (Gulley 437, Oren 473, Seres 505, Osfala 529, Rosso 557, Irene 581, Impa 617) |

The minigame flags are confirmed by the minigames' own event flowcharts (MSBF), whose "set event flag" actions use
969 (Hyrule Hotfoot), 980 (Rupee Rush, Hyrule), 987 (Rupee Rush, Lorule), 991 (Octoball Derby) and 994 plus 956–958
(Treacherous Tower). The best scores themselves are written by native code, not by the flowcharts.

### Things that look like data but aren't

- `0xF8`–`0x143` are floats for Link's position and camera when the game was saved.
- `0x1BC`–`0x23F` hold memory addresses (`0x14xxxxxx`–`0x17xxxxxx`). The game copies a runtime struct into the save
  without clearing them, so they change on every save and mean nothing.

### Hero Mode

Byte `0xD76`. The file select screen (`0x45DCB0` in the USA code) reads `slots + slot * 0x1604 + 0xD76` and shows
`T_FileNumber_Hard_00` instead of `T_FileNumber_00` when it is set. The Play Record screen (`0x474C0C`) reads the same
byte to pick its Hero Mode animation.

### Play Record

The screen after the credits (`Ed_PlayRecordT`) shows the name, "Total Rupees found", "Times defeated" and "Hero Mode"
(message labels `T_Rupe_00`, `T_GameOver_00`, `T_Mode_00` in `LanguageBoot.szs`). Those are `0x198`, `0x194` and `0xD76`.

### Who loads what

The slot loader (`0x4C3A70` in the USA code) hands each part of the save to the object that owns it. Useful for tracing
the remaining unknowns:

| Save range | Owner | Loader | Notes |
|---|---|---|---|
| `0x040`–`0x0BF` | flag manager (`*0x70B728` + 0x48) | memcpy | event flags |
| `0x0C0`–`0x25F` | player (`*0x711010`) | `0x1DBC94` | inventory, counters |
| `0x260`–`0x35F` | `*0x709F30` | `0x4C6A78` | `0x268` goes to field +0x598; two entries whose total cost must stay at or under 50 |
| `0x360`–`0x55F` | item menu (`*0x7142C8`) | `0x51C84C` | checks `0x450` is a permutation of 0..19 |
| `0x560`–`0xD5F` | area flags | memcpy | |
| `0xD80`–`0xDDF` | game state (`*0x70D858` + 0x10) | `0x1726E0` | minigame records; `0xD8C` is read by a minigame object on event 4 (`0x35D708`) |

## SaveCommon.bin

CRC-32 of `0x000`–`0x1FB` at `0x1FC`.

| Offset | Meaning |
|---|---|
| `0x04` | Last file played (0-based) |
| `0x08` | Bit *i* set when file *i* has beaten the game |

After the credits the game reloads the slot from before the final battle, so the slot itself never records the
win. `0x08` is the only place it shows up.
