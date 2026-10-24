import CHECKS from './checks.js';

export const CATEGORIES = [
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

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

export function groupChecks(grouping) {
  if (grouping === 'category') {
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

export function groupTitle(group, doneCount) {
  return `${group.title} (${doneCount} / ${group.checks.length})`;
}

function rowHtml(check, grouping, done) {
  const where = grouping === 'category' ? check.region : CATEGORY_BY_KEY[check.cat].name;
  const note = check.note ? `<div class="note">${esc(check.note)}</div>` : '';
  return `<tr class="${done ? 'done' : ''}">
    <td class="check"><input type="checkbox" ${done ? 'checked' : ''} data-id="${esc(check.id)}" aria-label="Mark ${esc(check.name)} as done"></td>
    <td><span class="name">${esc(check.name)}</span>${note}</td>
    <td class="where">${esc(where)}</td>
    <td>${esc(check.item)}</td></tr>`;
}

export function groupHtml(group, { grouping, shown, isDone, open }) {
  const whereHeader = grouping === 'category' ? 'Location' : 'Type';
  const doneCount = group.checks.filter(isDone).length;
  return `<details id="${group.id}" ${open ? 'open' : ''}>
      <summary><h2>${esc(groupTitle(group, doneCount))}</h2></summary>
      <div class="list-wrap"><table class="list">
        <thead><tr><th></th><th>Name</th><th class="where">${whereHeader}</th><th>Reward</th></tr></thead>
        <tbody>${shown.map((check) => rowHtml(check, grouping, isDone(check))).join('')}</tbody>
      </table></div></details>`;
}
