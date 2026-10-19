// Usage: node tools/check-save.mjs <backup folder or game folder> [--all]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { groupBackups } from '../src/loader.js';
import { detect, isCleared, summarize } from '../src/save.js';
import CHECKS from '../src/checks.js';

const ALWAYS_LIST = ['story', 'equipment', 'heartPiece', 'heartContainer'];

const [dir, option] = process.argv.slice(2);
if (!dir) {
  console.error('Usage: node tools/check-save.mjs <save folder> [--all]');
  process.exit(1);
}

function walk(folder) {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const files = walk(dir).map((path) => ({ path: relative(dir, path), bytes: new Uint8Array(readFileSync(path)) }));
const { backups, errors } = groupBackups(files);
for (const error of errors) console.error(`skipped ${error}`);
if (!backups.length) {
  console.error('No save slots found.');
  process.exit(1);
}

const progressOf = (backup) => backup.slots.reduce(
  (sum, slot) => sum + CHECKS.filter((check) => detect(slot, check.rule, backup.common)).length, 0);
const latest = backups.reduce((best, backup) => (progressOf(backup) > progressOf(best) ? backup : best));
console.log(`Backup: ${latest.label}${backups.length > 1 ? ` (most progress of ${backups.length})` : ''}`);

for (const slot of latest.slots) {
  if (!slot.player) continue;
  const stats = summarize(slot);
  const beaten = isCleared(slot, latest.common) ? ' (beaten)' : '';
  const mode = slot.heroMode ? 'Hero Mode, ' : '';
  console.log(`\nFile ${slot.slot}: ${slot.player}${beaten}`);
  console.log(`  ${mode}saved at ${stats.area}; times defeated: ${stats.timesDefeated}; total rupees found: ${stats.totalRupees}`);

  const missing = CHECKS.filter((check) => check.rule && !detect(slot, check.rule, latest.common));
  for (const [cat, list] of Map.groupBy(missing, (check) => check.cat)) {
    const total = CHECKS.filter((check) => check.cat === cat).length;
    console.log(`  ${cat}: ${total - list.length}/${total}`);
    if (option === '--all' || ALWAYS_LIST.includes(cat)) {
      for (const check of list) console.log(`    - ${check.name} (${check.region})`);
    }
  }
}
