import CHECKS from './checks.js';
import { detect, isCleared, summarize } from './save.js';
import { entriesFromInput, entriesFromDrop, groupBackups, isSaveFile } from './loader.js';

const CATEGORIES = [
  { key: 'story', name: 'Story', plural: 'Story' },
  { key: 'equipment', name: 'Equipment', plural: 'Equipment' },
  { key: 'heartPiece', name: 'Piece of Heart', plural: 'Pieces of Heart' },
  { key: 'heartContainer', name: 'Heart Container', plural: 'Heart Containers' },
  { key: 'maiamai', name: 'Lost Maiamai', plural: 'Lost Maiamai' },
  { key: 'overworld', name: 'Overworld Treasure', plural: 'Overworld Treasure' },
  { key: 'dungeon', name: 'Dungeon Treasure', plural: 'Dungeon Treasure' },
  { key: 'minigame', name: 'Minigame', plural: 'Minigames' },
  { key: 'weatherVane', name: 'Weather Vane', plural: 'Weather Vanes' },
  { key: 'fissure', name: 'Fissure', plural: 'Fissures', optional: true },
];
const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((cat) => [cat.key, cat]));
const WORLD_ORDER = { Hyrule: 0, Lorule: 1, Dungeon: 2 };
const VIEW_DEFAULTS = { hideDone: false, group: 'category', world: 'all', countFissures: false };
const EXPORT_PREFIX = 'ALBW2:';

// localStorage throws in some private browsing modes; the page works without it.
const storage = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  clearAll() {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('albw.')) localStorage.removeItem(key);
      }
    } catch {}
  },
};

function pickView(saved) {
  const picked = {};
  for (const key of Object.keys(VIEW_DEFAULTS)) {
    if (saved && key in saved) picked[key] = saved[key];
  }
  return picked;
}

const view = { ...VIEW_DEFAULTS, search: '', ...pickView(storage.get('albw.view', {})) };
const openGroups = new Set(storage.get('albw.open', []));

const ticks = new Set(storage.get('albw.ticks', []));

let report = storage.get('albw.report', null);

let backups = [];
let backupIndex = 0;
let slotIndex = 0;

const $ = (selector) => document.querySelector(selector);
const isDone = (check) => ticks.has(check.id);
const percent = (done, total) => (total ? Math.floor((done / total) * 100) : 0);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

function currentBackup() {
  return backups[backupIndex] ?? null;
}

function currentSlot() {
  return currentBackup()?.slots[slotIndex] ?? null;
}

function saveTicks() {
  storage.set('albw.ticks', [...ticks]);
}

function saveOpenGroups() {
  storage.set('albw.open', [...openGroups]);
}

function setView(changes) {
  Object.assign(view, changes);
  storage.set('albw.view', view);
  syncControls();
}

// Checks the save can't track keep their tick.
function applySave(slot, common) {
  for (const check of CHECKS) {
    if (!check.rule) continue;
    if (detect(slot, check.rule, common)) ticks.add(check.id);
    else ticks.delete(check.id);
  }
  saveTicks();
}

function selectFile() {
  const backup = currentBackup();
  const slot = currentSlot();
  if (slot) {
    applySave(slot, backup.common);
    report = {
      player: slot.player,
      heroMode: slot.heroMode,
      cleared: isCleared(slot, backup.common),
      backup: backup.label,
      stats: summarize(slot),
    };
    storage.set('albw.report', report);
  }
  renderAll();
}

function progressOf(slot, common) {
  return CHECKS.filter((check) => detect(slot, check.rule, common)).length;
}

function mostProgressedSlot(backup) {
  let best = 0;
  backup.slots.forEach((slot, i) => {
    if (progressOf(slot, backup.common) > progressOf(backup.slots[best], backup.common)) best = i;
  });
  return best;
}

