// Writes the checklist into index.html so the page has its content without JavaScript.
// main.js replaces it with the interactive version on load.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupChecks, groupHtml } from '../src/render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- prerender:start -->';
const END = '<!-- prerender:end -->';

const groups = groupChecks('category');
const html = groups
  .map((group) => groupHtml(group, { grouping: 'category', shown: group.checks, isDone: () => false, open: false }))
  .join('\n');

const file = join(ROOT, 'index.html');
const page = readFileSync(file, 'utf8');
const start = page.indexOf(START);
const end = page.indexOf(END);
if (start < 0 || end < start) throw new Error(`index.html needs ${START} and ${END}`);
writeFileSync(file, `${page.slice(0, start + START.length)}\n${html}\n${page.slice(end)}`);

const checkCount = groups.reduce((n, group) => n + group.checks.length, 0);
console.log(`Prerendered ${checkCount} checks into index.html`);
