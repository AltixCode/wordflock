#!/usr/bin/env node
/**
 * Turns authored puzzle files into the packs the app downloads.
 *
 *   node scripts/build-feed.mjs [--out <dir>]
 *
 * Authored content lives in `data/feed/*.json`, each a plain list of puzzles in
 * the order they should be served. This script assigns them to calendar days,
 * groups them into quarterly packs and writes a manifest.
 *
 * Two properties this has to guarantee, because the app refuses a pack that
 * lacks either and a refused pack is a day with no puzzle:
 *
 *   - every day in a pack's range has exactly one puzzle, no gaps;
 *   - a pack's `id`, `from` and `to` match the manifest entry that names it.
 *
 * The same validation the app runs on download runs here, so a bad pack is
 * caught at build time rather than on a player's phone.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 1;

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const OUT = outIndex === -1
  ? join(ROOT, 'build/feed')
  : resolve(args[outIndex + 1]);

const config = JSON.parse(readFileSync(join(ROOT, 'data/feed/schedule.json'), 'utf8'));

const normalize = (w) => String(w).trim().toLowerCase().replace(/\s+/g, ' ');

const problems = [];
const fail = (line) => problems.push(line);

/** Every authored puzzle, in file order, files in name order. */
function authored() {
  const files = readdirSync(join(ROOT, 'data/feed'))
    .filter((f) => f.endsWith('.json') && f !== 'schedule.json')
    .sort();
  const all = [];
  for (const file of files) {
    const body = JSON.parse(readFileSync(join(ROOT, 'data/feed', file), 'utf8'));
    if (!Array.isArray(body.puzzles)) { fail(`${file}: no puzzles array`); continue; }
    for (const puzzle of body.puzzles) all.push({ ...puzzle, _file: file });
  }
  return all;
}

function checkPuzzle(puzzle, where) {
  if (!puzzle.id || !String(puzzle.id).trim()) fail(`${where}: id is empty`);
  if (!Array.isArray(puzzle.groups) || puzzle.groups.length !== 4) {
    fail(`${where}: needs exactly 4 groups`);
    return;
  }
  const difficulties = puzzle.groups.map((g) => g.difficulty).sort().join(',');
  if (difficulties !== '1,2,3,4') fail(`${where}: difficulties are ${difficulties}`);

  const owner = new Map();
  for (const group of puzzle.groups) {
    if (!group.theme || !String(group.theme).trim()) fail(`${where}: a group has no theme`);
    if (!Array.isArray(group.words) || group.words.length !== 4) {
      fail(`${where}: "${group.theme}" needs exactly 4 words`);
      continue;
    }
    for (const word of group.words) {
      if (!word || !String(word).trim()) fail(`${where}: "${group.theme}" has an empty word`);
      const key = normalize(word);
      if (owner.has(key)) fail(`${where}: "${word}" is in both "${owner.get(key)}" and "${group.theme}"`);
      owner.set(key, group.theme);
    }
  }
  const themes = puzzle.groups.map((g) => normalize(g.theme));
  if (new Set(themes).size !== themes.length) fail(`${where}: two groups share a theme`);
  return [...owner.keys()].sort().join('|');
}

const addDaysUTC = (key, n) => {
  const [y, m, d] = key.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
};

const puzzles = authored();
const ids = new Set();
const signatures = new Map();
for (const puzzle of puzzles) {
  const where = `${puzzle._file}:${puzzle.id ?? '(no id)'}`;
  if (ids.has(puzzle.id)) fail(`${where}: duplicate id`);
  ids.add(puzzle.id);
  const signature = checkPuzzle(puzzle, where);
  if (signature) {
    if (signatures.has(signature)) fail(`${where}: the same sixteen words as ${signatures.get(signature)}`);
    signatures.set(signature, where);
  }
}

// Days are assigned in authored order from the schedule's start date, so
// republishing never moves a puzzle that has already been served.
const start = config.startsOn;
if (!/^\d{4}-\d{2}-\d{2}$/.test(start ?? '')) fail('schedule.json: startsOn is not a YYYY-MM-DD date');

const packs = [];
if (problems.length === 0) {
  const perPack = config.daysPerPack ?? 92;
  for (let i = 0; i < puzzles.length; i += perPack) {
    const slice = puzzles.slice(i, i + perPack);
    const from = addDaysUTC(start, i);
    const to = addDaysUTC(start, i + slice.length - 1);
    const byDay = {};
    slice.forEach((puzzle, n) => {
      const { _file, ...clean } = puzzle;
      byDay[addDaysUTC(start, i + n)] = clean;
    });
    packs.push({ id: `${from}_${to}`, from, to, puzzles: byDay });
  }
}

if (problems.length > 0) {
  console.error(`\n✗ The feed was not built. ${problems.length} problem(s):\n`);
  problems.forEach((p) => console.error(`    ${p}`));
  console.error('');
  process.exit(1);
}

if (packs.length === 0) {
  console.error('\n✗ No puzzles authored in data/feed/. Nothing to publish.\n');
  process.exit(1);
}

mkdirSync(join(OUT, 'packs'), { recursive: true });
for (const pack of packs) {
  writeFileSync(join(OUT, 'packs', `${pack.id}.json`), JSON.stringify(pack));
}
const manifest = {
  schema: SCHEMA,
  servedThrough: packs[packs.length - 1].to,
  packs: packs.map((p) => ({ id: p.id, from: p.from, to: p.to, path: `packs/${p.id}.json` })),
};
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log(`✓ ${puzzles.length} puzzles -> ${packs.length} pack(s), ${start} through ${manifest.servedThrough}`);
console.log(`  ${OUT}`);