function mostProgressedBackup() {
  let best = 0;
  let bestScore = -1;
  backups.forEach((backup, i) => {
    const score = backup.slots.reduce((sum, slot) => sum + progressOf(slot, backup.common), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

function renderPickers() {
  if (!backups.length) {
    return `<p class="muted">From the last save you loaded: ${esc(report.player)}, backup ${esc(report.backup)}.
      Load the folder again to update it or switch files.</p>`;
  }
  const backup = currentBackup();
  const backupPicker = backups.length > 1
    ? `<div class="row">Backup: <select id="backup-select">${backups.map((b, i) =>
        `<option value="${i}" ${i === backupIndex ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select>
        <span class="muted">${backups.length} backups found</span></div>`
    : `<div class="row muted">Backup: ${esc(backup.label)}</div>`;
  const filePicker = backup.slots.map((slot, i) => {
    const label = `${slot.slot}. ${esc(slot.player || '(empty)')}${slot.heroMode ? ' (Hero Mode)' : ''}`;
    return `<label><input type="radio" name="slot" value="${i}" ${i === slotIndex ? 'checked' : ''}> ${label}</label>`;
  });
  return `${backupPicker}
    <div class="row slots">File: ${filePicker.join('')}</div>
    <p class="muted">The checklist below now matches this file. Anything the save doesn't record keeps your own tick.</p>`;
}

function renderSaveInfo() {
  const el = $('#save-info');
  if (!report) {
    el.innerHTML = '';
    return;
  }
  const { stats, cleared } = report;

  const hearts = '♥'.repeat(stats.hearts) + '♡'.repeat(Math.max(0, 20 - stats.hearts));
  const owned = [];
  const rented = [];
  for (const item of stats.items) {
    if (item.level >= 3) {
      const upgraded = { Lamp: 'Super Lamp', Net: 'Super Net' }[item.name] ?? `Nice ${item.name}`;
      owned.push(upgraded);
    } else if (item.level === 2) {
      owned.push(item.name);
    } else if (item.level === 1) {
      rented.push(item.name);
    }
  }
  const rentedNote = rented.length ? `<div class="muted">Rented, lost if you fall: ${esc(rented.join(', '))}</div>` : '';

  let mode = report.heroMode ? 'Hero Mode' : 'Normal';
  if (cleared) mode += ', beaten';
  if (cleared == null) mode += ' <span class="muted">(add SaveCommon.bin to see if it was beaten)</span>';

  const m = stats.maiamai;
  let maiamaiNote = '';
  if (m.waiting) {
    maiamaiNote = `<div><b>${plural(m.waiting, 'upgrade')} waiting</b>: ${m.onHand} on hand, bring them to Mother Maiamai</div>`;
  } else if (m.onHand) {
    maiamaiNote = `<div>${m.onHand} on hand</div>`;
  }

  const bottles = stats.bottles.length ? stats.bottles.map(esc).join(', ') : 'none';
  const hotfoot = stats.hotfootBest ? `best ${stats.hotfootBest.toFixed(2)} s` : '<span class="muted">not played</span>';
  const parts = stats.monsterParts;

  el.innerHTML = `${renderPickers()}
    <table class="save-info"><tbody>
      <tr><td>File</td><td>${esc(report.player)}</td></tr>
      <tr><td>Mode</td><td>${mode}</td></tr>
      <tr><td>Saved at</td><td>${esc(stats.area)} (${stats.world})</td></tr>
      <tr><td>Hearts</td><td>${stats.hearts} / 20 <span class="hearts">${hearts}</span> + ${stats.heartPieces}/4 pieces</td></tr>
      <tr><td>Rupees</td><td>${stats.rupees}</td></tr>
      <tr><td>Sword</td><td>${esc(stats.sword)}</td></tr>
      <tr><td>Mail</td><td>${esc(stats.mail)}</td></tr>
      <tr><td>Items</td><td>${esc(owned.join(', ') || 'none')}${rentedNote}</td></tr>
      <tr><td>Bottles</td><td>${stats.bottles.length} / 5: ${bottles}</td></tr>
      <tr><td>Maiamai</td><td>${m.found} / 100 found, ${m.handedIn} returned to Mother Maiamai, ${m.upgrades} / 9 Nice items${maiamaiNote}</td></tr>
      <tr><td>Monster parts</td><td>${parts.tails} tails, ${parts.guts} guts, ${parts.horns} horns</td></tr>
      <tr><td>Total Rupees found</td><td>${stats.totalRupees}</td></tr>
      <tr><td>Times defeated</td><td>${stats.timesDefeated}</td></tr>
      <tr><td>Hyrule Hotfoot</td><td>${hotfoot}</td></tr>
    </tbody></table>
    <div class="row"><button type="button" id="copy-summary">Copy summary</button><span class="muted" id="copy-status"></span></div>`;

  $('#backup-select')?.addEventListener('change', (e) => {
    backupIndex = Number(e.target.value);
    slotIndex = mostProgressedSlot(currentBackup());
    selectFile();
  });
  for (const radio of el.querySelectorAll('input[name="slot"]')) {
    radio.addEventListener('change', () => {
      slotIndex = Number(radio.value);
      selectFile();
    });
  }
  $('#copy-summary').addEventListener('click', copySummary);
}

function completionCounts() {
  let total = 0;
  let done = 0;
  const perCategory = CATEGORIES.map((cat) => {
    const checks = CHECKS.filter((check) => check.cat === cat.key);
    const doneHere = checks.filter(isDone).length;
    const counted = !cat.optional || view.countFissures;
    if (counted) {
      total += checks.length;
      done += doneHere;
    }
    return { cat, done: doneHere, total: checks.length, counted };
  });
  return { done, total, perCategory };
}

function summaryText() {
  const { stats } = report;
  const { done, total, perCategory } = completionCounts();
  const lines = [
    `A Link Between Worlds: ${report.player}${report.heroMode ? ' (Hero Mode)' : ''}${report.cleared ? ', beaten' : ''}`,
    `Completion: ${done} / ${total} (${percent(done, total)}%)`,
    ...perCategory.map((row) => `${row.cat.plural}: ${row.done} / ${row.total}`),
    `Hearts ${stats.hearts}/20, times defeated ${stats.timesDefeated}, rupees found ${stats.totalRupees}`,
  ];
  const missingPieces = CHECKS.filter((check) => check.cat === 'heartPiece' && !isDone(check));
  if (missingPieces.length) {
    lines.push(`Missing Pieces of Heart: ${missingPieces.map((check) => check.name).join(', ')}`);
  }
  return lines.join('\n');
}

async function copySummary() {
  const text = summaryText();
  const status = $('#copy-status');
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = 'Copied.';
  } catch {
    // The clipboard API isn't always available (e.g. plain http on another host), so show the text instead.
    status.innerHTML = `<textarea readonly rows="8" cols="60">${esc(text)}</textarea>`;
    status.querySelector('textarea').select();
  }
}

function renderCompletion() {
  const { done, total, perCategory } = completionCounts();
  $('#completion-title').textContent = `Completion: ${done} / ${total} (${percent(done, total)}%)`;
  $('#completion').innerHTML = `<tbody>${perCategory.map((row) => {
    const note = row.counted ? '' : ' <span class="muted">not counted</span>';
    return `<tr class="${row.counted ? '' : 'optional'}"><td>${row.done} / ${row.total}</td>
      <td><a href="#cat-${row.cat.key}" data-cat="${row.cat.key}">${row.cat.plural}</a> (${percent(row.done, row.total)}%)${note}</td></tr>`;
  }).join('')}</tbody>`;

  for (const link of $('#completion').querySelectorAll('a[data-cat]')) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = `cat-${link.dataset.cat}`;
      setView({ group: 'category' });
      openGroups.add(id);
      saveOpenGroups();
      renderLists();
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    });
  }
}

function groups() {
  if (view.group === 'category') {
    return CATEGORIES.map((cat) => ({
      id: `cat-${cat.key}`,
      title: cat.plural,
      checks: CHECKS.filter((check) => check.cat === cat.key),
    }));
  }
  const byRegion = new Map();
  for (const check of CHECKS) {
    if (!byRegion.has(check.region)) byRegion.set(check.region, { world: check.world, checks: [] });
    byRegion.get(check.region).checks.push(check);
  }
  return [...byRegion.entries()]
    .sort(([nameA, a], [nameB, b]) => WORLD_ORDER[a.world] - WORLD_ORDER[b.world] || nameA.localeCompare(nameB))
    .map(([region, group]) => ({
      id: `loc-${region.replace(/\W+/g, '-')}`,
      title: `${region} (${group.world})`,
      checks: group.checks,
    }));
}

function isVisible(check) {
  if (view.world !== 'all' && check.world !== view.world) return false;
  if (view.hideDone && isDone(check)) return false;
  if (view.search) {
    const text = `${check.name} ${check.item} ${check.region} ${check.note ?? ''}`.toLowerCase();
    if (!text.includes(view.search.toLowerCase())) return false;
  }
  return true;
}

function renderRow(check) {
  const done = isDone(check);
  const where = view.group === 'category' ? check.region : CATEGORY_BY_KEY[check.cat].name;
  const note = check.note ? `<div class="note">${esc(check.note)}</div>` : '';
  return `<tr class="${done ? 'done' : ''}">
    <td class="check"><input type="checkbox" ${done ? 'checked' : ''} data-id="${esc(check.id)}" aria-label="Mark ${esc(check.name)} as done"></td>
    <td><span class="name">${esc(check.name)}</span>${note}</td>
    <td class="where">${esc(where)}</td>
    <td>${esc(check.item)}</td></tr>`;
}

function groupTitle(group) {
  return `${group.title} (${group.checks.filter(isDone).length} / ${group.checks.length})`;
}

function renderLists() {
  const whereHeader = view.group === 'category' ? 'Location' : 'Type';
  const html = [];
  for (const group of groups()) {
    const shown = group.checks.filter(isVisible);
    if (!shown.length) continue;
    const isOpen = openGroups.has(group.id) || view.search;
    html.push(`<details id="${group.id}" ${isOpen ? 'open' : ''}>
      <summary><h2>${esc(groupTitle(group))}</h2></summary>
      <div class="list-wrap"><table class="list">
        <thead><tr><th></th><th>Name</th><th class="where">${whereHeader}</th><th>Reward</th></tr></thead>
        <tbody>${shown.map(renderRow).join('')}</tbody>
      </table></div></details>`);
  }
  $('#lists').innerHTML = html.join('') || '<p class="muted">Nothing to show with these settings.</p>';

  for (const details of $('#lists').querySelectorAll('details')) {
    details.addEventListener('toggle', () => {
      if (details.open) openGroups.add(details.id);
      else openGroups.delete(details.id);
      saveOpenGroups();
    });
  }
  for (const box of $('#lists').querySelectorAll('input[data-id]')) {
    box.addEventListener('change', () => {
      if (box.checked) ticks.add(box.dataset.id);
      else ticks.delete(box.dataset.id);
      saveTicks();
      box.closest('tr').classList.toggle('done', box.checked);
      const details = box.closest('details');
      const group = groups().find((g) => g.id === details.id);
      details.querySelector('summary h2').textContent = groupTitle(group);
      renderCompletion();
    });
  }
}

function renderAll() {
  renderSaveInfo();
  renderCompletion();
  renderLists();
}

function syncControls() {
  $('#hide-done').checked = view.hideDone;
  $('#count-fissures').checked = view.countFissures;
  for (const radio of document.querySelectorAll('input[name="group"]')) radio.checked = radio.value === view.group;
  for (const radio of document.querySelectorAll('input[name="world"]')) radio.checked = radio.value === view.world;
}

async function load(entries) {
  const files = await Promise.all(entries
    .filter((entry) => isSaveFile(entry.path))
    .map(async (entry) => ({ path: entry.path, bytes: new Uint8Array(await entry.file.arrayBuffer()) })));

  const { backups: found, errors } = groupBackups(files);
  const error = $('#error');
  if (!found.length) {
    error.textContent = errors.join(' ') || 'No save files found. Pick a folder containing Save_0.bin, Save_1.bin or Save_2.bin.';
    error.hidden = false;
    return;
  }
  error.textContent = errors.length ? `Skipped: ${errors.join(' ')}` : '';
  error.hidden = !errors.length;

  backups = found;
  backupIndex = mostProgressedBackup();
  slotIndex = mostProgressedSlot(currentBackup());
  selectFile();
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
}

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

async function exportState() {
  const json = JSON.stringify({ ticks: [...ticks], view: pickView(view) });
  const box = $('#state-text');
  box.value = EXPORT_PREFIX + toBase64(await gzip(json));
  box.select();
  $('#state-status').textContent = `${plural(ticks.size, 'tick')} and your settings. Copy the text to keep it.`;
}

async function importState() {
  const status = $('#state-status');
  const text = $('#state-text').value.trim();
  let state;
  try {
    if (!text.startsWith(EXPORT_PREFIX)) throw new Error('missing prefix');
    state = JSON.parse(await gunzip(fromBase64(text.slice(EXPORT_PREFIX.length))));
  } catch {
    status.textContent = "That text isn't an export from this tracker.";
    return;
  }
  const known = new Set(CHECKS.map((check) => check.id));
  ticks.clear();
  for (const id of state.ticks ?? []) {
    if (known.has(id)) ticks.add(id);
  }
  saveTicks();
  setView(pickView(state.view));
  renderAll();
  status.textContent = `Imported ${plural(ticks.size, 'tick')}.`;
}

function resetState() {
  if (!confirm('Erase all your ticks and settings from this browser? Export first if you want to keep them.')) return;
  storage.clearAll();
  ticks.clear();
  openGroups.clear();
  report = null;
  backups = [];
  Object.assign(view, VIEW_DEFAULTS, { search: '' });
  $('#search').value = '';
  syncControls();
  renderAll();
  $('#state-text').value = '';
  $('#state-status').textContent = 'Everything was reset.';
}

$('#pick-folder').addEventListener('change', (e) => {
  load(entriesFromInput(e.target.files));
  e.target.value = '';
});
$('#pick-files').addEventListener('change', (e) => {
  load(entriesFromInput(e.target.files));
  e.target.value = '';
});

$('#hide-done').addEventListener('change', (e) => {
  setView({ hideDone: e.target.checked });
  renderLists();
});
$('#count-fissures').addEventListener('change', (e) => {
  setView({ countFissures: e.target.checked });
  renderCompletion();
});
for (const radio of document.querySelectorAll('input[name="group"]')) {
  radio.addEventListener('change', () => {
    setView({ group: radio.value });
    renderLists();
  });
}
for (const radio of document.querySelectorAll('input[name="world"]')) {
  radio.addEventListener('change', () => {
    setView({ world: radio.value });
    renderLists();
  });
}

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    view.search = e.target.value.trim();
    renderLists();
  }, 150);
});

$('#expand-all').addEventListener('click', () => {
  for (const group of groups()) openGroups.add(group.id);
  saveOpenGroups();
  renderLists();
});
$('#collapse-all').addEventListener('click', () => {
  openGroups.clear();
  saveOpenGroups();
  renderLists();
});

$('#export-state').addEventListener('click', exportState);
$('#import-state').addEventListener('click', importState);
$('#reset-state').addEventListener('click', resetState);

// dragenter/dragleave fire for every child element, so count them to know when the drag really left the page.
const overlay = $('#drop-overlay');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  overlay.hidden = false;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth--;
  if (dragDepth <= 0) {
    dragDepth = 0;
    overlay.hidden = true;
  }
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  overlay.hidden = true;
  load(await entriesFromDrop(e.dataTransfer));
});

syncControls();
renderAll();
