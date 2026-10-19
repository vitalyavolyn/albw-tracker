// A backup is one folder with Save_0.bin to Save_2.bin and usually SaveCommon.bin, as Checkpoint exports them.

import { parseSlot, parseCommon } from './save.js';

const SLOT_RE = /(^|\/)Save_[0-2]\.bin$/i;
const COMMON_RE = /(^|\/)SaveCommon\.bin$/i;

export function isSaveFile(path) {
  return SLOT_RE.test(path) || COMMON_RE.test(path);
}

export function entriesFromInput(fileList) {
  return [...fileList].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}

export async function entriesFromDrop(dataTransfer) {
  const roots = [...dataTransfer.items].map((item) => item.webkitGetAsEntry()).filter(Boolean);
  if (!roots.length) return entriesFromInput(dataTransfer.files);

  const entries = [];
  async function visit(entry) {
    if (entry.isFile) {
      if (!isSaveFile(entry.fullPath)) return;
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      entries.push({ path: entry.fullPath.replace(/^\//, ''), file });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const nextBatch = () => new Promise((resolve, reject) => reader.readEntries(resolve, reject));
      // readEntries returns results in batches until it returns an empty array.
      let batch;
      while ((batch = await nextBatch()).length) {
        for (const child of batch) await visit(child);
      }
    }
  }
  for (const root of roots) await visit(root);
  return entries;
}

export function groupBackups(files) {
  const byDir = new Map();
  const errors = [];

  for (const { path, bytes } of files) {
    const cut = path.lastIndexOf('/');
    const dir = cut < 0 ? '' : path.slice(0, cut);
    const name = path.slice(cut + 1);
    if (!byDir.has(dir)) byDir.set(dir, { dir, slots: [], common: null });
    const backup = byDir.get(dir);
    try {
      if (COMMON_RE.test(name)) backup.common = parseCommon(name, bytes);
      else if (SLOT_RE.test(name)) backup.slots.push(parseSlot(name, bytes));
    } catch (e) {
      errors.push(`${path}: ${e.message}`);
    }
  }

  const backups = [...byDir.values()].filter((backup) => backup.slots.length);
  backups.sort((a, b) => a.dir.localeCompare(b.dir));
  for (const backup of backups) {
    backup.slots.sort((a, b) => a.slot - b.slot);
    backup.label = labelFor(backup.dir, backups);
  }
  return { backups, errors };
}

function labelFor(dir, backups) {
  const name = dir.split('/').pop();
  if (!name) return 'Selected files';
  const sameName = backups.filter((other) => other.dir.split('/').pop() === name);
  return sameName.length > 1 ? dir : name;
}
